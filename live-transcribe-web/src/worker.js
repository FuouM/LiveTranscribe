import { pipeline, env } from "@huggingface/transformers";

// Configure environment
env.allowRemoteModels = true;

let transcriber = null;
let audioBuffer = new Float32Array(0);
let isProcessing = false;
let language = "en";
let backend = "webgpu";
let shouldProcess = false;

self.onmessage = async (e) => {
  const { type, data, metadata } = e.data;

  if (type === "init") {
    language = e.data.language;
    backend = e.data.backend || "webgpu";
    console.log(
      "[Worker] Init requested with language:",
      language,
      "backend:",
      backend
    );
    await initModel();
  } else if (type === "audio") {
    // Append new audio data
    const newBuffer = new Float32Array(audioBuffer.length + data.length);
    newBuffer.set(audioBuffer);
    newBuffer.set(data, audioBuffer.length);
    audioBuffer = newBuffer;

    console.log(
      "[Worker] Audio buffer size:",
      audioBuffer.length,
      "samples (~" + (audioBuffer.length / 16000).toFixed(2) + "s)"
    );

    // Trigger processing if not already processing
    if (!isProcessing && audioBuffer.length >= 16000 * 1.0) {
      // Wait for at least 1s of audio
      processAudio();
    }
  } else if (type === "commit") {
    // Silence detected - commit current result and reset buffer
    console.log("[Worker] Commit requested, resetting buffer");
    if (audioBuffer.length > 0 && !isProcessing) {
      // Process remaining audio before reset
      await processAudio();
    }
    // Reset buffer completely
    audioBuffer = new Float32Array(0);
    self.postMessage({ type: "final", text: "" }); // Signal segment end
  }
};

async function initModel() {
  self.postMessage({ type: "status", text: "Loading model..." });
  console.log("[Worker] Starting model load...");

  const preferredBackend = backend;

  try {
    // Use Whisper Tiny for speed/demo
    transcriber = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-tiny",
      {
        device: preferredBackend,
      }
    );
    console.log("[Worker] Model loaded with", preferredBackend.toUpperCase());
    self.postMessage({
      type: "status",
      text: `Model loaded (${preferredBackend.toUpperCase()})`,
    });
  } catch (err) {
    if (preferredBackend === "webgpu") {
      console.warn("[Worker] WebGPU failed, falling back to WASM", err);
      transcriber = await pipeline(
        "automatic-speech-recognition",
        "Xenova/whisper-tiny",
        {
          device: "wasm",
        }
      );
      console.log("[Worker] Model loaded with WASM");
      self.postMessage({
        type: "status",
        text: "Model loaded (WASM - fallback)",
      });
    } else {
      throw err;
    }
  }
}

async function processAudio() {
  if (!transcriber) {
    console.log("[Worker] Transcriber not ready");
    return;
  }

  if (audioBuffer.length < 16000 * 1.0) {
    console.log("[Worker] Buffer too small:", audioBuffer.length);
    return;
  }

  isProcessing = true;
  console.log("[Worker] Starting inference on", audioBuffer.length, "samples");
  self.postMessage({ type: "status", text: "Processing audio..." });

  // Take a snapshot of the current buffer to process
  const bufferToProcess = audioBuffer.slice();

  try {
    const startTime = Date.now();

    // Process the buffer
    const output = await transcriber(bufferToProcess, {
      language: language === "auto" ? null : language,
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: "word", // Enable word-level timestamps
    });

    const elapsed = Date.now() - startTime;
    console.log("[Worker] Inference completed in", elapsed, "ms");

    let text = output.text || "";
    console.log("[Worker] Transcription result:", text);

    // Smart buffer trimming: Find completed sentences
    let trimPoint = null;
    let lastSentenceEnd = null;

    if (output.chunks && output.chunks.length > 0) {
      // Look for sentence-ending punctuation in the first 75% of the buffer
      // (more lenient than 50% to catch more sentences)
      const searchLimit = (bufferToProcess.length / 16000) * 0.75;

      for (let i = output.chunks.length - 1; i >= 0; i--) {
        const chunk = output.chunks[i];
        const chunkText = chunk.text || "";
        const chunkEnd = chunk.timestamp[1];

        // If this chunk ends before search limit and has sentence-ending punctuation
        if (
          chunkEnd &&
          chunkEnd < searchLimit &&
          /[.!?]$/.test(chunkText.trim())
        ) {
          trimPoint = chunkEnd;

          // Find the previous sentence boundary (if any)
          for (let j = i - 1; j >= 0; j--) {
            const prevChunk = output.chunks[j];
            const prevText = prevChunk.text || "";
            if (/[.!?]$/.test(prevText.trim())) {
              lastSentenceEnd = prevChunk.timestamp[1];
              break;
            }
          }

          console.log(
            "[Worker] Found sentence boundary at",
            trimPoint,
            "s (search limit:",
            searchLimit,
            "s)"
          );
          break;
        }
      }
    }

    // If we found a sentence boundary, trim the buffer and commit that part
    if (trimPoint) {
      const trimSamples = Math.floor(trimPoint * 16000);

      // Get only the NEW sentence (from last sentence end to current trim point)
      const startTime = lastSentenceEnd || 0;
      const newSentence = output.chunks
        .filter(
          (c) => c.timestamp[1] > startTime && c.timestamp[1] <= trimPoint
        )
        .map((c) => c.text)
        .join("");

      // Trim the buffer
      audioBuffer = audioBuffer.slice(trimSamples);
      console.log(
        "[Worker] Trimmed",
        trimSamples,
        "samples, buffer now",
        audioBuffer.length,
        "samples"
      );

      // Send only the NEW sentence as final
      if (newSentence.trim()) {
        self.postMessage({ type: "final", text: newSentence.trim() });
      }

      // Send remaining text as partial
      const remainingText = output.chunks
        .filter((c) => c.timestamp[1] > trimPoint)
        .map((c) => c.text)
        .join("");
      if (remainingText) {
        self.postMessage({ type: "partial", text: remainingText.trim() });
      }
    } else {
      // No sentence boundary found, send as partial
      self.postMessage({ type: "partial", text: text });
    }

    self.postMessage({ type: "status", text: "Listening..." });
  } catch (err) {
    console.error("[Worker] Inference error", err);
    self.postMessage({ type: "status", text: "Error: " + err.message });
  } finally {
    isProcessing = false;

    // Sliding window optimization: Keep only last 30s of context
    const maxBufferSize = 16000 * 30; // 30 seconds at 16kHz
    if (audioBuffer.length > maxBufferSize) {
      const trimAmount = audioBuffer.length - maxBufferSize;
      audioBuffer = audioBuffer.slice(trimAmount);
      console.log("[Worker] Trimmed buffer, keeping last 30s of context");
    }

    // Check if we have more audio accumulated while processing
    // If we do, process it immediately
    if (audioBuffer.length >= 16000 * 1.0) {
      console.log("[Worker] More audio accumulated, processing next chunk");
      // Use setTimeout to avoid blocking
      setTimeout(() => processAudio(), 0);
    }
  }
}
