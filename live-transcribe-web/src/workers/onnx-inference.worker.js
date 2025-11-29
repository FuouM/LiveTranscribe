import { OnnxWhisper } from "../libs/onnx-whisper.js";

// Global inference instances - L0 isolated, L1-4 shared
let whisperInstances = {};
let config = {};
let pendingConfig = null;

/**
 * Get session key for whisper instance
 * L0: isolated session
 * L1-4: shared session
 */
function getSessionKey(level) {
  return level === 0 ? "l0" : "l1-4";
}

// Timestamp tracking for proper segment timestamps
let processedSamples = 0;

/**
 * Message handler
 */
self.onmessage = async (e) => {
  const { type, data, tokens } = e.data;

  try {
    switch (type) {
      case "configure":
        pendingConfig = e.data.config;
        if (whisperInstances[getSessionKey(config.level)]) {
          // OnnxWhisper doesn't have a generic configure method yet,
          // but we store config for logic usage
          config = { ...config, ...e.data.config };
          console.log(`[OnnxWorker L${config.level}] Configured:`, config);
        }
        break;

      case "init":
        await handleInit(e.data);
        break;

      case "audio":
        handleAudio(data);
        break;

      case "draft_tokens":
        // OnnxWhisper doesn't support speculative decoding yet
        // Silently ignore or log if needed
        break;

      case "commit":
        if (whisperInstances[getSessionKey(config.level)]) {
          whisperInstances[getSessionKey(config.level)].reset(true); // Clear buffer
          processedSamples = 0; // Reset timestamp tracking like regular worker
          self.postMessage({ type: "reset" });
        }
        break;

      default:
        console.warn(`[OnnxWorker] Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error(`[OnnxWorker] Error handling message:`, error);
    self.postMessage({
      type: "error",
      error: error.message,
    });
  }
};

/**
 * Initialize the model
 */
async function handleInit(data) {
  const language = data.language || "en";
  // backend is ignored as OnnxWhisper uses its own config (usually webgpu)
  // but we can pass it if OnnxWhisper supports it
  const modelId = "onnx-community/whisper-tiny"; // Hardcoded as per streaming-worker.js reference
  const quant = data.quant; // Not used in hardcoded setup but available

  // Merge configs
  config = {
    ...(pendingConfig || {}),
    ...(data.config || {}),
    language: language, // Store language
  };

  // Create whisper instance for this session group
  // Using settings from streaming-worker.js
  const sessionKey = getSessionKey(config.level);

  whisperInstances[sessionKey] = new OnnxWhisper({
    modelId: modelId,
    dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
    device: "webgpu",
    maxNewTokens: 64,
    sessionId: sessionKey,
    progressCallback: (progress) => {
      if (progress.status === "progress") {
        self.postMessage({
          type: "load_progress",
          level: config.level || 0,
          progress: progress.progress,
          file: progress.file,
        });
      }
    },
  });

  // Initialize
  await whisperInstances[sessionKey].init();

  // Warmup
  await whisperInstances[sessionKey].warmup();

  pendingConfig = null;

  self.postMessage({
    type: "status",
    text: "Ready (ONNX)",
  });
}

/**
 * Handle audio data
 */
function handleAudio(audioData) {
  const sessionKey = getSessionKey(config.level);
  if (!whisperInstances[sessionKey]) return;

  // Add to OnnxWhisper's internal buffer
  whisperInstances[sessionKey].addAudioChunk(audioData);

  // Check processing logic based on mode
  const mode = config.mode || "legacy";

  // Debug logging for audio arrival (sample rate reduced to avoid spam)
  if (Math.random() < 0.01) {
    console.log(
      `[OnnxWorker L${config.level}] Received audio chunk. Buffer size: ${whisperInstances[sessionKey].audioBuffer.length}`
    );
  }

  // Process immediately (like regular inference worker)
  if (mode === "continuous") {
    // L1: Continuous streaming
    processContinuous();
  } else if (mode === "chunk") {
    // L2-4: Chunk based
    processChunk();
  }
}

async function processContinuous() {
  const sessionKey = getSessionKey(config.level);

  // Check if model is already processing
  if (whisperInstances[sessionKey].getProcessingState()) return;

  // Check if we have minimum audio to process (like regular inference worker)
  const minSamples = 16000 * (config.stepSize || 1.0); // Default stepSize is 1.0
  if (whisperInstances[sessionKey].audioBuffer.length < minSamples) return;

  // L1 Logic: Process at most last 3 seconds (exactly like regular inference worker)
  const maxInputSamples = 16000 * 3;
  let bufferToProcess = whisperInstances[sessionKey].audioBuffer;

  if (bufferToProcess.length === 0) return; // Skip if empty

  if (bufferToProcess.length > maxInputSamples) {
    bufferToProcess = bufferToProcess.slice(
      bufferToProcess.length - maxInputSamples
    );
  }

  try {
    // Use transcribe for continuous mode (exactly like regular inference worker)
    const result = await whisperInstances[sessionKey].transcribe(
      bufferToProcess,
      {
        language: config.language || "en",
        maxNewTokens: 64,
      }
    );

    if (result) {
      self.postMessage({
        type: "partial",
        text: result.text,
        level: config.level,
        inferenceTime: result.duration,
        tokens: result.tokens || [],
      });

      // L1 Logic: Keep last 1 second of context (exactly like regular inference worker)
      const contextSamples = 16000 * 1;
      if (whisperInstances[sessionKey].audioBuffer.length > contextSamples) {
        const newBuffer = whisperInstances[sessionKey].audioBuffer.slice(
          whisperInstances[sessionKey].audioBuffer.length - contextSamples
        );
        whisperInstances[sessionKey].audioBuffer = newBuffer;
      }
    }
  } catch (err) {
    console.error(
      `[OnnxWorker L${config.level}] Continuous processing error:`,
      err
    );
    // Log stack trace if available
    if (err.stack) console.error(err.stack);
  }
}

async function processChunk() {
  const sessionKey = getSessionKey(config.level);

  if (whisperInstances[sessionKey].getProcessingState()) return;

  const bufferInfo = whisperInstances[sessionKey].getBufferInfo();
  const chunkSize = config.chunkSize || 5;

  // console.log(`[OnnxWorker L${config.level}] Buffer: ${bufferInfo.duration.toFixed(2)}s / ${chunkSize}s`);

  if (bufferInfo.duration >= chunkSize) {
    console.log(
      `[OnnxWorker L${
        config.level
      }] Processing chunk: ${bufferInfo.duration.toFixed(2)}s`
    );
    try {
      const chunkSamples = Math.floor(chunkSize * 16000);
      const fullBuffer = whisperInstances[sessionKey].audioBuffer;
      const chunk = fullBuffer.slice(0, chunkSamples);

      // Process chunk
      const result = await whisperInstances[sessionKey].transcribe(chunk, {
        language: config.language || "en",
      });

      if (result) {
        const start = processedSamples / 16000; // Convert samples to seconds
        const end = (processedSamples + chunkSamples) / 16000;

        self.postMessage({
          type: "segment",
          text: result.text,
          level: config.level,
          inferenceTime: result.duration,
          start: start,
          end: end,
          chunkDuration: chunkSize,
          tokens: result.tokens || [],
        });

        // Update processed samples and shift buffer (like regular inference worker)
        processedSamples += chunkSamples;
        whisperInstances[sessionKey].audioBuffer =
          whisperInstances[sessionKey].audioBuffer.slice(chunkSamples);
      }
    } catch (err) {
      console.error(
        `[OnnxWorker L${config.level}] Chunk processing error:`,
        err
      );
    }
  }
}
