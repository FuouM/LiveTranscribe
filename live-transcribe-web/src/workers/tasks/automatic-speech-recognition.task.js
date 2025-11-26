/**
 * Formats a number of seconds into a MM:SS.sss timestamp string.
 * @param {number} seconds The number of seconds.
 * @returns {string} The formatted timestamp string.
 */
function formatTimestamp(seconds) {
  if (typeof seconds !== "number" || isNaN(seconds)) {
    return "00:00"; // Return a default for invalid input
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(2).padStart(5, "0");
  return `${String(minutes).padStart(2, "0")}:${remainingSeconds}`;
}

/**
 * Post-processes the output of an automatic-speech-recognition model.
 * @param {object} output - The raw output from the pipeline, e.g., { text: "...", chunks: [...] }.
 * @param {string} inputUrl - The URL of the input audio (not used in this function but part of the standard signature).
 * @param {object} options - The pipeline options, checked for `return_timestamps`.
 * @returns {Promise<string>} The formatted transcribed text, with or without timestamps.
 */
export async function postprocess(output, inputUrl, options) {
  if (!output || !output.chunks) {
    // Return the plain text if there are no chunks (e.g., on failure or for simple models)
    return (output.text || "").trim();
  }

  const a = options.return_timestamps;
  const return_timestamps_value =
    a === "true" ? true : a === "false" ? false : a;

  if (return_timestamps_value === "word") {
    // Word-level timestamps: format as a single line of text.
    return output.chunks
      .map((chunk) => {
        // The timestamp is just the start time for word-level
        const [startTime] = chunk.timestamp;
        return `[${formatTimestamp(startTime)}]${chunk.text}`;
      })
      .join("\n");
  } else if (return_timestamps_value === true) {
    // Sentence-level timestamps: format as a multi-line list.
    return output.chunks
      .map((chunk) => {
        const [startTime, endTime] = chunk.timestamp;
        const formattedStart = formatTimestamp(startTime);
        const formattedEnd = formatTimestamp(endTime);
        return `[${formattedStart} -> ${formattedEnd}]${chunk.text}`;
      })
      .join("\n");
  } else {
    // No timestamps: just return the plain text.
    return output.text.trim();
  }
}

/**
 * Custom run function for ASR that handles real-time processing
 * @param {object} pipeline - The inference pipeline
 * @param {Float32Array} data - Audio data
 * @param {object} options - Pipeline options
 * @returns {Promise<object>} The processed output
 */
export async function run(pipeline, data, options) {
  // Process the audio data with Whisper
  const result = await pipeline(data, {
    language: options.language,
    task: options.task || "transcribe",
    chunk_length_s: options.chunk_length_s || 30,
    stride_length_s: options.stride_length_s || 5,
    return_timestamps: options.return_timestamps || "word",
  });

  return result;
}

/**
 * Creates a pipeline for ASR with proper configuration
 * @param {string} modelId - Model identifier
 * @param {object} options - Pipeline options
 * @returns {Promise<object>} Configured pipeline
 */
export async function createPipeline(modelId, options) {
  const { pipeline } = await import("@huggingface/transformers");

  return await pipeline("automatic-speech-recognition", modelId, {
    device: options.device || "webgpu",
  });
}
