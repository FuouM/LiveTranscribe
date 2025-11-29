import { WhisperInference, ProcessingMode } from "../libs/whisper-inference.js";

// Global inference instance
let whisper = null;
let pendingConfig = null; // Store config from configure message before init

/**
 * Message handler
 */
self.onmessage = async (e) => {
  const { type, data, draftTokens, tokens } = e.data;

  try {
    switch (type) {
      case "configure":
        // Store config for when init is called
        pendingConfig = e.data.config;
        if (whisper) {
          whisper.configure(e.data.config);
          console.log(
            `[Worker L${whisper.config.level}] Configured:`,
            whisper.config
          );
        }
        break;

      case "init":
        await handleInit(e.data);
        break;

      case "audio":
        handleAudio(data);
        break;

      case "draft_tokens":
        if (whisper && tokens && tokens.length > 0) {
          whisper.setDraftTokens(tokens);
        }
        break;

      case "commit":
        if (whisper) {
          whisper.commit();
          self.postMessage({ type: "reset" });
        }
        break;

      default:
        console.warn(`[Worker] Unknown message type: ${type}`);
    }
  } catch (error) {
    console.error(`[Worker] Error handling message:`, error);
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
  const backend = data.backend || "webgpu";
  const modelName = data.model || "Xenova/whisper-tiny";
  const quant = data.quant;

  // Merge pending config from configure message with config from init message
  const config = { ...(pendingConfig || {}), ...(data.config || {}) };

  // Create whisper instance
  whisper = new WhisperInference({
    modelName,
    backend,
    language,
    quant,
    ...config,
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
    statusCallback: (text) => {
      self.postMessage({
        type: "status",
        text: text,
      });
    },
  });

  // Initialize the model
  await whisper.init();

  // Clear pending config after init
  pendingConfig = null;
}

/**
 * Handle audio data
 */
function handleAudio(audioData) {
  if (!whisper) {
    console.warn("[Worker] Model not initialized");
    return;
  }

  // Add audio to buffer
  whisper.addAudio(audioData);

  const state = whisper.getState();
  console.log(
    `[Worker L${state.level}] Buffer: ${state.bufferDuration.toFixed(
      2
    )}s, Mode: ${state.mode}, Should process: ${whisper.shouldProcess()}`
  );

  // Check if we should process
  if (whisper.shouldProcess()) {
    console.log(`[Worker L${state.level}] Triggering processAudio()`);
    processAudio();
  }
}

/**
 * Process audio based on mode
 */
async function processAudio() {
  if (!whisper || whisper.isProcessing) {
    return;
  }

  try {
    let result;

    if (whisper.config.mode === ProcessingMode.CONTINUOUS) {
      result = await whisper.processContinuous();
    } else if (whisper.config.mode === ProcessingMode.CHUNK) {
      result = await whisper.processChunk();
    } else {
      console.warn(`[Worker] Unknown processing mode: ${whisper.config.mode}`);
      return;
    }

    // Send result
    if (
      result &&
      (result.text || whisper.config.mode === ProcessingMode.CHUNK)
    ) {
      self.postMessage(result);
    }

    // Check if we can process more immediately
    setTimeout(() => {
      if (whisper && whisper.shouldProcess()) {
        processAudio();
      }
    }, 0);
  } catch (error) {
    console.error(`[Worker] Processing error:`, error);
    self.postMessage({
      type: "error",
      error: error.message,
    });
  }
}
