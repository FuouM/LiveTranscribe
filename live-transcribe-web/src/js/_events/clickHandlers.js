import { dom } from "../dom.js";
import { eventBus } from "./eventBus.js";

function getClickHandler(element, emitEvent) {
  if (element && emitEvent) {
    element.addEventListener("click", () => {
      eventBus.emit(emitEvent);
    });
  } else {
    console.warn(`Element or event not found: ${element} ${emitEvent}`);
  }
}

export function initClickHandlers() {
  const startBtn = dom.startBtn();
  const stopBtn = dom.stopBtn();

  if (startBtn) {
    getClickHandler(startBtn, "start_recording");
  }

  if (stopBtn) {
    getClickHandler(stopBtn, "stop_recording");
  }
}
