import { getRecordingTimer } from "../utils/dom-helpers.js";

export class TimerManager {
  constructor() {
    this.recordingStartTime = null;
    this.recordingTimerInterval = null;
  }

  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  updateRecordingTimer() {
    if (this.recordingStartTime) {
      const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
      getRecordingTimer().textContent = this.formatTime(elapsed);
    }
  }

  startRecordingTimer() {
    this.recordingStartTime = Date.now();
    getRecordingTimer().style.display = "inline-block";
    this.recordingTimerInterval = setInterval(
      () => this.updateRecordingTimer(),
      1000
    );
    this.updateRecordingTimer(); // Update immediately
  }

  stopRecordingTimer() {
    this.recordingStartTime = null;
    if (this.recordingTimerInterval) {
      clearInterval(this.recordingTimerInterval);
      this.recordingTimerInterval = null;
    }
    getRecordingTimer().style.display = "none";
    getRecordingTimer().textContent = "00:00:00";
  }

  getElapsedTime() {
    if (!this.recordingStartTime) return 0;
    return Math.floor((Date.now() - this.recordingStartTime) / 1000);
  }

  isRunning() {
    return this.recordingStartTime !== null;
  }
}
