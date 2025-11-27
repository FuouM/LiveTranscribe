export class Transcriber {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.workers = [];
    this.workerConfigs = {}; // Store configs for restarting workers
    this.segments = []; // { start, end, text, level }
    this.currentPartial = "";
    this.isInitialized = false;
    this.enabledLayers = [1, 2, 3, 4]; // Default all enabled
    this.initializeTimingStats();

    // Track tokens from each layer for speculative decoding
    this.layerTokens = {
      1: null, // L1 tokens (draft for L2)
      2: null, // L2 tokens (draft for L3)
      3: null, // L3 tokens (draft for L4)
      4: null, // L4 tokens (ground truth)
    };
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

  async init(
    language,
    backend,
    model,
    enabledLayers = [1, 2, 3, 4],
    quant = null
  ) {
    if (this.isInitialized) return;

    // Update enabled layers and reinitialize timing stats
    this.enabledLayers = enabledLayers;
    this.initializeTimingStats();

    // Define configurations for the multi-agent swarm
    // Level 1: Fast, speculative (Word level/Continuous) - Low beam search
    // Level 2: 5s chunks - Medium beam search
    // Level 3: 10s chunks - Medium beam search
    // Level 4: 20s chunks (Ground Truth) - Full beam search
    const allConfigs = [
      {
        level: 1,
        mode: "continuous",
        stepSize: 1.0,
        generationParams: {
          num_beams: 1,
          do_sample: false,
          early_stopping: true,
        },
      },
      {
        level: 2,
        mode: "chunk",
        chunkSize: 5,
        generationParams: {
          num_beams: 2,
          do_sample: false,
          early_stopping: true,
        },
      },
      {
        level: 3,
        mode: "chunk",
        chunkSize: 10,
        generationParams: {
          num_beams: 3,
          do_sample: false,
          early_stopping: true,
        },
      },
      {
        level: 4,
        mode: "chunk",
        chunkSize: 20,
        generationParams: {
          num_beams: 5,
          do_sample: false,
          early_stopping: true,
        },
      },
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

      // Store configuration for potential restart
      const workerConfig = {
        config,
        language,
        backend: backend || "webgpu",
        model,
        quant,
      };
      this.workerConfigs[config.level] = workerConfig;

      worker.onmessage = (e) => this.handleWorkerMessage(e.data, worker);
      worker.onerror = (error) => this.handleWorkerError(error, worker);

      worker.postMessage({ type: "configure", config });
      worker.postMessage({
        type: "init",
        language,
        backend: backend || "webgpu",
        model,
        quant,
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

    // Broadcast audio to all workers with draft tokens for speculative decoding
    this.workers.forEach((w) => {
      w.lastAudioTimestamp = timestamp; // Track when audio was sent

      // Determine draft tokens for this worker (from previous layer)
      // REMOVED: We no longer send draft tokens with audio chunks to avoid misalignment
      // Draft tokens are now sent asynchronously via 'draft_tokens' message type

      w.postMessage({
        type: "audio",
        data: audioChunk, // Structured clone
        metadata,
        // draftTokens: draftTokens, // REMOVED
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

      // Update speculative decoding stats if available
      if (data.specStats) {
        const stats = this.timingStats[data.level];
        // Initialize spec stats if not present
        if (!stats.specStats) {
          stats.specStats = {
            totalHits: 0,
            totalDrafts: 0,
            hitRate: 0,
          };
        }

        stats.specStats.totalHits += data.specStats.verifiedCount;
        stats.specStats.totalDrafts += data.specStats.totalCount;
        stats.specStats.hitRate =
          stats.specStats.totalDrafts > 0
            ? stats.specStats.totalHits / stats.specStats.totalDrafts
            : 0;

        console.log(
          `[Transcriber L${data.level}] Spec Stats: ${
            data.specStats.verifiedCount
          }/${data.specStats.totalCount} hits (${(
            data.specStats.hitRate * 100
          ).toFixed(1)}%)`
        );
      }

      // Store tokens for speculative decoding (Phase 2)
      if (data.tokens && data.level) {
        this.layerTokens[data.level] = data.tokens;
        console.log(
          `[Transcriber] Stored ${data.tokens.length} tokens from L${data.level}`
        );

        // Only forward tokens from L1 to L2 (disable speculative decoding for L2->L3 and L3->L4)
        const nextLevel = data.level + 1;
        if (nextLevel === 2) {
          // Only allow L1 -> L2 speculative decoding
          const nextWorker = this.workers.find((w) => w.level === nextLevel);
          if (nextWorker) {
            console.log(
              `[Transcriber] Forwarding draft tokens to L${nextLevel}`
            );
            nextWorker.postMessage({
              type: "draft_tokens",
              tokens: data.tokens,
            });
          }
        }
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

        // Store tokens from L1 partials (Phase 2)
        if (data.tokens) {
          this.layerTokens[1] = data.tokens;
          // console.log(`[Transcriber] Stored ${data.tokens.length} tokens from L1 (partial)`);

          // NEW: Forward these tokens to L2 immediately
          const l2Worker = this.workers.find((w) => w.level === 2);
          if (l2Worker) {
            // console.log(`[Transcriber] Forwarding partial draft tokens to L2`);
            l2Worker.postMessage({
              type: "draft_tokens",
              tokens: data.tokens,
            });
          }
        }

        this.currentPartial = data.text;
        this.emitUpdate();
      }
    } else if (data.type === "status") {
      // Forward status (maybe debounced or selectively)
      // console.log(data.text);
    }
  }

  handleWorkerError(error, worker) {
    const level = worker.level;
    console.error(`[Transcriber] Worker L${level} error:`, error);

    // Log the specific error we're handling
    if (error.message) {
      console.warn(
        `[Transcriber] Detected error 13614224 in Worker L${level}, restarting...`
      );
    }

    // Restart the worker
    this.restartWorker(level);
  }

  async restartWorker(level) {
    console.log(`[Transcriber] Restarting Worker L${level}...`);

    // Find and terminate the old worker
    const oldWorkerIndex = this.workers.findIndex((w) => w.level === level);
    if (oldWorkerIndex >= 0) {
      this.workers[oldWorkerIndex].terminate();
      this.workers.splice(oldWorkerIndex, 1);
    }

    // Get the stored configuration
    const config = this.workerConfigs[level];
    if (!config) {
      console.error(
        `[Transcriber] No configuration found for Worker L${level}, cannot restart`
      );
      return;
    }

    try {
      // Create new worker with same configuration
      const worker = new Worker(
        new URL("./workers/inference.worker.js", import.meta.url),
        { type: "module" }
      );

      worker.level = level;
      worker.onmessage = (e) => this.handleWorkerMessage(e.data, worker);
      worker.onerror = (error) => this.handleWorkerError(error, worker);

      worker.postMessage({ type: "configure", config: config.config });
      worker.postMessage({
        type: "init",
        language: config.language,
        backend: config.backend,
        model: config.model,
        quant: config.quant,
      });

      // Add to workers array
      this.workers.push(worker);

      console.log(`[Transcriber] Worker L${level} restarted successfully`);
      this.onMessage({
        type: "status",
        text: `Worker L${level} restarted successfully`,
      });
    } catch (error) {
      console.error(`[Transcriber] Failed to restart Worker L${level}:`, error);
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

  async loadModel(
    language,
    backend,
    model,
    enabledLayers = [1, 2, 3, 4],
    quant = null
  ) {
    // If already loaded, no need to reload
    if (this.isInitialized) return;

    return this.init(language, backend, model, enabledLayers, quant);
  }

  async unloadModel() {
    // If not loaded, no need to unload
    if (!this.isInitialized) return;

    await this.stop();
  }

  async stop() {
    // Terminate all workers
    this.workers.forEach((w) => w.terminate());
    this.workers = [];
    this.isInitialized = false;

    // Reset timing stats for enabled layers
    this.initializeTimingStats();
  }
}
