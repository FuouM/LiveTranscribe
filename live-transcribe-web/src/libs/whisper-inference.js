/**
 * WhisperInference - A reusable library for transformers.js-based Whisper inference
 * Supports continuous and chunk processing modes with speculative decoding
 */

import {
  AutoModelForSpeechSeq2Seq,
  AutoProcessor,
  AutoTokenizer,
  env,
  Tensor,
} from "@huggingface/transformers";

/**
 * Processing modes
 */
export const ProcessingMode = {
  LEGACY: "legacy",
  CONTINUOUS: "continuous", // L1: Real-time updates
  CHUNK: "chunk", // L2-L4: Fixed-size segments
};

/**
 * Configuration options for WhisperInference
 * @typedef {Object} WhisperConfig
 * @property {string} modelName - Model ID (default: "Xenova/whisper-tiny")
 * @property {string} backend - Backend to use ("webgpu", "wasm")
 * @property {string} language - Language code (default: "en")
 * @property {string} quant - Quantization level ("q4", "fp16", "fp32", null)
 * @property {string} mode - Processing mode ("continuous", "chunk", "legacy")
 * @property {number} chunkSize - Chunk size in seconds (for chunk mode)
 * @property {number} stepSize - Step size in seconds (for continuous mode)
 * @property {number} level - Layer level (0-4)
 * @property {Object} generationParams - Additional generation parameters
 * @property {Function} progressCallback - Callback for model loading progress
 * @property {Function} statusCallback - Callback for status updates
 */

export class WhisperInference {
  constructor(config = {}) {
    // Model configuration
    this.modelName = config.modelName || "Xenova/whisper-tiny";
    this.backend = config.backend || "webgpu";
    this.language = config.language || "en";
    this.quant = config.quant || null;

    // Processing configuration
    this.config = {
      mode: config.mode || ProcessingMode.LEGACY,
      chunkSize: config.chunkSize || 5, // seconds
      stepSize: config.stepSize || 1, // seconds
      level: config.level || 0,
      generationParams: config.generationParams || {},
    };

    // Callbacks
    this.progressCallback = config.progressCallback || null;
    this.statusCallback = config.statusCallback || null;

    // Model components
    this.model = null;
    this.processor = null;
    this.tokenizer = null;

    // Processing state
    this.audioBuffer = new Float32Array(0);
    this.isProcessing = false;
    this.processedSamples = 0;
    this.sampleRate = 16000;

    // Speculative decoding state
    this.currentDraftTokens = [];

    // Environment configuration
    this._configureEnvironment(config.envConfig || {});
  }

  /**
   * Configure transformers.js environment
   * @private
   */
  _configureEnvironment(envConfig) {
    env.allowRemoteModels = envConfig.allowRemoteModels ?? true;
    env.backends.onnx.wasm.numThreads = envConfig.numThreads ?? 1;
  }

