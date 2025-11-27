import { state } from "../../state.js";
import { dom } from "../../dom.js";

let currentTranscriptionState = {
  committed: [],
  partial: "",
};

export async function initWorkbenchView() {
  console.log("Initializing workbench view...");
  await renderWorkbench();
  console.log("Workbench view rendered, subscribing to state changes...");
  subscribeToStateChanges();
}

async function renderWorkbench() {
  const centerStage = dom.centerStage();
  if (!centerStage) return;

  console.log("Rendering workbench...");
  centerStage.innerHTML = `
        <div id="workbench-container">
            <div id="audio-input-section">
                <h3>Audio Input</h3>
                <div id="audio-controls">
                    <button id="start-btn" class="btn btn-primary">Start Recording</button>
                    <button id="stop-btn" class="btn btn-secondary" disabled>Stop</button>
                </div>
                <div class="audio-visualizer">
                    <div id="visualizer"></div>
                </div>
            </div>

            <div id="transcription-section">
                <h3>Transcription</h3>
                <div id="transcript-container" class="transcript-container"></div>
            </div>

            <div id="controls-section">
                <h3>Settings</h3>
                <div class="control-group">
                    <label for="model-select">Model:</label>
                    <select id="model-select">
                        <option value="Xenova/whisper-tiny">Whisper Tiny (Q8_0)</option>
                        <option value="Xenova/whisper-base">Whisper Base (Q6_K)</option>
                        <option value="Xenova/whisper-small">Whisper Small (Q5_1)</option>
                        <option value="Xenova/whisper-medium">Whisper Medium (Q4_1)</option>
                        <option value="Xenova/whisper-large-v3">Whisper Large v3 (Q4_0)</option>
                    </select>
                </div>

                <div class="control-group">
                    <label for="language-select">Language:</label>
                    <select id="language-select">
                        <option value="english">English</option>
                        <option value="spanish">Spanish</option>
                        <option value="french">French</option>
                    </select>
                </div>

                <div class="control-group">
                    <label for="backend-select">Backend:</label>
                    <select id="backend-select">
                        <option value="webgpu">WebGPU</option>
                        <option value="wasm">WASM</option>
                    </select>
                </div>


                <div class="control-group">
                    <label>Active Layers:</label>
                    <div class="layer-toggle-grid">
                        <div class="layer-toggle-button">
                            <input type="checkbox" id="layer-l1-toggle">
                            <div class="layer-toggle-label">L1: Fast continuous (1s)</div>
                        </div>
                        <div class="layer-toggle-button">
                            <input type="checkbox" id="layer-l2-toggle">
                            <div class="layer-toggle-label">L2: 5s chunks</div>
                        </div>
                        <div class="layer-toggle-button">
                            <input type="checkbox" id="layer-l3-toggle">
                            <div class="layer-toggle-label">L3: 10s chunks</div>
                        </div>
                        <div class="layer-toggle-button">
                            <input type="checkbox" id="layer-l4-toggle">
                            <div class="layer-toggle-label">L4: 20s chunks (ground truth)</div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="status-section">
                <div id="status-text">Ready</div>
            </div>
        </div>
    `;
  console.log("Workbench HTML rendered successfully");
}

function subscribeToStateChanges() {}

export function updateTranscription(data) {
  const { type, text } = data;
  console.log("UI received transcription:", type, `"${text}"`);

  if (type === "partial") {
    currentTranscriptionState.partial = text;
  } else if (type === "final") {
    if (text.trim()) {
      currentTranscriptionState.committed.push(text.trim());
    }
    currentTranscriptionState.partial = "";
  }

  renderTranscription();
}

function renderTranscription() {
  const container = dom.transcriptContainer();
  if (!container) return;

  container.innerHTML = "";

  // Add committed segments
  currentTranscriptionState.committed.forEach((segment) => {
    const segmentDiv = document.createElement("div");
    segmentDiv.className = "committed-text";
    segmentDiv.textContent = segment;
    container.appendChild(segmentDiv);
  });

  // Add current transcription
  if (currentTranscriptionState.partial) {
    const currentDiv = document.createElement("div");
    currentDiv.className = "current-transcription";

    const partialSpan = document.createElement("span");
    partialSpan.className = "sentence-partial";
    partialSpan.textContent = `[${currentTranscriptionState.partial}]`;
    currentDiv.appendChild(partialSpan);

    container.appendChild(currentDiv);
  }

  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;
}
