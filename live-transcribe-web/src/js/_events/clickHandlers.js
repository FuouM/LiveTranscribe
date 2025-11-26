import { dom } from "../dom.js";
import { eventBus } from "./eventBus.js";

export function initClickHandlers() {
  const startBtn = dom.startBtn();
  const stopBtn = dom.stopBtn();

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      eventBus.emit("start_recording");
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      eventBus.emit("stop_recording");
    });
  }
}
