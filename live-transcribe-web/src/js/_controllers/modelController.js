import {
  state,
  setProcessing,
  setInferenceStartTime,
  setInferenceDuration,
} from "../state.js";
import { dom } from "../dom.js";
import { eventBus } from "../_events/eventBus.js";

let inferenceWorker;

export function initWorker() {
  inferenceWorker = new Worker(
    new URL("../../workers/inference.worker.js", import.meta.url),
    { type: "module" }
  );

  inferenceWorker.onmessage = (e) => {
    const { type, data, text, level, progress, file } = e.data;
    if (type === "result") {
      const duration = Date.now() - state.workbench.inferenceStartTime;
      setInferenceDuration(duration);
      setProcessing(false);
    } else if (type === "error") {
      dom.statusText().textContent = `Status: ${data || text}`;
      setProcessing(false);
    } else if (type === "status") {
      const statusEl = dom.statusText();
      if (statusEl) statusEl.textContent = `Status: ${data || text}`;
    } else if (type === "load_progress") {
      const statusEl = dom.statusText();
      if (statusEl) {
        const levelText = level ? `[L${level}] ` : "";
        const fileName = file ? file.split("/").pop() : "model";
        statusEl.textContent = `${levelText}Loading: ${fileName} - ${Math.round(
          progress * 100
        )}%`;
      }
    } else if (type === "transcription") {
      // Handle transcription updates through event bus
      eventBus.emit("transcription_update", data);
    }
  };
}

export async function startTranscription(audioStream, language, backend) {
  const activeModule = state.models.modules.find(
    (m) => m.id === state.models.activeModuleId
  );

  if (!activeModule || !audioStream) return;

  setProcessing(true);
  setInferenceStartTime(Date.now());

  try {
    console.log(
      "Starting transcription with model:",
      activeModule.id,
      "language:",
      language,
      "backend:",
      backend
    );
    inferenceWorker.postMessage({
      type: "start_transcription",
      modelId: activeModule.id,
      task: activeModule.task,
      language: language,
      backend: backend,
    });
  } catch (error) {
    console.error("Error starting transcription:", error);
    dom.statusText().textContent = `Error: ${error.message}`;
    setProcessing(false);
  }
}

export function stopTranscription() {
  if (inferenceWorker) {
    inferenceWorker.postMessage({ type: "stop_transcription" });
  }
  setProcessing(false);
}

export function sendAudioData(audioData, metadata) {
  if (inferenceWorker) {
    console.log("Sending audio data to worker:", audioData.length, "samples");
    inferenceWorker.postMessage({
      type: "audio_data",
      data: audioData,
      metadata: metadata,
    });
  } else {
    console.error("No inference worker available to send audio data");
  }
}
