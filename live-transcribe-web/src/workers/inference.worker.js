import {
  AutoModelForSpeechSeq2Seq,
  AutoProcessor,
  AutoTokenizer,
  env,
  Tensor,
} from "@huggingface/transformers";

// Configure environment
env.allowRemoteModels = true;
// Configure ONNX runtime for WASM
env.backends.onnx.wasm.numThreads = 1;

// Low-level API components (replacing pipeline)
let model = null;
let processor = null;
let tokenizer = null;

// State variables
let audioBuffer = new Float32Array(0);
let isProcessing = false;
let processedSamples = 0;
let language = "en";
let backend = "webgpu";
let modelName = "Xenova/whisper-tiny";
let quant = null;

// Draft tokens for speculative decoding (Phase 2+)
let currentDraftTokens = []; // Accumulator for draft tokens

// Default Configuration
let config = {
  mode: "legacy", // 'legacy', 'continuous', 'chunk'
  chunkSize: 5, // seconds (for chunk mode)
  stepSize: 1, // seconds (for continuous mode trigger)
  level: 0,
};

self.onmessage = async (e) => {
  const { type, data, draftTokens, tokens } = e.data;

  if (type === "configure") {
    config = { ...config, ...e.data.config };
    console.log(`[Worker L${config.level}] Configured:`, config);
  } else if (type === "init") {
    language = e.data.language;
    backend = e.data.backend || "webgpu";
    modelName = e.data.model || "Xenova/whisper-tiny";
    quant = e.data.quant;
    if (e.data.config) config = { ...config, ...e.data.config };
    await initModel();
  } else if (type === "audio") {
    // Append new audio data
    const newBuffer = new Float32Array(audioBuffer.length + data.length);
    newBuffer.set(audioBuffer);
    newBuffer.set(data, audioBuffer.length);
    audioBuffer = newBuffer;

    checkProcessing();
  } else if (type === "draft_tokens") {
    // Receive draft tokens from previous layer
    if (tokens && tokens.length > 0) {
      // Append to current accumulator
      // Note: tokens might include special tokens (start/end) which we might need to filter
      // But for now, let's just append and see if we can align.
      // Actually, simply appending might duplicate start tokens.
      // We should probably just replace for now, or be smarter.

      // Strategy: Since L1 sends partials (updates), we should probably replace?
      // But L1 partials are short. L2 needs 5s worth.
      // If L1 sends "Hello", then "Hello world", we want "Hello world".
      // So replacing is correct for partials.

      // But if L2 sends "Hello world" (0-5s) and then "How are you" (5-10s) to L3 (0-10s)?
      // Then L3 needs "Hello world How are you".
      // So for chunks, we append. For partials, we replace?

      // Let's try a simple append strategy but filter start tokens if not first.
      // Or simpler: Just store what we get and let verifyDraftTokens handle it?
      // No, verifyDraftTokens expects a sequence.

      // Let's assume for now we just replace with the latest draft for L1->L2
      // Because L1 is continuous and "grows".
      // For L2->L3, L2 produces chunks. So we should append.

      if (config.level === 2) {
        // L1 -> L2: L1 is continuous, so it sends the "whole current sentence" usually.
        // So we replace.
        currentDraftTokens = tokens;
      } else {
        // L2 -> L3, L3 -> L4: Chunks. We append.
        // Filter start tokens (header) from subsequent chunks
        // We assume header tokens are special tokens at the start (>= 50257)
        // We want to keep timestamps if they are part of the content, but usually header comes before timestamps.
        // Header: <|startoftranscript|> <|en|> <|transcribe|> <|notimestamps|> (or similar)

        let newTokens = Array.from(tokens);

        if (currentDraftTokens.length > 0) {
          // Strip header tokens from the new chunk
          // Keep stripping while token is special (>= 50257) AND it's at the start
          // BUT be careful not to strip timestamps if they are the first thing (unlikely for header)
          // Header tokens are usually specific ones.
          // Let's just strip the first few if they look like header.

          let startIndex = 0;
          while (
            startIndex < newTokens.length &&
            newTokens[startIndex] >= 50257
          ) {
            // Check if it's a timestamp? Timestamps are >= 50364 (usually)
            // <|notimestamps|> is 50363.
            // So header is < 50364?
            // Actually, let's just look at the values.
            // 50258 (start), 50259 (en), 50359 (transcribe), 50363 (notimestamps)
            // Timestamps start at 50364.
            if (newTokens[startIndex] >= 50364) {
              // It's a timestamp, stop stripping (it's content)
              break;
            }
            startIndex++;
          }

          if (startIndex > 0) {
            // console.log(`[Worker L${config.level}] Stripped ${startIndex} header tokens from append`);
            newTokens = newTokens.slice(startIndex);
          }

          currentDraftTokens = [...currentDraftTokens, ...newTokens];
        } else {
          currentDraftTokens = [...currentDraftTokens, ...newTokens];
        }
      }
      // console.log(`[Worker L${config.level}] Updated draft buffer: ${currentDraftTokens.length} tokens`);
    }
  } else if (type === "commit") {
    // Reset audio buffer but keep timestamp continuity to avoid overlap issues
    audioBuffer = new Float32Array(0);
    // Clear draft tokens on commit
    currentDraftTokens = [];
    // Don't reset processedSamples - keep timestamp continuity
    self.postMessage({ type: "reset" });
  }
};

