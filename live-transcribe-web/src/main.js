// Simple test to see if basic rendering works
console.log("Main.js loaded and executing... V1.0");
console.error("Main.js error test");

const appContainer = document.getElementById("app-container");
if (appContainer) {
  console.log("Found app container, rendering basic UI...");
  appContainer.innerHTML = `
        <div style="padding: 20px; background: #111; color: #fff; min-height: 100vh;">
            <h1>Open Live Transcribe Demo</h1>
            <div id="center-stage" style="margin-top: 20px;">
                <!-- Workbench will render here -->
            </div>
        </div>
    `;

  // Now try to render the workbench
  setTimeout(() => {
    console.log("Attempting to render workbench...");
    const centerStage = document.getElementById("center-stage");
    if (centerStage) {
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
                            <label>Model:</label>
                            <select id="model-select">
                                <option value="Xenova/whisper-tiny">Whisper Tiny</option>
                                <option value="Xenova/whisper-base">Whisper Base</option>
                                <option value="Xenova/whisper-small">Whisper Small</option>
                                <option value="Xenova/whisper-medium">Whisper Medium</option>
                                <option value="Xenova/whisper-large-v3">Whisper Large v3</option>
                            </select>
                        </div>

                        <div class="control-group">
                            <label>Language:</label>
                            <select id="language-select">
                                <option value="en">English</option>
                                <option value="es">Spanish</option>
                                <option value="fr">French</option>
                                <option value="ja">Japanese</option>
                            </select>
                        </div>

                        <div class="control-group">
                            <label>Backend:</label>
                            <select id="backend-select">
                                <option value="webgpu">WebGPU</option>
                                <option value="wasm">WASM</option>
                            </select>
                        </div>

                        <div style="margin: 10px 0;">
                            <label>
                                <input type="checkbox" id="realtime-toggle" checked style="margin-right: 10px;">
                                Real-time transcription
                            </label>
                        </div>

                        <div class="control-group">
                            <label>Active Layers:</label>
                            <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 5px;">
                                <label style="font-size: 12px;">
                                    <input type="checkbox" id="layer-l1-toggle" checked style="margin-right: 10px;">
                                    L1: Fast continuous (1s)
                                </label>
                                <label style="font-size: 12px;">
                                    <input type="checkbox" id="layer-l2-toggle" checked style="margin-right: 10px;">
                                    L2: 5s chunks
                                </label>
                                <label style="font-size: 12px;">
                                    <input type="checkbox" id="layer-l3-toggle" checked style="margin-right: 10px;">
                                    L3: 10s chunks
                                </label>
                                <label style="font-size: 12px;">
                                    <input type="checkbox" id="layer-l4-toggle" checked style="margin-right: 10px;">
                                    L4: 20s chunks (ground truth)
                                </label>
                            </div>
                        </div>
                    </div>

                    <div id="status-section">
                        <div class="status-row">
                            <div id="status-text">Ready</div>
                            <div id="recording-timer" class="recording-timer">00:00:00</div>
                        </div>
                        <div class="timing-stats">
                            <div class="timing-header">Layer Performance</div>
                            <div class="timing-legend">
                                <div class="legend-item"><span class="legend-color level-1"></span>L1: Fast (continuous)</div>
                                <div class="legend-item"><span class="legend-color level-2"></span>L2: 5s chunks</div>
                                <div class="legend-item"><span class="legend-color level-3"></span>L3: 10s chunks</div>
                                <div class="legend-item"><span class="legend-color level-4"></span>L4: 20s chunks (ground truth)</div>
                            </div>
                            <div class="timing-grid">
                                <div class="timing-item level-1">
                                    <div class="label">L1 Fast</div>
                                    <div class="value" id="timing-l1">-</div>
                                </div>
                                <div class="timing-item level-2">
                                    <div class="label">L2 5s</div>
                                    <div class="value" id="timing-l2">-</div>
                                </div>
                                <div class="timing-item level-3">
                                    <div class="label">L3 10s</div>
                                    <div class="value" id="timing-l3">-</div>
                                </div>
                                <div class="timing-item level-4">
                                    <div class="label">L4 20s</div>
                                    <div class="value" id="timing-l4">-</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
      console.log("Workbench HTML rendered successfully");

      // Now try to load the full functionality
      loadFullFunctionality();
    }
  }, 100);
} else {
  console.error("App container not found!");
}

