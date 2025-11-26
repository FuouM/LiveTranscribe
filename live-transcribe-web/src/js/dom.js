// DOM utilities for the demo application
export const dom = {
  appContainer: () => document.getElementById("app-container"),
  centerStage: () => document.getElementById("center-stage"),
  statusText: () => document.getElementById("status-text"),
  transcriptContainer: () => document.getElementById("transcript-container"),
  startBtn: () => document.getElementById("start-btn"),
  stopBtn: () => document.getElementById("stop-btn"),
  modelSelect: () => document.getElementById("model-select"),
  languageSelect: () => document.getElementById("language-select"),
  backendSelect: () => document.getElementById("backend-select"),
  realtimeToggle: () => document.getElementById("realtime-toggle"),
};