// Comprehensive quantization validation function
async function validateQuantization(model, requestedDtype, fileValidation, id) {
  console.log(`${id} Validating quantization: requested=${requestedDtype}`);

  let actualDtype = "unknown";
  let validationLevel = 0;

  try {
    // Check model configuration for dtype
    if (model.config && model.config.dtype) {
      actualDtype = model.config.dtype;
      console.log(`${id} Model config dtype: ${actualDtype}`);
    }

    // Try to inspect model properties for dtype information
    if (model.model && model.model.dtype) {
      actualDtype = model.model.dtype;
      console.log(`${id} Model dtype (from model.model): ${actualDtype}`);
    }

    // Check if model has quantized weights by inspecting tensor info
    if (model.model && typeof model.model._get_tensor === "function") {
      try {
        // Get a sample tensor to check its dtype
        const sampleTensor = model.model._get_tensor
          ? await model.model._get_tensor("encoder.embed_positions.weight")
          : null;
        if (sampleTensor && sampleTensor.dtype) {
          actualDtype = sampleTensor.dtype;
          console.log(`${id} Sample tensor dtype: ${actualDtype}`);
        }
      } catch (tensorError) {
        console.log(
          `${id} Could not inspect tensor dtype: ${tensorError.message}`
        );
      }
    }

    // Check model properties for quantization indicators
    if (model.model) {
      const modelKeys = Object.keys(model.model);
      const quantIndicators = modelKeys.filter((key) => {
        const keyLower = key.toLowerCase();
        return (
          keyLower.includes("quant") ||
          keyLower.includes("q4") ||
          keyLower.includes("fp16")
        );
      });
      if (quantIndicators.length > 0) {
        console.log(
          `${id} Quantization indicators found: ${quantIndicators.join(", ")}`
        );
      }
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
    }
    // Level 2: Equivalent type match
    else if (
      dtypeEquivalents[requestedDtype] &&
      dtypeEquivalents[requestedDtype].includes(actualDtype)
    ) {
      validationLevel = 2;
      console.log(
        `${id} ✅ Dtype validation: Model is using equivalent type ${actualDtype} for requested ${requestedDtype}`
      );
    }
    // Level 3: File-based validation fallback
    else if (fileValidation.hasQuantFiles && requestedDtype !== "fp32") {
      validationLevel = 1;
      console.log(
        `${id} ✅ Dtype validation: File-based validation confirms ${requestedDtype} quantization`
      );
    }
    // Level 4: Property-based validation
    else if (
      model.model &&
      Object.keys(model.model).some((key) => {
        const keyLower = key.toLowerCase();
        return (
          dtypeEquivalents[requestedDtype] &&
          dtypeEquivalents[requestedDtype].some((pattern) =>
            keyLower.includes(pattern)
          )
        );
      })
    ) {
      validationLevel = 1;
      console.log(
        `${id} ✅ Dtype validation: Model properties indicate ${requestedDtype} quantization`
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

    // Send validation status to UI and log
    if (requestedDtype !== "fp32" && validationLevel > 0) {
      const validationMsg = `✅ Model validated: Using ${requestedDtype} quantization`;
      console.log(`${id} ${validationMsg}`);
      self.postMessage({ type: "status", text: validationMsg });
    } else if (validationLevel === 0) {
      const warningMsg = `⚠️ Quantization validation uncertain for ${requestedDtype}`;
      console.warn(`${id} ${warningMsg}`);
      self.postMessage({ type: "status", text: warningMsg });
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
      } else {
        console.warn(
          `${id} ❓ File validation: Could not determine file types for fp32`
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
    console.error(`${id} Error during quantization validation:`, error.message);
  }
}

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

    // Load model, processor, and tokenizer separately (low-level API)
    console.log(`${id} Loading model components...`);

    // Load model
    // Load model
    const loadOptions = {
      device: backend,
      progress_callback: (progress) => {
        if (progress.status === "progress") {
          self.postMessage({
            type: "load_progress",
            level: config.level,
            progress: progress.progress,
            file: progress.file,
          });
        }
      },
    };

    // Track file loading for quantization validation
    let fileValidation = {
      hasQuantFiles: false,
      hasFp32Files: false,
      totalFiles: 0,
    };

    // Handle quantization options
    if (quant) {
      console.log(`${id} Using quantization: ${quant}`);
      // Strictly use dtype, remove legacy quantized property
      if (quant === "q4") {
        loadOptions.dtype = "q4";
      } else if (quant === "fp16") {
        loadOptions.dtype = "fp16";
      } else {
        console.warn(
          `${id} Unsupported quantization: ${quant}, defaulting to q4`
        );
        loadOptions.dtype = "q4";
      }
    }

    // Enhanced progress callback with quantization validation
    const originalProgressCallback = loadOptions.progress_callback;
    loadOptions.progress_callback = (progress) => {
      if (progress.status === "progress" || progress.status === "initiate") {
        // Track files for quantization validation
        if (progress.file) {
          fileValidation.totalFiles++;

          const fileName = progress.file.toLowerCase();
          const requestedDtype = quant || "fp16"; // Default to fp16 if no quant specified

          // Check for quantization-specific file patterns
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

      // Call original progress callback
      if (originalProgressCallback) {
        originalProgressCallback(progress);
      }
    };

    const loadStartTime = Date.now();
    model = await AutoModelForSpeechSeq2Seq.from_pretrained(
      modelName,
      loadOptions
    );
    const loadTime = Date.now() - loadStartTime;
    console.log(`${id} Model loaded in ${loadTime}ms`);

    // Validate quantization after loading
    if (quant) {
      self.postMessage({
        type: "status",
        text: `${id} Validating quantization...`,
      });
      await validateQuantization(model, quant, fileValidation, id);
    }

    // Load processor
    processor = await AutoProcessor.from_pretrained(modelName);
    console.log(`${id} Processor loaded`);

    // Load tokenizer
    tokenizer = await AutoTokenizer.from_pretrained(modelName);
    console.log(`${id} Tokenizer loaded`);

    console.log(`${id} All components loaded with ${backend.toUpperCase()}`);
    const quantInfo = quant ? ` (${quant})` : "";
    self.postMessage({ type: "status", text: `${id} Ready${quantInfo}` });
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

        model = await AutoModelForSpeechSeq2Seq.from_pretrained(modelName, {
          device: "wasm",
        });
        processor = await AutoProcessor.from_pretrained(modelName);
        tokenizer = await AutoTokenizer.from_pretrained(modelName);

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
  if (isProcessing || !model || !processor || !tokenizer) return;

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

// Verify draft tokens against the model's predictions
async function verifyDraftTokens(model, input_features, draftTokens) {
  const id = `[Worker L${config.level}]`;
  try {
    // Create decoder input tensor with batch dimension
    // Ensure strict BigInt64Array to avoid WebGPU type mismatch errors
    const bigIntTokens = draftTokens.map((t) => BigInt(t));
    const tensorData = new BigInt64Array(bigIntTokens);
    const decoderInputTensor = new Tensor("int64", tensorData, [
      1,
      tensorData.length,
    ]);

    // Run forward pass
    const { logits } = await model({
      input_features: input_features,
      decoder_input_ids: decoderInputTensor,
    });

    const seqLen = logits.dims[1];
    const vocabSize = logits.dims[2];

    // Check predictions
    let matches = 0;
    let verifiedTokens = [];

    // We compare logits[i] with draftTokens[i+1]
    // logits[0] predicts the token at index 1.
    for (let i = 0; i < seqLen - 1; i++) {
      let maxVal = -Infinity;
      let maxIdx = -1;

      const offset = i * vocabSize;

      // Find argmax
      for (let j = 0; j < vocabSize; j++) {
        const val = logits.data[offset + j];
        if (val > maxVal) {
          maxVal = val;
          maxIdx = j;
        }
      }

      const nextDraftToken = Number(draftTokens[i + 1]); // Convert to Number to handle BigInts

      if (maxIdx === nextDraftToken) {
        matches++;
        verifiedTokens.push(nextDraftToken);
      } else {
        // Mismatch found, stop verification
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
      hitRate: matches / (draftTokens.length - 1 || 1), // Avoid div by zero
      verifiedCount: matches,
      totalCount: draftTokens.length - 1,
    };
  } catch (error) {
    console.error(`${id} Verification failed:`, error);
    return { verifiedTokens: [], hitRate: 0, verifiedCount: 0, totalCount: 0 };
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

    // Step 1: Process audio to features using processor
    const inputs = await processor(bufferToProcess);

    // Step 2: Generate tokens using model
    // PHASE 2: Use draft tokens if available (speculative decoding)
    let generatedTokens;
    let specStats = null;

    if (
      currentDraftTokens &&
      currentDraftTokens.length > 0 &&
      config.level > 1
    ) {
      // Speculative decoding: verify draft tokens first
      console.log(
        `${id} Verifying ${currentDraftTokens.length} draft tokens...`
      );

      // Verify tokens
      const verificationResult = await verifyDraftTokens(
        model,
        inputs.input_features,
        currentDraftTokens
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

        // We need to include the start tokens + verified tokens
        // The draftTokens usually include start tokens.
        // verifyDraftTokens returns only the *verified* subsequent tokens.
        // We need to reconstruct the valid prefix.

        // Actually verifyDraftTokens returns the tokens that matched.
        // We need to prepend the start tokens that were in draftTokens[0] (if any).
        // Wait, draftTokens[0] is usually <|startoftranscript|>.
        // Our loop started at i=0 comparing logits[0] (prediction for pos 1) with draftTokens[1].
        // So verifiedTokens contains draftTokens[1...k].
        // We need to keep draftTokens[0] + verifiedTokens.

        const validPrefix = [currentDraftTokens[0], ...verifiedTokens];

        try {
          generatedTokens = await model.generate({
            inputs: inputs.input_features,
            decoder_input_ids: [validPrefix], // Use verified prefix
            max_new_tokens: 448, // Generate rest
            language: language === "auto" ? null : language,
            task: "transcribe",
            ...config.generationParams, // Adaptive beam search parameters
          });

          console.log(`${id} Speculative generation complete`);
        } catch (error) {
          console.warn(
            `${id} Speculative generation failed, falling back to normal:`,
            error.message
          );
          generatedTokens = await model.generate({
            inputs: inputs.input_features,
            max_new_tokens: 448,
            language: language === "auto" ? null : language,
            task: "transcribe",
            ...config.generationParams, // Adaptive beam search parameters
          });
        }
      } else {
        console.log(
          `${id} No tokens verified (bad draft), falling back to normal generation`
        );
        generatedTokens = await model.generate({
          inputs: inputs.input_features,
          max_new_tokens: 448,
          language: language === "auto" ? null : language,
          task: "transcribe",
          ...config.generationParams, // Adaptive beam search parameters
        });
      }
    } else {
      // Normal generation (L1 or no draft tokens available)
      generatedTokens = await model.generate({
        inputs: inputs.input_features,
        max_new_tokens: 448, // Whisper max length
        language: language === "auto" ? null : language,
        task: "transcribe",
        ...config.generationParams, // Adaptive beam search parameters
      });
    }

    // Step 3: Decode tokens to text using tokenizer
    const text = await tokenizer.decode(generatedTokens[0], {
      skip_special_tokens: true,
    });

    const processingEndTime = performance.now();
    const inferenceTime = processingEndTime - processingStartTime;

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
        tokens: generatedTokens[0].tolist(), // NEW: Convert Tensor to array for postMessage
        specStats: specStats, // NEW: Send speculative decoding stats
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

    // Step 1: Process audio to features
    const inputs = await processor(bufferToProcess);

    // Step 2: Generate tokens
    const generatedTokens = await model.generate({
      inputs: inputs.input_features,
      max_new_tokens: 448,
      language: language === "auto" ? null : language,
      task: "transcribe",
      ...config.generationParams, // Adaptive beam search parameters
    });

    // Step 3: Decode tokens to text
    const text = await tokenizer.decode(generatedTokens[0], {
      skip_special_tokens: true,
    });

    const processingEndTime = performance.now();
    const inferenceTime = processingEndTime - processingStartTime;

    if (text.trim()) {
      self.postMessage({
        type: "partial",
        text: text.trim(),
        level: 1,
        inferenceTime: inferenceTime,
        tokens: generatedTokens[0].tolist(), // Convert Tensor to array for postMessage
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
