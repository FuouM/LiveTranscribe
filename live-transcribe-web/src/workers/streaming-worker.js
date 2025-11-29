// Streaming Whisper Web Worker
// Refactored to use OnnxWhisper library

import { OnnxWhisper } from "../libs/onnx-whisper.js";

// Global whisper instance
let whisper = null;

// Message queue for handling concurrent requests
let isHandlingMessage = false;
let messageQueue = [];

/**
 * Create progress callback for model loading
 */
function createProgressCallback() {
  return (progress) => {
    self.postMessage({
      status: "loading",
      data:
        progress.status === "progress"
          ? `Loading ${progress.file || "model"}...`
          : progress.status,
    });
  };
}

/**
 * Load and initialize the model
 */
async function handleLoad() {
  try {
    self.postMessage({ status: "loading", data: "Initializing pipeline..." });

    // Create whisper instance if not exists
    if (!whisper) {
      whisper = new OnnxWhisper({
        modelId: "onnx-community/whisper-tiny",
        dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
        device: "webgpu",
        maxNewTokens: 64,
        progressCallback: createProgressCallback(),
      });
    }

    // Initialize the model
    await whisper.init();

    // Warm up the model
    self.postMessage({ status: "loading", data: "Warming up model..." });
    await whisper.warmup();

    self.postMessage({ status: "ready" });
  } catch (error) {
    self.postMessage({
      status: "error",
      err: `Failed to load model: ${error.message}`,
    });
  }
}

/**
 * Handle streaming audio chunks
 */
async function handleAddAudio({ audio, language = "en" }) {
  try {
    if (!whisper) {
      throw new Error("Model not initialized");
    }

    // Add audio chunk to buffer
    whisper.addAudioChunk(audio);

    // Try to process if we have enough audio
    const result = await whisper.processStream({
      language,
      onUpdate: (partialText, tokenCount, tps) => {
        self.postMessage({
          status: "update",
          output: partialText,
          tps: tps,
          numTokens: tokenCount,
        });
      },
    });

    // Send complete message if processing occurred
    if (result) {
      self.postMessage({
        status: "complete",
        output: result.text,
      });
    }
  } catch (error) {
    // Only send error for unexpected failures
    if (!error.message.includes("Already processing")) {
      self.postMessage({
        status: "error",
        err: `Streaming transcription failed: ${error.message}`,
      });
    }
  }
}

/**
 * Handle single audio file transcription
 */
async function handleGenerate({ audio, language = "en" }) {
  try {
    if (!whisper) {
      throw new Error("Model not initialized");
    }

    self.postMessage({ status: "start" });

    // Process audio with streaming updates
    const result = await whisper.transcribe(audio, {
      language,
      onUpdate: (partialText, tokenCount, tps) => {
        self.postMessage({
          status: "update",
          output: partialText,
          tps: tps,
          numTokens: tokenCount,
        });
      },
    });

    self.postMessage({
      status: "complete",
      output: result.text,
    });
  } catch (error) {
    self.postMessage({
      status: "error",
      err: `Transcription failed: ${error.message}`,
    });
  }
}

/**
 * Process queued messages
 */
async function processMessageQueue() {
  if (messageQueue.length > 0 && !isHandlingMessage) {
    const nextMessage = messageQueue.shift();
    await self.onmessage(nextMessage);
  }
}

/**
 * Main message handler
 */
self.onmessage = async (event) => {
  console.log("[StreamingWorker] Received message:", event.data);

  // Queue message if already processing
  if (isHandlingMessage) {
    console.log("[StreamingWorker] Queuing message (busy)");
    messageQueue.push(event);
    return;
  }

  isHandlingMessage = true;
  console.log("[StreamingWorker] Processing message");

  try {
    const { type, data } = event.data;
    console.log("[StreamingWorker] Message type:", type);

    switch (type) {
      case "load":
        console.log("[StreamingWorker] Handling load");
        await handleLoad();
        break;

      case "generate":
        console.log("[StreamingWorker] Handling generate");
        await handleGenerate(data);
        break;

      case "add_audio":
        console.log("[StreamingWorker] Handling add_audio");
        await handleAddAudio(data);
        break;

      default:
        console.log("[StreamingWorker] Unknown message type:", type);
        self.postMessage({
          status: "error",
          err: `Unknown message type: ${type}`,
        });
    }
  } finally {
    isHandlingMessage = false;
    console.log("[StreamingWorker] Message processing complete");
    // Process next queued message
    processMessageQueue();
  }
};

// Signal that worker is ready
self.postMessage({ status: "worker_ready" });