async function loadFullFunctionality() {
  console.log("Loading full functionality...");

  try {
    // Import the necessary modules
    const { AudioProcessor } = await import("./audio-processor.js");
    const { Transcriber } = await import("./transcriber.js");
    const { Visualizer } = await import("./visualizer.js");

    console.log("Modules imported successfully, initializing...");

    // Now implement the full functionality
    await initializeFullApp(AudioProcessor, Transcriber, Visualizer);
  } catch (error) {
    console.error("Error loading full functionality:", error);
    document.getElementById("status-text").textContent =
      "Error loading functionality: " + error.message;
  }
}

async function initializeFullApp(AudioProcessor, Transcriber, Visualizer) {
  console.log("Initializing full application...");

  // DOM element getters (lazy-loaded)
  function getStartBtn() {
    return document.getElementById("start-btn");
  }
  function getStopBtn() {
    return document.getElementById("stop-btn");
  }
  function getModelSelect() {
    return document.getElementById("model-select");
  }
  function getLanguageSelect() {
    return document.getElementById("language-select");
  }
  function getBackendSelect() {
    return document.getElementById("backend-select");
  }
  function getRealtimeToggle() {
    return document.getElementById("realtime-toggle");
  }
  function getLayerL1Toggle() {
    return document.getElementById("layer-l1-toggle");
  }
  function getLayerL2Toggle() {
    return document.getElementById("layer-l2-toggle");
  }
  function getLayerL3Toggle() {
    return document.getElementById("layer-l3-toggle");
  }
  function getLayerL4Toggle() {
    return document.getElementById("layer-l4-toggle");
  }
  function getTranscriptDiv() {
    return document.getElementById("transcript-container");
  }
  function getStatusDiv() {
    return document.getElementById("status-text");
  }
  function getCanvas() {
    return document.getElementById("visualizer");
  }
  function getTimingL1() {
    return document.getElementById("timing-l1");
  }
  function getTimingL2() {
    return document.getElementById("timing-l2");
  }
  function getTimingL3() {
    return document.getElementById("timing-l3");
  }
  function getTimingL4() {
    return document.getElementById("timing-l4");
  }
  function getRecordingTimer() {
    return document.getElementById("recording-timer");
  }

  let audioProcessor = null;
  let transcriber = null;
  let visualizer = null;
  let isRecording = false;
  let realtimeEnabled = true;
  let currentModel = "Xenova/whisper-tiny";

  // Recording timer variables
  let recordingStartTime = null;
  let recordingTimerInterval = null;

  // Dual-display structure for tracking transcription evolution
  let committedSegments = [];
  let currentRealtime = "";
  let currentPartial = "";
  let lastCommittedText = "";

  function createTranscriber(modelType, callback) {
    return new Transcriber(callback);
  }

  function deduplicateTranscription(newText, type) {
    if (!newText || !newText.trim()) return "";

    const trimmedNew = newText.trim().toLowerCase();

    if (type === "final") {
      const recentCommits = committedSegments
        .slice(-3)
        .map((s) => s.text)
        .join(" ")
        .toLowerCase();
      if (
        recentCommits.includes(trimmedNew) ||
        (lastCommittedText && lastCommittedText.toLowerCase() === trimmedNew)
      ) {
        return "";
      }
      return newText.trim();
    }

    if (
      type === "partial" &&
      currentPartial &&
      currentPartial.toLowerCase() === trimmedNew
    ) {
      return "";
    }

    if (
      type === "realtime" &&
      currentRealtime &&
      currentRealtime.toLowerCase() === trimmedNew
    ) {
      return "";
    }

    return newText.trim();
  }

  function updateDisplay() {
    const transcriptDiv = getTranscriptDiv();
    transcriptDiv.innerHTML = "";

    committedSegments.forEach((segment) => {
      if (segment.isSeparator) {
        // Add a visual separator instead of text
        const separatorDiv = document.createElement("div");
        separatorDiv.className = "transcription-separator";
        separatorDiv.innerHTML =
          '<hr style="border: none; border-top: 1px solid #444; margin: 10px 0;">';
        transcriptDiv.appendChild(separatorDiv);
      } else {
        const segmentDiv = document.createElement("div");
        segmentDiv.className = `committed-text level-${segment.level || 1}`;
        segmentDiv.textContent = segment.text || segment;
        transcriptDiv.appendChild(segmentDiv);
      }
    });

    console.log("[Display Update]", {
      committed: committedSegments.length,
      partial: currentPartial ? `"${currentPartial}"` : "none",
      realtime:
        realtimeEnabled && currentRealtime ? `"${currentRealtime}"` : "none",
    });

    if (currentPartial || currentRealtime) {
      const currentDiv = document.createElement("div");
      currentDiv.className = "current-transcription";

      if (currentPartial) {
        const partialSpan = document.createElement("span");
        partialSpan.textContent = `[${currentPartial}]`;
        partialSpan.className = "sentence-partial";
        currentDiv.appendChild(partialSpan);
      }

      if (currentRealtime && realtimeEnabled) {
        const realtimeSpan = document.createElement("span");
        realtimeSpan.textContent = currentRealtime;
        realtimeSpan.className = "realtime-text";
        currentDiv.appendChild(realtimeSpan);
      }

      transcriptDiv.appendChild(currentDiv);
    }

    transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
  }

  function updateTimingDisplay(timingStats) {
    const formatTime = (ms) => {
      if (ms < 1000) return `${ms.toFixed(0)}ms`;
      return `${(ms / 1000).toFixed(2)}s`;
    };

    for (let level = 1; level <= 4; level++) {
      const stats = timingStats[level];
      let displayText = "-";

      if (stats && stats.count > 0) {
        const avg = formatTime(stats.averageTime);
        const last = formatTime(stats.lastTime);
        displayText = `${last}/${avg} (${stats.count})`;
      }

      const element = document.getElementById(`timing-l${level}`);
      if (element) {
        element.textContent = displayText;
      }
    }
  }

  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  function updateRecordingTimer() {
    if (recordingStartTime) {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      getRecordingTimer().textContent = formatTime(elapsed);
    }
  }

  function startRecordingTimer() {
    recordingStartTime = Date.now();
    getRecordingTimer().style.display = "inline-block";
    recordingTimerInterval = setInterval(updateRecordingTimer, 1000);
    updateRecordingTimer(); // Update immediately
  }

  function stopRecordingTimer() {
    recordingStartTime = null;
    if (recordingTimerInterval) {
      clearInterval(recordingTimerInterval);
      recordingTimerInterval = null;
    }
    getRecordingTimer().style.display = "none";
    getRecordingTimer().textContent = "00:00:00";
  }

  // Initialize the app
  getModelSelect().value = currentModel;
  getLanguageSelect().value = "en";

  transcriber = createTranscriber(currentModel, (data) => {
    if (data.type === "full_transcript") {
      // Multi-agent strategy update: Full control from backend
      committedSegments = data.segments; // Keep full segment objects with level info
      currentPartial = data.partial || "";
      currentRealtime = "";

      // Update timing display
      if (data.timingStats) {
        updateTimingDisplay(data.timingStats);
      }

      updateDisplay();
    } else if (data.type === "realtime" && realtimeEnabled) {
      const deduplicatedText = deduplicateTranscription(
        data.text || "",
        "realtime"
      );
      if (deduplicatedText) {
        currentRealtime = deduplicatedText;
        updateDisplay();
      }
    } else if (data.type === "partial") {
      const deduplicatedText = deduplicateTranscription(
        data.text || "",
        "partial"
      );
      if (deduplicatedText) {
        currentPartial = deduplicatedText;
        updateDisplay();
      }
    } else if (data.type === "final") {
      const finalText = data.text.trim();
      if (finalText) {
        const deduplicatedText = deduplicateTranscription(finalText, "final");
        if (deduplicatedText) {
          committedSegments.push({ text: deduplicatedText, level: 4 }); // Single-model finals are L4 (truth)
          lastCommittedText = deduplicatedText;
          if (realtimeEnabled) {
            currentRealtime = "";
          }
          updateDisplay();
        }
      }
    } else if (data.type === "status") {
      getStatusDiv().textContent = data.text;
    }
  });

  visualizer = new Visualizer(getCanvas());

  // Event listeners
  getStartBtn().addEventListener("click", async () => {
    try {
      getStartBtn().disabled = true;
      getModelSelect().disabled = true;
      getLanguageSelect().disabled = true;
      getBackendSelect().disabled = true;
      getLayerL1Toggle().disabled = true;
      getLayerL2Toggle().disabled = true;
      getLayerL3Toggle().disabled = true;
      getLayerL4Toggle().disabled = true;
      getStatusDiv().textContent =
        "Please select a tab/screen and SHARE AUDIO...";

      const language = getLanguageSelect().value;
      const backend = getBackendSelect().value;
      const model = getModelSelect().value;

      // Collect enabled layers
      const enabledLayers = [];
      if (getLayerL1Toggle().checked) enabledLayers.push(1);
      if (getLayerL2Toggle().checked) enabledLayers.push(2);
      if (getLayerL3Toggle().checked) enabledLayers.push(3);
      if (getLayerL4Toggle().checked) enabledLayers.push(4);

      // Ensure at least one layer is enabled
      if (enabledLayers.length === 0) {
        enabledLayers.push(4); // Default to L4 if none selected
        getLayerL4Toggle().checked = true;
      }

      await transcriber.init(language, backend, model, enabledLayers);

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      if (stream.getAudioTracks().length === 0) {
        throw new Error(
          'No audio track found. Please ensure you checked "Share Audio" in the dialog.'
        );
      }

      // Recreate visualizer if needed
      if (visualizer) {
        visualizer.destroy();
      }
      visualizer = new Visualizer(getCanvas());

      // Set the MediaStream for real-time waveform visualization
      visualizer.setMediaStream(stream);

      audioProcessor = new AudioProcessor(
        stream,
        (audioData, metadata) => {
          transcriber.process(audioData, metadata);
        },
        () => {
          transcriber.commitAndReset();
        }
      );

      audioProcessor.start();
      isRecording = true;
      startRecordingTimer();
      getStopBtn().disabled = false;
      getStatusDiv().textContent = "Recording...";
    } catch (err) {
      console.error("Error starting:", err);
      getStatusDiv().textContent = "Error: " + err.message;
      getStartBtn().disabled = false;
      getLanguageSelect().disabled = false;
      getBackendSelect().disabled = false;
    }
  });

  getStopBtn().addEventListener("click", () => {
    if (audioProcessor) {
      audioProcessor.stop();
    }
    if (transcriber) {
      transcriber.stop();
    }
    if (visualizer) {
      visualizer.destroy();
    }
    isRecording = false;
    stopRecordingTimer();
    getStartBtn().disabled = false;
    getStopBtn().disabled = true;
    getModelSelect().disabled = false;
    getLanguageSelect().disabled = false;
    getBackendSelect().disabled = false;
    getLayerL1Toggle().disabled = false;
    getLayerL2Toggle().disabled = false;
    getLayerL3Toggle().disabled = false;
    getLayerL4Toggle().disabled = false;
    getStatusDiv().textContent = "Stopped";
  });

  getRealtimeToggle().addEventListener("change", (e) => {
    realtimeEnabled = e.target.checked;
    if (!realtimeEnabled) {
      currentRealtime = "";
      updateDisplay();
    }
  });

  getModelSelect().addEventListener("change", async () => {
    const newModel = getModelSelect().value;
    const wasRecording = isRecording;
    const oldModel = currentModel;

    // If currently recording, stop first
    if (isRecording) {
      console.log("Stopping recording to change model...");
      getStopBtn().click();
      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    try {
      // Reinitialize transcriber with new model
      console.log(`Switching to model: ${newModel}`);
      getStatusDiv().textContent = `Switching to ${newModel
        .split("/")
        .pop()}...`;

      // Stop current transcriber
      if (transcriber) {
        transcriber.stop();
      }

      // Create new transcriber with selected model
      const language = getLanguageSelect().value;
      const backend = getBackendSelect().value;

      // Collect enabled layers
      const enabledLayers = [];
      if (getLayerL1Toggle().checked) enabledLayers.push(1);
      if (getLayerL2Toggle().checked) enabledLayers.push(2);
      if (getLayerL3Toggle().checked) enabledLayers.push(3);
      if (getLayerL4Toggle().checked) enabledLayers.push(4);

      // Update current model
      currentModel = newModel;

      transcriber = createTranscriber(newModel, (data) => {
        if (data.type === "full_transcript") {
          committedSegments = data.segments;
          currentPartial = data.partial || "";
          currentRealtime = "";

          if (data.timingStats) {
            updateTimingDisplay(data.timingStats);
          }

          updateDisplay();
        } else if (data.type === "realtime" && realtimeEnabled) {
          const deduplicatedText = deduplicateTranscription(
            data.text || "",
            "realtime"
          );
          if (deduplicatedText) {
            currentRealtime = deduplicatedText;
            updateDisplay();
          }
        } else if (data.type === "partial") {
          const deduplicatedText = deduplicateTranscription(
            data.text || "",
            "partial"
          );
          if (deduplicatedText) {
            currentPartial = deduplicatedText;
            updateDisplay();
          }
        } else if (data.type === "final") {
          const finalText = data.text.trim();
          if (finalText) {
            const deduplicatedText = deduplicateTranscription(
              finalText,
              "final"
            );
            if (deduplicatedText) {
              committedSegments.push({ text: deduplicatedText, level: 4 });
              lastCommittedText = deduplicatedText;
              if (realtimeEnabled) {
                currentRealtime = "";
              }
              updateDisplay();
            }
          }
        } else if (data.type === "status") {
          getStatusDiv().textContent = data.text;
        }
      });

      // Initialize with new model
      await transcriber.init(language, backend, newModel, enabledLayers);

      // If we were recording before, restart recording
      if (wasRecording) {
        console.log("Restarting recording with new model...");
        // Simulate clicking start button
        getStartBtn().click();
      } else {
        getStatusDiv().textContent = `Ready - Model: ${newModel
          .split("/")
          .pop()}`;
      }
    } catch (error) {
      console.error("Error switching model:", error);
      getStatusDiv().textContent = `Error switching model: ${error.message}`;

      // Revert to previous model on error
      currentModel = oldModel;
      getModelSelect().value = oldModel;
      if (wasRecording) {
        // Try to restart with original model
        try {
          getStartBtn().click();
        } catch (restartError) {
          console.error("Error restarting with original model:", restartError);
        }
      }
    }
  });

  console.log("Full application initialized successfully!");
  getStatusDiv().textContent = "Ready - Full functionality loaded";
  // Initialize timing display
  updateTimingDisplay({
    1: { totalTime: 0, count: 0, lastTime: 0, averageTime: 0 },
    2: { totalTime: 0, count: 0, lastTime: 0, averageTime: 0 },
    3: { totalTime: 0, count: 0, lastTime: 0, averageTime: 0 },
    4: { totalTime: 0, count: 0, lastTime: 0, averageTime: 0 },
  });
}
