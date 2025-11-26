import { pipeline, env } from "@huggingface/transformers";

// Configure environment
env.allowRemoteModels = true;
// Configure ONNX runtime for WASM
env.backends.onnx.wasm.numThreads = 1;

let transcriber = null;
let audioBuffer = new Float32Array(0);
let isProcessing = false;
let processedSamples = 0;
let language = "en";
let backend = "webgpu";
let modelName = "Xenova/whisper-tiny";

// Default Configuration
let config = {
  mode: "legacy", // 'legacy', 'continuous', 'chunk'
  chunkSize: 5, // seconds (for chunk mode)
  stepSize: 1, // seconds (for continuous mode trigger)
  level: 0,
};

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === "configure") {
    config = { ...config, ...e.data.config };
    console.log(`[Worker L${config.level}] Configured:`, config);
  } else if (type === "init") {
    language = e.data.language;
    backend = e.data.backend || "webgpu";
    modelName = e.data.model || "Xenova/whisper-tiny";
    if (e.data.config) config = { ...config, ...e.data.config };
    await initModel();
  } else if (type === "audio") {
    // Append new audio data
    const newBuffer = new Float32Array(audioBuffer.length + data.length);
    newBuffer.set(audioBuffer);
    newBuffer.set(data, audioBuffer.length);
    audioBuffer = newBuffer;

    checkProcessing();
  } else if (type === "commit") {
    // Reset audio buffer but keep timestamp continuity to avoid overlap issues
    audioBuffer = new Float32Array(0);
    // Don't reset processedSamples - keep timestamp continuity
    self.postMessage({ type: "reset" });
  }
};

async function initModel() {
  const id = config.level ? `[Worker L${config.level}]` : "[Worker]";
  self.postMessage({ type: "status", text: `${id} Loading model...` });

  try {
    // Configure ONNX runtime based on backend
    if (backend === "wasm") {
      // Ensure WASM-specific configuration
      env.backends.onnx.wasm.numThreads = 1;
      // Point to the WASM file in the public directory
      env.backends.onnx.wasm.wasmPaths = {
        "ort-wasm-simd-threaded.wasm": "/ort-wasm-simd-threaded.wasm",
      };
    }

    // Use selected Whisper model
    transcriber = await pipeline("automatic-speech-recognition", modelName, {
      device: backend,
    });
    console.log(`${id} Model loaded with ${backend.toUpperCase()}`);
    self.postMessage({ type: "status", text: `${id} Ready` });
  } catch (err) {
    console.error(`${id} Backend ${backend} failed:`, err.message);
    if (backend !== "wasm") {
      console.warn(`${id} Backend ${backend} failed, trying WASM fallback`);
      try {
        // Fallback to WASM
        env.backends.onnx.wasm.numThreads = 1;
        env.backends.onnx.wasm.wasmPaths = {
          "ort-wasm-simd-threaded.wasm": "/ort-wasm-simd-threaded.wasm",
        };
        transcriber = await pipeline(
          "automatic-speech-recognition",
          modelName,
          {
            device: "wasm",
          }
        );
        self.postMessage({
          type: "status",
          text: `${id} Ready (WASM fallback)`,
        });
      } catch (wasmErr) {
        console.error(`${id} WASM fallback also failed:`, wasmErr.message);
        throw new Error(
          `All backends failed. Primary: ${err.message}, WASM: ${wasmErr.message}`
        );
      }
    } else {
      // WASM was selected but failed
      throw new Error(`WASM backend failed: ${err.message}`);
    }
  }
}

function checkProcessing() {
  if (isProcessing || !transcriber) return;

  const sampleRate = 16000;

  if (config.mode === "continuous") {
    // L1: Process if buffer > 1s
    // Use stepSize to control frequency
    if (audioBuffer.length >= sampleRate * config.stepSize) {
      processContinuous();
    }
  } else if (config.mode === "chunk") {
    // L2-L4: Process if buffer >= chunkSize
    if (audioBuffer.length >= sampleRate * config.chunkSize) {
      processChunk();
    }
  }
}

