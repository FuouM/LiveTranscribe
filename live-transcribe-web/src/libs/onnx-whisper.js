/**
 * OnnxWhisper - A reusable library for running ONNX Whisper models
 * Supports both streaming and normal inference modes
 */

import {
  env,
  AutoTokenizer,
  AutoProcessor,
  AutoModelForSpeechSeq2Seq,
  TextStreamer,
  // } from "@huggingface/transformers";
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.1.2";

/**
 * Configuration options for OnnxWhisper
 * @typedef {Object} WhisperConfig
 * @property {string} modelId - HuggingFace model ID (default: "onnx-community/whisper-tiny")
 * @property {Object} dtype - Data type configuration for encoder and decoder
 * @property {string} device - Device to run on ("webgpu", "wasm", etc.)
 * @property {number} maxNewTokens - Maximum tokens to generate (default: 64)
 * @property {Function} progressCallback - Callback for model loading progress
 */

/**
 * Inference options
 * @typedef {Object} InferenceOptions
 * @property {string} language - Language code (default: "en")
 * @property {number} maxNewTokens - Override max tokens for this inference
 * @property {Function} onUpdate - Callback for streaming updates (text, tokenCount, tps)
 * @property {boolean} skipSpecialTokens - Skip special tokens in output (default: true)
 * @property {boolean} skipPrompt - Skip prompt in output (default: true)
 */

/**
 * Streaming options
 * @typedef {Object} StreamingOptions
 * @property {number} minNewAudioSeconds - Minimum new audio before processing (default: 0.5)
 * @property {number} sampleRate - Audio sample rate (default: 16000)
 */

export class OnnxWhisper {
  constructor(config = {}) {
    // Model configuration
    this.modelId = config.modelId || "onnx-community/whisper-tiny";
    this.dtype = config.dtype || {
      encoder_model: "fp32",
      decoder_model_merged: "q4",
    };
    this.device = config.device || "webgpu";
    this.maxNewTokens = config.maxNewTokens || 64;
    this.progressCallback = config.progressCallback || null;

    // Create unique session ID for this instance to avoid model caching conflicts
    this.sessionId =
      config.sessionId ||
      `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Model components
    this.tokenizer = null;
    this.processor = null;
    this.model = null;

    // Streaming state
    this.audioBuffer = new Float32Array(0);
    this.lastProcessedLength = 0;
    this.isProcessing = false;

    // Streaming configuration
    this.streamingConfig = {
      minNewAudioSeconds: config.minNewAudioSeconds || 0.5,
      sampleRate: config.sampleRate || 16000,
    };

    // Environment configuration
    this._configureEnvironment(config.envConfig || {});
  }

  /**
   * Configure transformers.js environment
   * @private
   */
  _configureEnvironment(envConfig) {
    // Configure environment for this session
    env.allowRemoteModels = envConfig.allowRemoteModels ?? true;
    env.allowLocalModels = envConfig.allowLocalModels ?? false;
    env.backends.onnx.wasm.numThreads = envConfig.numThreads ?? 1;

    // Disable model caching to allow multiple instances
    env.useCache = false;
    env.useCustomCache = true;
    env.cacheDir = null;
  }

  /**
   * Initialize and load the model
   * @returns {Promise<void>}
   */
  async init() {
    // Load tokenizer with session isolation
    if (!this.tokenizer) {
      this.tokenizer = await AutoTokenizer.from_pretrained(this.modelId, {
        progress_callback: this.progressCallback,
        // Use cache_dir to isolate sessions
        cache_dir: `onnx_whisper_cache_${this.sessionId}`,
      });
    }

    // Load processor with session isolation
    if (!this.processor) {
      this.processor = await AutoProcessor.from_pretrained(this.modelId, {
        progress_callback: this.progressCallback,
        // Use cache_dir to isolate sessions
        cache_dir: `onnx_whisper_cache_${this.sessionId}`,
      });
    }

    // Load model with unique session isolation
    if (!this.model) {
      this.model = await AutoModelForSpeechSeq2Seq.from_pretrained(
        this.modelId,
        {
          dtype: this.dtype,
          device: this.device,
          progress_callback: this.progressCallback,
          // Use cache_dir to create separate cached instances
          cache_dir: `onnx_whisper_cache_${this.sessionId}`,
        }
      );
    }
  }

  /**
   * Warm up the model with a dummy input
   * @returns {Promise<void>}
   */
  async warmup() {
    if (!this.model || !this.processor) {
      throw new Error("Model not initialized. Call init() first.");
    }

    // Create dummy spectrogram input (batch_size=1, features=80, time=3000)
    const dummySpectrogram = new Float32Array(1 * 80 * 3000).fill(0);
    const dummyInputs = await this.processor(dummySpectrogram);

    await this.model.generate({
      ...dummyInputs,
      max_new_tokens: 1,
    });
  }

  /**
   * Check if model is ready
   * @returns {boolean}
   */
  isReady() {
    return (
      this.tokenizer !== null && this.processor !== null && this.model !== null
    );
  }

  /**
   * Normal inference for complete audio
   * @param {Float32Array} audioData - Audio data to transcribe
   * @param {InferenceOptions} options - Inference options
   * @returns {Promise<Object>} Result object with text, tokens, and tps
   */
  async transcribe(audioData, options = {}) {
    if (!this.isReady()) {
      throw new Error("Model not initialized. Call init() first.");
    }

    if (this.isProcessing) {
      throw new Error("Already processing audio");
    }

    this.isProcessing = true;

    try {
      const language = options.language || "en";
      const maxNewTokens = options.maxNewTokens || this.maxNewTokens;
      const onUpdate = options.onUpdate || null;
      const skipSpecialTokens = options.skipSpecialTokens ?? true;
      const skipPrompt = options.skipPrompt ?? true;

      // Process audio through processor
      const inputs = await this.processor(audioData);

      let accumulatedText = "";
      let tokenCount = 0;
      let startTime;

      // Create text streamer for progressive output
      const streamer = new TextStreamer(this.tokenizer, {
        skip_prompt: skipPrompt,
        skip_special_tokens: skipSpecialTokens,
        token_callback_function: () => {
          startTime ??= performance.now();
          tokenCount++;
        },
        callback_function: (text) => {
          if (text) {
            accumulatedText += text;

            if (onUpdate) {
              const elapsed =
                performance.now() - (startTime || performance.now());
              const tps = startTime ? (tokenCount / elapsed) * 1000 : 0;
              onUpdate(accumulatedText.trim(), tokenCount, tps);
            }
          }
        },
      });

      // Generate transcription
      await this.model.generate({
        ...inputs,
        max_new_tokens: maxNewTokens,
        language: language,
        streamer: streamer,
      });

      const elapsed = performance.now() - (startTime || performance.now());
      const tps = startTime ? (tokenCount / elapsed) * 1000 : 0;

      return {
        text: accumulatedText.trim(),
        tokens: tokenCount,
        tps: tps,
        duration: elapsed,
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Add audio chunk to streaming buffer
   * @param {Float32Array} audioData - Audio chunk to add
   */
  addAudioChunk(audioData) {
    const newBuffer = new Float32Array(
      this.audioBuffer.length + audioData.length
    );
    newBuffer.set(this.audioBuffer);
    newBuffer.set(audioData, this.audioBuffer.length);
    this.audioBuffer = newBuffer;
  }

  /**
   * Get current audio buffer info
   * @returns {Object} Buffer info with length and duration
   */
  getBufferInfo() {
    return {
      samples: this.audioBuffer.length,
      duration: this.audioBuffer.length / this.streamingConfig.sampleRate,
      newSamples: this.audioBuffer.length - this.lastProcessedLength,
      newDuration:
        (this.audioBuffer.length - this.lastProcessedLength) /
        this.streamingConfig.sampleRate,
    };
  }

  /**
   * Process accumulated audio in streaming mode
   * @param {InferenceOptions & StreamingOptions} options - Inference and streaming options
   * @returns {Promise<Object|null>} Result object or null if not enough audio
   */
  async processStream(options = {}) {
    if (!this.isReady()) {
      throw new Error("Model not initialized. Call init() first.");
    }

    // Check if we have enough new audio
    const minNewAudioSeconds =
      options.minNewAudioSeconds ?? this.streamingConfig.minNewAudioSeconds;
    const sampleRate = options.sampleRate ?? this.streamingConfig.sampleRate;
    const minNewAudioSamples = sampleRate * minNewAudioSeconds;
    const newAudioLength = this.audioBuffer.length - this.lastProcessedLength;

    if (newAudioLength < minNewAudioSamples) {
      return null; // Not enough new audio
    }

    if (this.isProcessing) {
      return null; // Already processing
    }

    this.isProcessing = true;

    try {
      const language = options.language || "en";
      const maxNewTokens = options.maxNewTokens || this.maxNewTokens;
      const onUpdate = options.onUpdate || null;
      const skipSpecialTokens = options.skipSpecialTokens ?? true;
      const skipPrompt = options.skipPrompt ?? true;

      // Process the current audio buffer
      const inputs = await this.processor(this.audioBuffer);

      let accumulatedText = "";
      let tokenCount = 0;
      let startTime;

      // Create text streamer for progressive output
      const streamer = new TextStreamer(this.tokenizer, {
        skip_prompt: skipPrompt,
        skip_special_tokens: skipSpecialTokens,
        token_callback_function: () => {
          startTime ??= performance.now();
          tokenCount++;
        },
        callback_function: (text) => {
          if (text) {
            accumulatedText += text;

            if (onUpdate) {
              const elapsed =
                performance.now() - (startTime || performance.now());
              const tps = startTime ? (tokenCount / elapsed) * 1000 : 0;
              onUpdate(accumulatedText.trim(), tokenCount, tps);
            }
          }
        },
      });

      // Generate transcription
      await this.model.generate({
        ...inputs,
        max_new_tokens: maxNewTokens,
        language: language,
        streamer: streamer,
      });

      // Update last processed length
      this.lastProcessedLength = this.audioBuffer.length;

      const elapsed = performance.now() - (startTime || performance.now());
      const tps = startTime ? (tokenCount / elapsed) * 1000 : 0;

      return {
        text: accumulatedText.trim(),
        tokens: tokenCount,
        tps: tps,
        duration: elapsed,
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Reset streaming state
   * @param {boolean} clearBuffer - Whether to clear the audio buffer (default: true)
   */
  reset(clearBuffer = true) {
    if (clearBuffer) {
      this.audioBuffer = new Float32Array(0);
    }
    this.lastProcessedLength = 0;
    this.isProcessing = false;
  }

  /**
   * Get current processing state
   * @returns {boolean}
   */
  getProcessingState() {
    return this.isProcessing;
  }

  /**
   * Dispose of model resources
   */
  async dispose() {
    // Note: transformers.js doesn't have explicit dispose methods
    // This is a placeholder for future cleanup if needed
    this.tokenizer = null;
    this.processor = null;
    this.model = null;
    this.reset();
  }
}
