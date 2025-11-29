import {
  getTokenDisplay,
  getStreamingTokens,
  getStreamingTps,
} from "../utils/dom-helpers.js";

export class StreamingManager {
  constructor() {
    this.streamingWorker = null;
    this.streamingWorkerReady = false;
    this.streamingTokenCount = 0;
    this.streamingTps = 0;
    this.streamingTokenBuffer = []; // Rolling buffer of last 20 tokens
  }

  initializeStreamingWorker() {
    if (this.streamingWorker) {
      this.streamingWorker.terminate();
      this.streamingWorkerReady = false;
    }

    try {
      this.streamingWorker = new Worker("../workers/streaming-worker.js", {
        type: "module",
      });
      this.streamingWorker.onmessage = (event) =>
        this.handleStreamingWorkerMessage(event);
      this.streamingWorkerReady = false; // Reset ready flag

      // Load the streaming model
      this.streamingWorker.postMessage({ type: "load" });

      return this.streamingWorker;
    } catch (error) {
      console.error("Error creating streaming worker:", error);
      this.streamingWorkerReady = false;
      return null;
    }
  }

  handleStreamingWorkerMessage(event) {
    const { status, data, output, tps, numTokens, err } = event.data;

    if (err) {
      // Only log non-processing errors
      if (
        !err.includes("Already processing") &&
        !err.includes("Not enough new audio")
      ) {
        console.error("Streaming worker error:", err);
        // Note: updateStatus is not available in this module, should be passed as callback
      }
      return;
    }

    switch (status) {
      case "loading":
        console.log("Streaming worker loading:", data);
        break;

      case "ready":
        console.log("Streaming worker ready!");
        this.streamingWorkerReady = true;
        break;

      case "start":
        console.log("Streaming transcription started");
        // streamingTokens = []; (this variable doesn't exist, probably a bug)
        this.streamingTokenCount = 0;
        this.streamingTps = 0;
        this.updateStreamingDisplay();
        break;

      case "update":
        if (output) {
          // Parse new tokens from the streaming output
          const newTokens = output
            .split(/\s+/)
            .filter((token) => token.length > 0);

          // Add new tokens to the rolling buffer
          this.streamingTokenBuffer.push(...newTokens);

          // Keep only the last 20 tokens
          if (this.streamingTokenBuffer.length > 20) {
            this.streamingTokenBuffer = this.streamingTokenBuffer.slice(-20);
          }

          this.streamingTokenCount = numTokens;
          this.streamingTps = tps || 0;

          this.updateStreamingDisplay();
          // L0 only shows in dedicated streaming section
        }
        break;

      case "complete":
        console.log("Streaming transcription complete");
        break;

      default:
        console.log("Unknown streaming worker status:", status);
    }
  }

  updateStreamingDisplay() {
    const tokenDisplay = getTokenDisplay();
    const streamingTokensEl = getStreamingTokens();
    const streamingTpsEl = getStreamingTps();

    if (!tokenDisplay) return;

    // Update token display with rolling buffer
    tokenDisplay.innerHTML = "";
    this.streamingTokenBuffer.forEach((token, index) => {
      const tokenElement = document.createElement("span");
      tokenElement.className = "token-item";
      tokenElement.textContent = token;
      tokenDisplay.appendChild(tokenElement);
    });

    // Update stats
    if (streamingTokensEl) {
      streamingTokensEl.textContent = `${this.streamingTokenCount} tokens`;
    }
    if (streamingTpsEl) {
      streamingTpsEl.textContent = `${this.streamingTps.toFixed(1)} TPS`;
    }
  }

  startStreamingTranscription(audioData) {
    if (!this.streamingWorker || !this.streamingWorkerReady) {
      return;
    }

    this.streamingWorker.postMessage({
      type: "add_audio",
      data: {
        audio: audioData,
        language: "en",
      },
    });
  }

  stopStreamingTranscription() {
    // Reset streaming data
    // streamingTokens = []; (this variable doesn't exist, probably a bug)
    this.streamingTokenCount = 0;
    this.streamingTps = 0;
    this.streamingTokenBuffer = [];
    this.updateStreamingDisplay();
  }

  terminate() {
    if (this.streamingWorker) {
      this.streamingWorker.terminate();
      this.streamingWorker = null;
      this.streamingWorkerReady = false;
    }
  }

  isReady() {
    return this.streamingWorkerReady;
  }

  getWorker() {
    return this.streamingWorker;
  }
}
