// Streaming Whisper Web Worker
// Based on realtime-whisper-webgpu implementation

import {
  env,
  AutoTokenizer,
  AutoProcessor,
  AutoModelForSpeechSeq2Seq,
  TextStreamer,
  Tensor,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.2";

// Configure environment for WebGPU
env.allowRemoteModels = true;
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;

// Model configuration
const MODEL_ID = "onnx-community/whisper-tiny";
const MAX_NEW_TOKENS = 64;

// Pipeline class for managing Whisper components
class WhisperPipeline {
  static model_id = MODEL_ID;
  static tokenizer = null;
  static processor = null;
  static model = null;
  static isProcessing = false;
  static audioBuffer = new Float32Array(0);
  static lastProcessedLength = 0;

  static async getInstance(progressCallback = null) {
    // Load tokenizer
    if (!this.tokenizer) {
      this.tokenizer = await AutoTokenizer.from_pretrained(this.model_id, {
        progress_callback: progressCallback,
      });
    }

    // Load processor
    if (!this.processor) {
      this.processor = await AutoProcessor.from_pretrained(this.model_id, {
        progress_callback: progressCallback,
      });
    }

    // Load model
    if (!this.model) {
      this.model = await AutoModelForSpeechSeq2Seq.from_pretrained(
        this.model_id,
        {
          dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
          device: "webgpu",
          progress_callback: progressCallback,
        }
      );
    }

    return [this.tokenizer, this.processor, this.model];
  }

  static addAudioChunk(audioData) {
    // Append new audio data to buffer
    const newBuffer = new Float32Array(
      this.audioBuffer.length + audioData.length
    );
    newBuffer.set(this.audioBuffer);
    newBuffer.set(audioData, this.audioBuffer.length);
    this.audioBuffer = newBuffer;

    console.log(
      `[Worker] Audio buffer now: ${this.audioBuffer.length} samples (~${(
        this.audioBuffer.length / 16000
      ).toFixed(2)}s)`
    );
  }

  static async processStreamingAudio(language = "en", onUpdate = null) {
    // Only process if we have at least 2 seconds of new audio
    const newAudioLength = this.audioBuffer.length - this.lastProcessedLength;
    const minNewAudioSamples = 16000 * 0.5; // 0.5 seconds

    if (newAudioLength < minNewAudioSamples || this.isProcessing) {
      console.log(
        `[Worker] Not enough new audio or already processing. New: ${newAudioLength}, Min: ${minNewAudioSamples}, Processing: ${this.isProcessing}`
      );
      return;
    }

    this.isProcessing = true;

    try {
      const [tokenizer, processor, model] = await this.getInstance();

      // Process the current audio buffer
      const inputs = await processor(this.audioBuffer);

      let accumulatedText = "";
      let tokenCount = 0;
      let startTime;
      let callCount = 0;

      // Create text streamer that accumulates text chunks
      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        token_callback_function: () => {
          startTime ??= performance.now();
          tokenCount++;
        },
        callback_function: (text) => {
          callCount++;
          console.log(`[Worker] Text callback #${callCount}: "${text}"`);

          if (text) {
            // Accumulate the raw text chunks (don't trim to preserve spaces)
            accumulatedText += text;

            const elapsed =
              performance.now() - (startTime || performance.now());
            const tps = startTime ? (tokenCount / elapsed) * 1000 : 0;

            console.log(
              `[Worker] ACCUMULATED: "${accumulatedText}" (tokens: ${tokenCount}, TPS: ${tps.toFixed(
                1
              )})`
            );

            if (onUpdate) {
              onUpdate(accumulatedText.trim(), tokenCount, tps); // Include TPS
            }
          }
        },
      });

      // Generate transcription
      const output = await model.generate({
        ...inputs,
        max_new_tokens: MAX_NEW_TOKENS,
        language: language,
        streamer: streamer,
      });

      // Update last processed length
      this.lastProcessedLength = this.audioBuffer.length;

      // Return the accumulated text from the streamer (trimmed)
      return accumulatedText.trim();
    } finally {
      this.isProcessing = false;
    }
  }

  static async processAudio(audioData, language = "en", onUpdate = null) {
    if (this.isProcessing) {
      throw new Error("Already processing audio");
    }

    this.isProcessing = true;

    try {
      const [tokenizer, processor, model] = await this.getInstance();

      // Process audio through processor
      const inputs = await processor(audioData);

      let accumulatedText = "";
      let tokenCount = 0;
      let startTime;
      let callCount = 0;

      // Create text streamer that accumulates text chunks
      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        token_callback_function: () => {
          startTime ??= performance.now();
          tokenCount++;
        },
        callback_function: (text) => {
          callCount++;
          console.log(`[Worker] Text callback #${callCount}: "${text}"`);

          if (text) {
            // Accumulate the raw text chunks (don't trim to preserve spaces)
            accumulatedText += text;

            const elapsed =
              performance.now() - (startTime || performance.now());
            const tps = startTime ? (tokenCount / elapsed) * 1000 : 0;

            console.log(
              `[Worker] ACCUMULATED: "${accumulatedText}" (tokens: ${tokenCount}, TPS: ${tps.toFixed(
                1
              )})`
            );

            if (onUpdate) {
              onUpdate(accumulatedText.trim(), tokenCount); // Only trim for display
            }
          }
        },
      });

      // Generate transcription
      const output = await model.generate({
        ...inputs,
        max_new_tokens: MAX_NEW_TOKENS,
        language: language,
        streamer: streamer,
      });

      // Return the accumulated text from the streamer (trimmed)
      return accumulatedText.trim();
    } finally {
      this.isProcessing = false;
    }
  }

  static async getInstance(progressCallback = null) {
    // Load tokenizer
    if (!this.tokenizer) {
      this.tokenizer = await AutoTokenizer.from_pretrained(this.model_id, {
        progress_callback: progressCallback,
      });
    }

    // Load processor
    if (!this.processor) {
      this.processor = await AutoProcessor.from_pretrained(this.model_id, {
        progress_callback: progressCallback,
      });
    }

    // Load model
    if (!this.model) {
      this.model = await AutoModelForSpeechSeq2Seq.from_pretrained(
        this.model_id,
        {
          dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
          device: "webgpu",
          progress_callback: progressCallback,
        }
      );
    }

    return [this.tokenizer, this.processor, this.model];
  }

  static async processStreamingAudio(language = "en", onUpdate = null) {
    // Only process if we have at least 2 seconds of new audio
    const newAudioLength = this.audioBuffer.length - this.lastProcessedLength;
    const minNewAudioSamples = 16000 * 0.5; // 0.5 seconds

    if (newAudioLength < minNewAudioSamples || this.isProcessing) {
      console.log(
        `[Worker] Not enough new audio or already processing. New: ${newAudioLength}, Min: ${minNewAudioSamples}, Processing: ${this.isProcessing}`
      );
      return;
    }

    this.isProcessing = true;

    try {
      const [tokenizer, processor, model] = await this.getInstance();

      // Process the current audio buffer
      const inputs = await processor(this.audioBuffer);

      let accumulatedText = "";
      let tokenCount = 0;
      let startTime;
      let callCount = 0;

      // Create text streamer that accumulates text chunks
      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        token_callback_function: () => {
          startTime ??= performance.now();
          tokenCount++;
        },
        callback_function: (text) => {
          callCount++;
          console.log(`[Worker] Text callback #${callCount}: "${text}"`);

          if (text) {
            // Accumulate the raw text chunks (don't trim to preserve spaces)
            accumulatedText += text;

            const elapsed =
              performance.now() - (startTime || performance.now());
            const tps = startTime ? (tokenCount / elapsed) * 1000 : 0;

            console.log(
              `[Worker] ACCUMULATED: "${accumulatedText}" (tokens: ${tokenCount}, TPS: ${tps.toFixed(
                1
              )})`
            );

            if (onUpdate) {
              onUpdate(accumulatedText.trim(), tokenCount, tps); // Include TPS
            }
          }
        },
      });

      // Generate transcription
      const output = await model.generate({
        ...inputs,
        max_new_tokens: MAX_NEW_TOKENS,
        language: language,
        streamer: streamer,
      });

      // Update last processed length
      this.lastProcessedLength = this.audioBuffer.length;

      // Return the accumulated text from the streamer (trimmed)
      return accumulatedText.trim();
    } finally {
      this.isProcessing = false;
    }
  }

  static async processAudio(audioData, language = "en", onUpdate = null) {
    if (this.isProcessing) {
      throw new Error("Already processing audio");
    }

    this.isProcessing = true;

    try {
      const [tokenizer, processor, model] = await this.getInstance();

      // Process audio through processor
      const inputs = await processor(audioData);

      let accumulatedText = "";
      let tokenCount = 0;
      let startTime;
      let callCount = 0;

      // Create text streamer that accumulates text chunks
      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        token_callback_function: () => {
          startTime ??= performance.now();
          tokenCount++;
        },
        callback_function: (text) => {
          callCount++;
          console.log(`[Worker] Text callback #${callCount}: "${text}"`);

          if (text) {
            // Accumulate the raw text chunks (don't trim to preserve spaces)
            accumulatedText += text;

            const elapsed =
              performance.now() - (startTime || performance.now());
            const tps = startTime ? (tokenCount / elapsed) * 1000 : 0;

            console.log(
              `[Worker] ACCUMULATED: "${accumulatedText}" (tokens: ${tokenCount}, TPS: ${tps.toFixed(
                1
              )})`
            );

            if (onUpdate) {
              onUpdate(accumulatedText.trim(), tokenCount); // Only trim for display
            }
          }
        },
      });

      // Generate transcription
      const output = await model.generate({
        ...inputs,
        max_new_tokens: MAX_NEW_TOKENS,
        language: language,
        streamer: streamer,
      });

      // Return the accumulated text from the streamer (trimmed)
      return accumulatedText.trim();
    } finally {
      this.isProcessing = false;
    }
  }
}

