export class Transcriber {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.workers = [];
    this.segments = []; // { start, end, text, level }
    this.currentPartial = "";
    this.isInitialized = false;
    this.enabledLayers = [1, 2, 3, 4]; // Default all enabled
    this.initializeTimingStats();
  }

  initializeTimingStats() {
    this.timingStats = {};
    this.enabledLayers.forEach((level) => {
      this.timingStats[level] = {
        totalTime: 0,
        count: 0,
        lastTime: 0,
        averageTime: 0,
      };
    });
  }

  async init(language, backend, model, enabledLayers = [1, 2, 3, 4]) {
    if (this.isInitialized) return;

    // Update enabled layers and reinitialize timing stats
    this.enabledLayers = enabledLayers;
    this.initializeTimingStats();

    // Define configurations for the multi-agent swarm
    // Level 1: Fast, speculative (Word level/Continuous)
    // Level 2: 5s chunks
    // Level 3: 10s chunks
    // Level 4: 20s chunks (Ground Truth)
    const allConfigs = [
      { level: 1, mode: "continuous", stepSize: 1.0 },
      { level: 2, mode: "chunk", chunkSize: 5 },
      { level: 3, mode: "chunk", chunkSize: 10 },
      { level: 4, mode: "chunk", chunkSize: 20 },
    ];

    // Filter configs based on enabled layers
    const configs = allConfigs.filter((config) =>
      enabledLayers.includes(config.level)
    );

    const enabledCount = configs.length;
    this.onMessage({
      type: "status",
      text: `Initializing ${enabledCount}-Worker Swarm...`,
    });

    const initPromises = configs.map(async (config) => {
      const worker = new Worker(
        new URL("./workers/inference.worker.js", import.meta.url),
        { type: "module" }
      );

      worker.level = config.level; // Store level for timing tracking
      worker.onmessage = (e) => this.handleWorkerMessage(e.data, worker);

      worker.postMessage({ type: "configure", config });
      worker.postMessage({
        type: "init",
        language,
        backend: backend || "webgpu",
        model,
      });

      return worker;
    });

    this.workers = await Promise.all(initPromises);
    this.isInitialized = true;
    this.onMessage({ type: "status", text: "Multi-Agent Swarm Ready" });
  }

  process(audioChunk, metadata) {
    if (!this.isInitialized) return;

    const timestamp = performance.now();

    // Broadcast audio to all workers
    // Note: We might want to clone audioChunk if transferables are used,
    // but Float32Array copy is cheap enough for 4 workers.
    this.workers.forEach((w) => {
      w.lastAudioTimestamp = timestamp; // Track when audio was sent
      w.postMessage({
        type: "audio",
        data: audioChunk, // Structured clone
        metadata,
      });
    });
  }

  handleWorkerMessage(data, worker) {
    if (data.type === "segment") {
      // Use inference time from worker for chunk-based processing
      if (data.inferenceTime) {
        // Update timing stats
        const stats = this.timingStats[data.level];
        stats.totalTime += data.inferenceTime;
        stats.count += 1;
        stats.lastTime = data.inferenceTime;
        stats.averageTime = stats.totalTime / stats.count;
      }
      this.mergeSegment(data);
    } else if (data.type === "partial") {
      // Only L1 sends partials in continuous mode
      if (data.text) {
        // Track timing for L1 partials using inference time
        if (data.inferenceTime) {
          // Update timing stats for L1
          const stats = this.timingStats[1]; // L1 always sends partials
          stats.totalTime += data.inferenceTime;
          stats.count += 1;
          stats.lastTime = data.inferenceTime;
          stats.averageTime = stats.totalTime / stats.count;
        }
        this.currentPartial = data.text;
        this.emitUpdate();
      }
    } else if (data.type === "status") {
      // Forward status (maybe debounced or selectively)
      // console.log(data.text);
    }
  }

  mergeSegment(newSegment) {
    // newSegment: { start, end, text, level }

    // 1. Remove overlapping segments of lower/equal level
    // We keep segments that are strictly BETTER (higher level)
    // Or if equal level, we assume newer is better?
    // Actually, "Chunk" mode produces sequential chunks.
    // If L2 produces [0-5], then L2 produces [5-10]. They don't overlap.
    // If L4 produces [0-20], it overlaps L2[0-5], L2[5-10], L2[10-15], L2[15-20].
    // L4 (Level 4) > L2 (Level 2). L4 wins.

    this.segments = this.segments.filter((s) => {
      // Skip separators in overlap filtering - they should always be preserved
      if (s.isSeparator) {
        return true;
      }

      // Check overlap
      const startMax = Math.max(s.start, newSegment.start);
      const endMin = Math.min(s.end, newSegment.end);
      const overlap = endMin - startMax;

      if (overlap > 0.1) {
        // Significant overlap
        // If existing segment is higher level, we keep it (reject new one)
        // If new segment is higher level, we drop existing (keep new one)
        // If equal, replace (assuming correction/update)
        if (s.level > newSegment.level) {
          // Existing is Ground Truth vs New Weakling. Keep Existing.
          // Wait, if we return true here, we keep 's'.
          // But we also push 'newSegment' later?
          // No, we should NOT push newSegment if we have a better one.
          return true;
        } else {
          // Existing is weaker. Drop it.
          return false;
        }
      }
      return true; // No overlap, keep.
    });

    // Check if we should add the new segment
    // If we found a conflict where existing was better, we should NOT add newSegment.
    // Let's do a check first.
    const coveredByBetter = this.segments.some((s) => {
      // Skip separators in coverage check
      if (s.isSeparator) {
        return false;
      }
      const startMax = Math.max(s.start, newSegment.start);
      const endMin = Math.min(s.end, newSegment.end);
      const overlap = endMin - startMax;
      return overlap > 0.1 && s.level > newSegment.level;
    });

    if (!coveredByBetter) {
      this.segments.push(newSegment);
      // Sort by start time
      this.segments.sort((a, b) => a.start - b.start);
      this.emitUpdate();
    }
  }

  emitUpdate() {
    // Construct the display data
    this.onMessage({
      type: "full_transcript",
      segments: this.segments,
      partial: this.currentPartial,
      timingStats: this.timingStats,
    });
  }

  commitAndReset() {
    // In continuous stream, we might not need explicit commit/reset unless stop.
    // But if the user pauses?
    this.workers.forEach((w) => w.postMessage({ type: "commit" }));

    // Add a separator segment instead of clearing all segments
    if (this.segments.length > 0) {
      this.segments.push({
        start: this.segments[this.segments.length - 1].end,
        end: this.segments[this.segments.length - 1].end,
        text: "---",
        level: 0, // Special separator level
        isSeparator: true,
      });
    }

    this.currentPartial = "";

    // Reset timing stats for enabled layers
    this.initializeTimingStats();

    this.emitUpdate();
  }

  stop() {
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
    this.isInitialized = false;

    // Reset timing stats for enabled layers
    this.initializeTimingStats();
  }
}
