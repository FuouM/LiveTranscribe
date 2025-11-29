export class ModelManager {
  constructor() {
    this.transcriber = null;
    this.currentModel = "Xenova/whisper-tiny";
  }

  async createTranscriber(modelType, transcriptionDisplay) {
    // Import the Transcriber class dynamically
    const Transcriber = await this._importTranscriber();
    this.transcriber = new Transcriber((data) => {
      if (data.type === "full_transcript") {
        // Multi-agent strategy update: Full control from backend
        transcriptionDisplay.setCommittedSegments(data.segments); // Keep full segment objects with level info
        transcriptionDisplay.setCurrentPartial(data.partial || "");

        // Store replaced segments for diff comparison
        if (data.replacedSegments) {
          transcriptionDisplay.setReplacedSegments(data.replacedSegments);
        }

        // Update timing display
        if (data.timingStats) {
          transcriptionDisplay.updateTimingDisplayWithState(data.timingStats);
        }

        transcriptionDisplay.updateDisplay();
      } else if (data.type === "partial") {
        const deduplicatedText = transcriptionDisplay.deduplicateTranscription(
          data.text || "",
          "partial"
        );
        if (deduplicatedText) {
          transcriptionDisplay.setCurrentPartial(deduplicatedText);
          transcriptionDisplay.updateDisplay();
        }
      } else if (data.type === "final") {
        const finalText = data.text.trim();
        if (finalText) {
          const deduplicatedText =
            transcriptionDisplay.deduplicateTranscription(finalText, "final");
          if (deduplicatedText) {
            transcriptionDisplay.addCommittedSegment({
              text: deduplicatedText,
              level: 4,
            }); // Single-model finals are L4 (truth)
            transcriptionDisplay.setLastCommittedText(deduplicatedText);
            transcriptionDisplay.updateDisplay();
          }
        }
      } else if (data.type === "status") {
        // Status updates should be handled by the main app
        if (this.onStatusUpdate) {
          this.onStatusUpdate(data.text);
        }
      }
    });
    return this.transcriber;
  }

  async _importTranscriber() {
    const { Transcriber } = await import("../transcriber.js");
    return Transcriber;
  }

  getTranscriber() {
    return this.transcriber;
  }

  setCurrentModel(model) {
    this.currentModel = model;
  }

  getCurrentModel() {
    return this.currentModel;
  }

  // Callback for status updates
  setStatusUpdateCallback(callback) {
    this.onStatusUpdate = callback;
  }
}