// Global flag to prevent concurrent message processing
let isHandlingMessage = false;
let messageQueue = [];

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

// Load model handler
async function handleLoad() {
  try {
    self.postMessage({ status: "loading", data: "Initializing pipeline..." });

    // Get pipeline instance (this will load the model)
    const [tokenizer, processor, model] = await WhisperPipeline.getInstance(
      createProgressCallback()
    );

    // Warm up the model with a dummy input
    self.postMessage({ status: "loading", data: "Warming up model..." });

    // Create dummy spectrogram input (batch_size=1, features=80, time=3000)
    const dummySpectrogram = new Float32Array(1 * 80 * 3000).fill(0);

    // Process through processor to get proper input format
    const dummyInputs = await processor(dummySpectrogram);

    await model.generate({
      ...dummyInputs,
      max_new_tokens: 1,
    });

    self.postMessage({ status: "ready" });
  } catch (error) {
    self.postMessage({
      status: "error",
      err: `Failed to load model: ${error.message}`,
    });
  }
}

// Add audio chunk handler
async function handleAddAudio({ audio, language = "en" }) {
  try {
    // Add audio chunk to buffer
    WhisperPipeline.addAudioChunk(audio);

    // Try to process if we have enough audio
    const result = await WhisperPipeline.processStreamingAudio(
      language,
      (partialText, tokenCount, tps) => {
        self.postMessage({
          status: "update",
          output: partialText,
          tps: tps,
          numTokens: tokenCount,
        });
      }
    );

    if (result) {
      self.postMessage({
        status: "complete",
        output: result,
      });
    }
  } catch (error) {
    // Don't send error for "Already processing" - just ignore
    if (
      !error.message.includes("Already processing") &&
      !error.message.includes("Not enough new audio")
    ) {
      self.postMessage({
        status: "error",
        err: `Streaming transcription failed: ${error.message}`,
      });
    }
  }
}

// Generate transcription handler (for single audio files)
async function handleGenerate({ audio, language = "en" }) {
  try {
    self.postMessage({ status: "start" });

    let currentTranscription = "";
    let tokenCount = 0;
    let startTime = performance.now();

    // Process audio with streaming updates
    const finalTranscription = await WhisperPipeline.processAudio(
      audio,
      language,
      (partialText, streamedTokenCount) => {
        currentTranscription = partialText;
        tokenCount = streamedTokenCount;

        const elapsed = performance.now() - startTime;
        const tps = tokenCount / (elapsed / 1000);

        self.postMessage({
          status: "update",
          output: currentTranscription,
          tps: tps,
          numTokens: tokenCount,
        });
      }
    );

    self.postMessage({
      status: "complete",
      output: finalTranscription,
    });
  } catch (error) {
    self.postMessage({
      status: "error",
      err: `Transcription failed: ${error.message}`,
    });
  }
}

// Process queued messages
async function processMessageQueue() {
  if (messageQueue.length > 0 && !isHandlingMessage) {
    const nextMessage = messageQueue.shift();
    await self.onmessage(nextMessage);
  }
}

// Message handler
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