  /**
   * Update configuration
   */
  configure(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get identifier string for logging
   * @private
   */
  _getId() {
    return this.config.level
      ? `[WhisperInference L${this.config.level}]`
      : "[WhisperInference]";
  }

  /**
   * Send status update
   * @private
   */
  _sendStatus(text) {
    if (this.statusCallback) {
      this.statusCallback(text);
    }
  }

  /**
   * Validate quantization after model loading
   * @private
   */
  async _validateQuantization(fileValidation) {
    const id = this._getId();
    const requestedDtype = this.quant;

    console.log(`${id} Validating quantization: requested=${requestedDtype}`);

    let actualDtype = "unknown";
    let validationLevel = 0;

    try {
      // Check model configuration for dtype
      if (this.model.config && this.model.config.dtype) {
        actualDtype = this.model.config.dtype;
        console.log(`${id} Model config dtype: ${actualDtype}`);
      }

      // Try to inspect model properties for dtype information
      if (this.model.model && this.model.model.dtype) {
        actualDtype = this.model.model.dtype;
        console.log(`${id} Model dtype (from model.model): ${actualDtype}`);
      }

      // Define equivalent dtype mappings
      const dtypeEquivalents = {
        q4: ["q4", "4bit"],
        fp16: ["fp16", "half"],
      };

      // Validate that the requested dtype was actually applied
      if (actualDtype === requestedDtype) {
        validationLevel = 3;
        console.log(
          `${id} ✅ Dtype validation: Model is using requested ${requestedDtype}`
        );
      } else if (
        dtypeEquivalents[requestedDtype] &&
        dtypeEquivalents[requestedDtype].includes(actualDtype)
      ) {
        validationLevel = 2;
        console.log(
          `${id} ✅ Dtype validation: Model is using equivalent type ${actualDtype} for requested ${requestedDtype}`
        );
      } else if (fileValidation.hasQuantFiles && requestedDtype !== "fp32") {
        validationLevel = 1;
        console.log(
          `${id} ✅ Dtype validation: File-based validation confirms ${requestedDtype} quantization`
        );
      } else if (actualDtype !== "unknown") {
        console.warn(
          `${id} ⚠️ Dtype validation: Requested ${requestedDtype} but model reports ${actualDtype}`
        );
      } else {
        console.warn(
          `${id} ❓ Dtype validation: Could not determine actual dtype, requested ${requestedDtype}`
        );
      }

      // Send validation status
      if (requestedDtype !== "fp32" && validationLevel > 0) {
        const validationMsg = `✅ Model validated: Using ${requestedDtype} quantization`;
        console.log(`${id} ${validationMsg}`);
        this._sendStatus(validationMsg);
      } else if (validationLevel === 0) {
        const warningMsg = `⚠️ Quantization validation uncertain for ${requestedDtype}`;
        console.warn(`${id} ${warningMsg}`);
        this._sendStatus(warningMsg);
      }

      // File-based validation logging
      console.log(
        `${id} File validation: ${fileValidation.totalFiles} files loaded`
      );
      if (requestedDtype === "fp32") {
        if (fileValidation.hasFp32Files && !fileValidation.hasQuantFiles) {
          console.log(
            `${id} ✅ File validation: Detected fp32 full-precision files`
          );
        } else if (fileValidation.hasQuantFiles) {
          console.warn(
            `${id} ⚠️ File validation: Expected fp32 but detected quantization files`
          );
        }
      } else {
        if (fileValidation.hasQuantFiles) {
          console.log(
            `${id} ✅ File validation: Detected ${requestedDtype} quantization files`
          );
        } else {
          console.warn(
            `${id} ⚠️ File validation: No ${requestedDtype} quantization files detected`
          );
        }
      }
    } catch (error) {
      console.error(
        `${id} Error during quantization validation:`,
        error.message
      );
    }
  }

  /**
   * Initialize and load the model
   */
  async init() {
    const id = this._getId();
    this._sendStatus(`${id} Loading model...`);

    try {
      // Configure ONNX runtime based on backend
      if (this.backend === "wasm") {
        env.backends.onnx.wasm.numThreads = 1;
        env.backends.onnx.wasm.wasmPaths = {
          "ort-wasm-simd-threaded.wasm": "/ort-wasm-simd-threaded.wasm",
        };
      }

      console.log(`${id} Loading model components...`);

      // Load options
      const loadOptions = {
        device: this.backend,
        progress_callback: this.progressCallback,
      };

      // Track file loading for quantization validation
      let fileValidation = {
        hasQuantFiles: false,
        hasFp32Files: false,
        totalFiles: 0,
      };

      // Handle quantization options
      if (this.quant) {
        console.log(`${id} Using quantization: ${this.quant}`);
        if (this.quant === "q4") {
          loadOptions.dtype = "q4";
        } else if (this.quant === "fp16") {
          loadOptions.dtype = "fp16";
        } else {
          console.warn(
            `${id} Unsupported quantization: ${this.quant}, defaulting to q4`
          );
          loadOptions.dtype = "q4";
        }
      }

      // Enhanced progress callback with quantization validation
      const originalProgressCallback = loadOptions.progress_callback;
      loadOptions.progress_callback = (progress) => {
        if (progress.status === "progress" || progress.status === "initiate") {
          if (progress.file) {
            fileValidation.totalFiles++;

            const fileName = progress.file.toLowerCase();
            const requestedDtype = this.quant || "fp16";

            const quantPatterns = {
              q4: ["q4", "4bit"],
              fp16: ["fp16", "half"],
            };

            const patterns = quantPatterns[requestedDtype] || [requestedDtype];
            if (patterns.some((pattern) => fileName.includes(pattern))) {
              fileValidation.hasQuantFiles = true;
            }

            if (
              fileName.includes("fp32") ||
              fileName.includes("float32") ||
              (!fileName.includes("q4") && !fileName.includes("fp16"))
            ) {
              fileValidation.hasFp32Files = true;
            }
          }
        }

        if (originalProgressCallback) {
          originalProgressCallback(progress);
        }
      };

      // Load model
      const loadStartTime = Date.now();
      this.model = await AutoModelForSpeechSeq2Seq.from_pretrained(
        this.modelName,
        loadOptions
      );
      const loadTime = Date.now() - loadStartTime;
      console.log(`${id} Model loaded in ${loadTime}ms`);

      // Validate quantization
      if (this.quant) {
        this._sendStatus(`${id} Validating quantization...`);
        await this._validateQuantization(fileValidation);
      }

      // Load processor
      this.processor = await AutoProcessor.from_pretrained(this.modelName);
      console.log(`${id} Processor loaded`);

      // Load tokenizer
      this.tokenizer = await AutoTokenizer.from_pretrained(this.modelName);
      console.log(`${id} Tokenizer loaded`);

      console.log(
        `${id} All components loaded with ${this.backend.toUpperCase()}`
      );
      const quantInfo = this.quant ? ` (${this.quant})` : "";
      this._sendStatus(`${id} Ready${quantInfo}`);
    } catch (err) {
      console.error(`${id} Backend ${this.backend} failed:`, err.message);

      // Try WASM fallback if not already using WASM
      if (this.backend !== "wasm") {
        console.warn(
          `${id} Backend ${this.backend} failed, trying WASM fallback`
        );
        try {
          env.backends.onnx.wasm.numThreads = 1;
          env.backends.onnx.wasm.wasmPaths = {
            "ort-wasm-simd-threaded.wasm": "/ort-wasm-simd-threaded.wasm",
          };

          this.model = await AutoModelForSpeechSeq2Seq.from_pretrained(
            this.modelName,
            {
              device: "wasm",
            }
          );
          this.processor = await AutoProcessor.from_pretrained(this.modelName);
          this.tokenizer = await AutoTokenizer.from_pretrained(this.modelName);

          this._sendStatus(`${id} Ready (WASM fallback)`);
        } catch (wasmErr) {
          console.error(`${id} WASM fallback also failed:`, wasmErr.message);
          throw new Error(
            `All backends failed. Primary: ${err.message}, WASM: ${wasmErr.message}`
          );
        }
      } else {
        throw new Error(`WASM backend failed: ${err.message}`);
      }
    }
  }

  /**
   * Check if model is ready
   */
  isReady() {
    return (
      this.model !== null && this.processor !== null && this.tokenizer !== null
    );
  }

  /**
   * Add audio data to buffer
   */
  addAudio(audioData) {
    const newBuffer = new Float32Array(
      this.audioBuffer.length + audioData.length
    );
    newBuffer.set(this.audioBuffer);
    newBuffer.set(audioData, this.audioBuffer.length);
    this.audioBuffer = newBuffer;
  }

  /**
   * Set draft tokens for speculative decoding
   */
  setDraftTokens(tokens) {
    if (!tokens || tokens.length === 0) {
      return;
    }

    // Handle different strategies based on level
    if (this.config.level === 2) {
      // L1 -> L2: L1 is continuous, replace with latest
      this.currentDraftTokens = tokens;
    } else {
      // L2 -> L3, L3 -> L4: Chunks, append with header filtering
      let newTokens = Array.from(tokens);

      if (this.currentDraftTokens.length > 0) {
        // Strip header tokens from new chunk
        let startIndex = 0;
        while (
          startIndex < newTokens.length &&
          newTokens[startIndex] >= 50257
        ) {
          // Check if it's a timestamp (>= 50364), stop stripping if so
          if (newTokens[startIndex] >= 50364) {
            break;
          }
          startIndex++;
        }

        if (startIndex > 0) {
          newTokens = newTokens.slice(startIndex);
        }

        this.currentDraftTokens = [...this.currentDraftTokens, ...newTokens];
      } else {
        this.currentDraftTokens = [...this.currentDraftTokens, ...newTokens];
      }
    }
  }

  /**
   * Verify draft tokens against model predictions
   * @private
   */
  async _verifyDraftTokens(inputFeatures, draftTokens) {
    const id = this._getId();
    try {
      // Create decoder input tensor
      const bigIntTokens = draftTokens.map((t) => BigInt(t));
      const tensorData = new BigInt64Array(bigIntTokens);
      const decoderInputTensor = new Tensor("int64", tensorData, [
        1,
        tensorData.length,
      ]);

      // Run forward pass
      const { logits } = await this.model({
        input_features: inputFeatures,
        decoder_input_ids: decoderInputTensor,
      });

      const seqLen = logits.dims[1];
      const vocabSize = logits.dims[2];

      // Check predictions
      let matches = 0;
      let verifiedTokens = [];

      for (let i = 0; i < seqLen - 1; i++) {
        let maxVal = -Infinity;
        let maxIdx = -1;

        const offset = i * vocabSize;

        for (let j = 0; j < vocabSize; j++) {
          const val = logits.data[offset + j];
          if (val > maxVal) {
            maxVal = val;
            maxIdx = j;
          }
        }

        const nextDraftToken = Number(draftTokens[i + 1]);

        if (maxIdx === nextDraftToken) {
          matches++;
          verifiedTokens.push(nextDraftToken);
        } else {
          console.log(
            `${id} Mismatch at pos ${i}: Draft=${nextDraftToken}, Pred=${maxIdx}`
          );
          if (i < 5) {
            console.log(`${id} Draft context: ${draftTokens.slice(0, i + 2)}`);
          }
          break;
        }
      }

      console.log(
        `${id} Verified ${matches}/${draftTokens.length - 1} draft tokens`
      );
      return {
        verifiedTokens,
        hitRate: matches / (draftTokens.length - 1 || 1),
        verifiedCount: matches,
        totalCount: draftTokens.length - 1,
      };
    } catch (error) {
      console.error(`${id} Verification failed:`, error);
      return {
        verifiedTokens: [],
        hitRate: 0,
        verifiedCount: 0,
        totalCount: 0,
      };
    }
  }

  /**
   * Check if processing should occur
   */
  shouldProcess() {
    if (this.isProcessing || !this.isReady()) {
      return false;
    }

    if (this.config.mode === ProcessingMode.CONTINUOUS) {
      return this.audioBuffer.length >= this.sampleRate * this.config.stepSize;
    } else if (this.config.mode === ProcessingMode.CHUNK) {
      return this.audioBuffer.length >= this.sampleRate * this.config.chunkSize;
    }

    return false;
  }

  /**
   * Process audio in continuous mode (L1)
   */
  async processContinuous() {
    if (!this.isReady()) {
      throw new Error("Model not initialized");
    }

    this.isProcessing = true;
    const processingStartTime = performance.now();
    const id = this._getId();

    try {
      // Process last 3 seconds (or less if at start)
      const maxSamples = this.sampleRate * 3;
      let bufferToProcess = this.audioBuffer;
      if (bufferToProcess.length > maxSamples) {
        bufferToProcess = bufferToProcess.slice(
          bufferToProcess.length - maxSamples
        );
      }

      // Process audio to features
      const inputs = await this.processor(bufferToProcess);

      // Generate tokens
      const generatedTokens = await this.model.generate({
        inputs: inputs.input_features,
        max_new_tokens: 448,
        language: this.language === "auto" ? null : this.language,
        task: "transcribe",
        ...this.config.generationParams,
      });

      // Decode tokens to text
      const text = await this.tokenizer.decode(generatedTokens[0], {
        skip_special_tokens: true,
      });

      const processingEndTime = performance.now();
      const inferenceTime = processingEndTime - processingStartTime;

      // Trim buffer, keeping last 1s of context
      const contextSamples = this.sampleRate * 1;
      if (this.audioBuffer.length > contextSamples) {
        this.audioBuffer = this.audioBuffer.slice(
          this.audioBuffer.length - contextSamples
        );
      }

      return {
        type: "partial",
        text: text.trim(),
        level: this.config.level,
        inferenceTime: inferenceTime,
        tokens: generatedTokens[0].tolist(),
      };
    } catch (error) {
      console.error(`${id} Error:`, error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process audio in chunk mode (L2-L4)
   */
  async processChunk() {
    if (!this.isReady()) {
      throw new Error("Model not initialized");
    }

    this.isProcessing = true;
    const processingStartTime = performance.now();
    const id = this._getId();

    try {
      const chunkSamples = Math.floor(this.config.chunkSize * this.sampleRate);
      const bufferToProcess = this.audioBuffer.slice(0, chunkSamples);

      // Process audio to features
      const inputs = await this.processor(bufferToProcess);

      // Generate tokens with optional speculative decoding
      let generatedTokens;
      let specStats = null;

      if (
        this.currentDraftTokens &&
        this.currentDraftTokens.length > 0 &&
        this.config.level > 1
      ) {
        // Speculative decoding
        console.log(
          `${id} Verifying ${this.currentDraftTokens.length} draft tokens...`
        );

        const verificationResult = await this._verifyDraftTokens(
          inputs.input_features,
          this.currentDraftTokens
        );
        const verifiedTokens = verificationResult.verifiedTokens;

        specStats = {
          hitRate: verificationResult.hitRate,
          verifiedCount: verificationResult.verifiedCount,
          totalCount: verificationResult.totalCount,
        };

        if (verifiedTokens.length > 0) {
          console.log(
            `${id} Using ${verifiedTokens.length} verified tokens for generation`
          );

          const validPrefix = [this.currentDraftTokens[0], ...verifiedTokens];

          try {
            generatedTokens = await this.model.generate({
              inputs: inputs.input_features,
              decoder_input_ids: [validPrefix],
              max_new_tokens: 448,
              language: this.language === "auto" ? null : this.language,
              task: "transcribe",
              ...this.config.generationParams,
            });

            console.log(`${id} Speculative generation complete`);
          } catch (error) {
            console.warn(
              `${id} Speculative generation failed, falling back to normal:`,
              error.message
            );
            generatedTokens = await this.model.generate({
              inputs: inputs.input_features,
              max_new_tokens: 448,
              language: this.language === "auto" ? null : this.language,
              task: "transcribe",
              ...this.config.generationParams,
            });
          }
        } else {
          console.log(
            `${id} No tokens verified (bad draft), falling back to normal generation`
          );
          generatedTokens = await this.model.generate({
            inputs: inputs.input_features,
            max_new_tokens: 448,
            language: this.language === "auto" ? null : this.language,
            task: "transcribe",
            ...this.config.generationParams,
          });
        }
      } else {
        // Normal generation
        generatedTokens = await this.model.generate({
          inputs: inputs.input_features,
          max_new_tokens: 448,
          language: this.language === "auto" ? null : this.language,
          task: "transcribe",
          ...this.config.generationParams,
        });
      }

      // Decode tokens to text
      const text = await this.tokenizer.decode(generatedTokens[0], {
        skip_special_tokens: true,
      });

      const processingEndTime = performance.now();
      const inferenceTime = processingEndTime - processingStartTime;

      const start = this.processedSamples / this.sampleRate;
      const end = (this.processedSamples + chunkSamples) / this.sampleRate;

      if (text.trim()) {
        console.log(
          `${id} Segment [${start.toFixed(1)}-${end.toFixed(
            1
          )}]: ${text.trim()}`
        );
      }

      // Shift buffer
      this.audioBuffer = this.audioBuffer.slice(chunkSamples);
      this.processedSamples += chunkSamples;

      return {
        type: "segment",
        text: text.trim(),
        start: start,
        end: end,
        level: this.config.level,
        inferenceTime: inferenceTime,
        chunkDuration: this.config.chunkSize,
        tokens: generatedTokens[0].tolist(),
        specStats: specStats,
      };
    } catch (error) {
      console.error(`${id} Error:`, error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Commit (reset buffer while maintaining timestamp continuity)
   */
  commit() {
    this.audioBuffer = new Float32Array(0);
    this.currentDraftTokens = [];
    // Don't reset processedSamples - keep timestamp continuity
  }

  /**
   * Get current state
   */
  getState() {
    return {
      isProcessing: this.isProcessing,
      bufferLength: this.audioBuffer.length,
      bufferDuration: this.audioBuffer.length / this.sampleRate,
      processedSamples: this.processedSamples,
      processedDuration: this.processedSamples / this.sampleRate,
      draftTokenCount: this.currentDraftTokens.length,
      mode: this.config.mode,
      level: this.config.level,
    };
  }

  /**
   * Dispose of resources
   */
  async dispose() {
    this.model = null;
    this.processor = null;
    this.tokenizer = null;
    this.audioBuffer = new Float32Array(0);
    this.currentDraftTokens = [];
    this.isProcessing = false;
    this.processedSamples = 0;
  }
}