async function processChunk() {
  isProcessing = true;
  const processingStartTime = performance.now();
  const id = `[Worker L${config.level}]`;
  const sampleRate = 16000;

  try {
    const chunkSamples = Math.floor(config.chunkSize * sampleRate);
    // Get the chunk
    const bufferToProcess = audioBuffer.slice(0, chunkSamples);

    // Process
    const output = await transcriber(bufferToProcess, {
      language: language === "auto" ? null : language,
      task: "transcribe",
    });

    const processingEndTime = performance.now();
    const inferenceTime = processingEndTime - processingStartTime;

    const text = output.text || "";
    const start = processedSamples / sampleRate;
    const end = (processedSamples + chunkSamples) / sampleRate;

    // For chunk mode, we essentially confirm "this is what happened in this time"
    // So we send it even if empty (to clear any previous noisy guesses)
    // For continuous/legacy, we might filter.
    if (config.mode === "chunk" || text.trim()) {
      if (text.trim())
        console.log(
          `${id} Segment [${start.toFixed(1)}-${end.toFixed(
            1
          )}]: ${text.trim()}`
        );
      self.postMessage({
        type: "segment",
        text: text.trim(),
        start: start,
        end: end,
        level: config.level,
        inferenceTime: inferenceTime,
        chunkDuration: config.chunkSize,
      });
    }

    // Shift buffer
    audioBuffer = audioBuffer.slice(chunkSamples);
    processedSamples += chunkSamples;
  } catch (e) {
    console.error(`${id} Error:`, e);
  } finally {
    isProcessing = false;
    // Check if we can process more immediately
    setTimeout(() => checkProcessing(), 0);
  }
}

async function processContinuous() {
  isProcessing = true;
  const processingStartTime = performance.now();
  const id = `[Worker L${config.level}]`;

  try {
    // For continuous (L1), we process the last 3 seconds (or less if start)
    const maxSamples = 16000 * 3;
    let bufferToProcess = audioBuffer;
    if (bufferToProcess.length > maxSamples) {
      bufferToProcess = bufferToProcess.slice(
        bufferToProcess.length - maxSamples
      );
    }

    const output = await transcriber(bufferToProcess, {
      language: language === "auto" ? null : language,
      task: "transcribe",
    });

    const processingEndTime = performance.now();
    const inferenceTime = processingEndTime - processingStartTime;

    const text = output.text.trim();
    if (text) {
      self.postMessage({
        type: "partial",
        text: text,
        level: 1,
        inferenceTime: inferenceTime,
      });
    }

    // Trim buffer, keeping last 1s of context to ensure overlap/continuity
    // This also ensures audioBuffer.length drops below stepSize so we wait for new data
    const contextSamples = 16000 * 1;
    if (audioBuffer.length > contextSamples) {
      audioBuffer = audioBuffer.slice(audioBuffer.length - contextSamples);
    }
  } catch (e) {
    console.error(`${id} Error:`, e);
  } finally {
    isProcessing = false;
    // For continuous, we wait for more audio (controlled by AudioProcessor sending data)
    // We don't self-trigger loop unless audio is pending.
    // But AudioProcessor sends 4096 chunks.
    // We only trigger if we have enough new data?
    // `checkProcessing` handles `length >= stepSize`.
    // But `audioBuffer` length might stay high if we don't shift.
    // We need to know "when did we last process".
    // Simple hack: Clear buffer partially?
    // No, if we clear partially, `length` drops.
    // If we just slice `last 5s`, the `length` is 5s.
    // `checkProcessing` sees 5s > 1s, triggers again? Yes.
    // We need to pause until NEW data comes.
    // `isProcessing` handles lock.
    // But once finished, if buffer is still > 1s, it triggers again immediately.
    // We should only process when *enough* NEW data arrived.
    // Let's just set buffer to empty after continuous process?
    // If we set to empty, we lose context for next word.
    // Whisper needs context.
    // Correct logic: Keep buffer. Only process if *time since last process* > 1s?
    // Or track `lastProcessedTime`.
  }
}
