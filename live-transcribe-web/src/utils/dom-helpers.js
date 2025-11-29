// DOM element getter functions

export function getStartBtn() {
  return document.getElementById("start-btn");
}

export function getStopBtn() {
  return document.getElementById("stop-btn");
}

export function getModelSelect() {
  return document.getElementById("model-select");
}

export function getLanguageSelect() {
  return document.getElementById("language-select");
}

export function getBackendSelect() {
  return document.getElementById("backend-select");
}

export function getQuantSelect() {
  return document.getElementById("quant-select");
}

export function getLayerToggle(layerIndex) {
  return document.getElementById(`layer-l${layerIndex}-toggle`);
}

export function getLayerL0Toggle() {
  return getLayerToggle(0);
}

export function getLayerL1Toggle() {
  return getLayerToggle(1);
}

export function getLayerL2Toggle() {
  return getLayerToggle(2);
}

export function getLayerL3Toggle() {
  return getLayerToggle(3);
}

export function getLayerL4Toggle() {
  return getLayerToggle(4);
}

export function getLoadModelBtn() {
  return document.getElementById("load-model-btn");
}

export function getUnloadModelBtn() {
  return document.getElementById("unload-model-btn");
}

export function getStreamingSection() {
  return document.getElementById("streaming-section");
}

export function getStreamingContainer() {
  return document.getElementById("streaming-container");
}

export function getTokenDisplay() {
  return document.getElementById("token-display");
}

export function getStreamingTokens() {
  return document.getElementById("streaming-tokens");
}

export function getStreamingTps() {
  return document.getElementById("streaming-tps");
}

export function getTranscriptDiv() {
  return document.getElementById("transcript-container");
}

export function getCopyL4Btn() {
  return document.getElementById("copy-l4-btn");
}

export function getStatusDiv() {
  return document.getElementById("status-text");
}

export function getCanvas() {
  return document.getElementById("visualizer");
}

export function getTimingL0() {
  return document.getElementById("timing-l0");
}

export function getTimingL1() {
  return document.getElementById("timing-l1");
}

export function getTimingL2() {
  return document.getElementById("timing-l2");
}

export function getTimingL3() {
  return document.getElementById("timing-l3");
}

export function getTimingL4() {
  return document.getElementById("timing-l4");
}

export function getRecordingTimer() {
  return document.getElementById("recording-timer");
}

export function getOnnxLayersToggle() {
  return document.getElementById("onnx-layers-toggle");
}

export function getDiffViewToggle() {
  return document.getElementById("diff-view-toggle");
}

export function getTimingDisplayToggle() {
  return document.getElementById("timing-display-toggle");
}
