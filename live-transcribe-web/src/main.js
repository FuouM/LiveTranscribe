// Simple test to see if basic rendering works
console.log("Main.js loaded and executing... V1.0");

// Theme management
function initializeThemeToggle() {
  const themeToggle = document.getElementById("theme-toggle");
  const savedTheme = localStorage.getItem("theme") || "dark";

  // Set initial theme
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);

  // Add click handler
  themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";

    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    updateThemeIcon(newTheme);
  });
}

function updateThemeIcon(theme) {
  const themeIcon = document.querySelector(".theme-icon");
  if (themeIcon) {
    // Remove existing icon classes
    themeIcon.classList.remove("theme-icon-moon", "theme-icon-sun");
    // Add the appropriate icon class
    themeIcon.classList.add(
      theme === "dark" ? "theme-icon-moon" : "theme-icon-sun"
    );
    // Clear text content since we're using CSS pseudo-elements
    themeIcon.textContent = "";
  }
}

const appContainer = document.getElementById("app-container");
if (appContainer) {
  console.log("Found app container, rendering basic UI...");
  appContainer.innerHTML = `
        <div class="app-header">
            <h1>Open Live Transcribe Demo</h1>
            <button id="theme-toggle" class="theme-toggle" aria-label="Toggle theme">
                <span class="theme-icon theme-icon-moon"></span>
            </button>
        </div>
        <div class="app-content">
            <div id="center-stage">
                <!-- Workbench will render here -->
            </div>
        </div>
    `;

  // Initialize theme toggle
  initializeThemeToggle();

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
                        <div id="streaming-section" style="display: none;">
                            <div class="transcription-header">
                                <h3>Layer 0: Streaming Output</h3>
                                <div class="streaming-stats">
                                    <span id="streaming-tokens">0 tokens</span> |
                                    <span id="streaming-tps">0 TPS</span>
                                </div>
                            </div>
                            <div id="streaming-container" class="streaming-container">
                                <div class="token-display" id="token-display">
                                    <!-- Last 20 tokens will be displayed here -->
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="transcription-section">
                        <div class="transcription-header">
                            <h3>Transcription</h3>
                            <button id="copy-l4-btn" class="btn btn-secondary copy-btn" title="Copy L4 transcription only">
                                <span class="clipboard-icon"></span> L4
                            </button>
                        </div>
                        <div id="transcript-container" class="transcript-container"></div>
                    </div>

                    <div id="controls-section" class="toolbox-container">
                        <div class="toolbox-header">Settings</div>
                        
                        <div class="controls-grid">
                            <!-- Row 1 -->
                            <div class="control-item">
                                <label>Model</label>
                                <select id="model-select">
                                    <option value="Xenova/whisper-tiny">Tiny</option>
                                    <option value="Xenova/whisper-base">Base</option>
                                    <option value="Xenova/whisper-small">Small</option>
                                    <option value="Xenova/whisper-medium">Medium</option>
                                    <option value="Xenova/whisper-large-v3">Large v3</option>
                                </select>
                            </div>

                            <div class="control-item">
                                <label>Lang</label>
                                <select id="language-select">
                                    <option value="en">English</option>
                                    <option value="es">Spanish</option>
                                    <option value="fr">French</option>
                                    <option value="ja">Japanese</option>
                                </select>
                            </div>

                            <div class="control-item">
                                <label>Quant</label>
                                <select id="quant-select">
                                    <option value="q4">Q4 Fast</option>
                                    <option value="fp16">FP16 High</option>
                                </select>
                            </div>

                            <div class="control-item">
                                <label>Backend</label>
                                <select id="backend-select">
                                    <option value="webgpu">WebGPU</option>
                                    <option value="wasm">WASM</option>
                                </select>
                            </div>

                            <!-- Model Control Buttons -->
                            <div class="control-item">
                                <label>Action</label>
                                <div style="display:flex; gap:4px;">
                                    <button id="load-model-btn" class="btn" style="flex:1; padding: 0 8px;">Load</button>
                                    <button id="unload-model-btn" class="btn" style="flex:1; padding: 0 8px;" disabled>Unload</button>
                                </div>
                            </div>

                            <!-- Layer Toggles (Full Width) -->
                            <div class="layer-control-group">
                                <label class="layer-group-label">Active Layers</label>
                                <div class="layer-grid">
                                    <div class="layer-toggle">
                                        <input type="checkbox" id="layer-l0-toggle">
                                        <div class="layer-label">L0</div>
                                    </div>
                                    <div class="layer-toggle">
                                        <input type="checkbox" id="layer-l1-toggle">
                                        <div class="layer-label">L1</div>
                                    </div>
                                    <div class="layer-toggle">
                                        <input type="checkbox" id="layer-l2-toggle">
                                        <div class="layer-label">L2</div>
                                    </div>
                                    <div class="layer-toggle">
                                        <input type="checkbox" id="layer-l3-toggle">
                                        <div class="layer-label">L3</div>
                                    </div>
                                    <div class="layer-toggle">
                                        <input type="checkbox" id="layer-l4-toggle">
                                        <div class="layer-label">L4</div>
                                    </div>
                                </div>
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

  // Import the necessary modules
  const { AudioProcessor } = await import("./audio-processor.js");
  const { Transcriber } = await import("./transcriber.js");
  const { Visualizer } = await import("./visualizer.js");

  try {
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

  // Import state functions
  const { setModelLoaded } = await import("./js/state.js");

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
  function getQuantSelect() {
    return document.getElementById("quant-select");
  }
  function getLayerL0Toggle() {
    return document.getElementById("layer-l0-toggle");
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
  function getLoadModelBtn() {
    return document.getElementById("load-model-btn");
  }
  function getUnloadModelBtn() {
    return document.getElementById("unload-model-btn");
  }
  function getStreamingSection() {
    return document.getElementById("streaming-section");
  }
  function getStreamingContainer() {
    return document.getElementById("streaming-container");
  }
  function getTokenDisplay() {
    return document.getElementById("token-display");
  }
  function getStreamingTokens() {
    return document.getElementById("streaming-tokens");
  }
  function getStreamingTps() {
    return document.getElementById("streaming-tps");
  }
  function getTranscriptDiv() {
    return document.getElementById("transcript-container");
  }
  function getCopyL4Btn() {
    return document.getElementById("copy-l4-btn");
  }
  function getStatusDiv() {
    return document.getElementById("status-text");
  }
  function getCanvas() {
    return document.getElementById("visualizer");
  }
  function getTimingL0() {
    return document.getElementById("timing-l0");
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
  let streamingWorker = null;
  let streamingWorkerReady = false;
  let isRecording = false;
  let currentModel = "Xenova/whisper-tiny";
  let streamingTokenCount = 0;
  let streamingTps = 0;
  let streamingTokenBuffer = []; // Rolling buffer of last 20 tokens

  // Recording timer variables
  let recordingStartTime = null;
  let recordingTimerInterval = null;

  // Dual-display structure for tracking transcription evolution
  let committedSegments = [];
  let currentPartial = "";
  let lastCommittedText = "";

  function createTranscriber(modelType, callback) {
    return new Transcriber(callback);
  }

  function initializeStreamingWorker() {
    if (streamingWorker) {
      streamingWorker.terminate();
      streamingWorkerReady = false;
    }

    try {
      streamingWorker = new Worker("./streaming-worker.js", { type: "module" });
      streamingWorker.onmessage = handleStreamingWorkerMessage;
      streamingWorkerReady = false; // Reset ready flag

      // Load the streaming model
      streamingWorker.postMessage({ type: "load" });

      return streamingWorker;
    } catch (error) {
      console.error("Error creating streaming worker:", error);
      streamingWorkerReady = false;
      return null;
    }
  }

  function handleStreamingWorkerMessage(event) {
    const { status, data, output, tps, numTokens, err } = event.data;

    if (err) {
      // Only log non-processing errors
      if (
        !err.includes("Already processing") &&
        !err.includes("Not enough new audio")
      ) {
        console.error("Streaming worker error:", err);
        updateStatus("Streaming Error", "error");
      }
      return;
    }

    switch (status) {
      case "loading":
        console.log("Streaming worker loading:", data);
        break;

      case "ready":
        console.log("Streaming worker ready!");
        streamingWorkerReady = true;
        break;

      case "start":
        console.log("Streaming transcription started");
        streamingTokens = [];
        streamingTokenCount = 0;
        streamingTps = 0;
        updateStreamingDisplay();
        break;

      case "update":
        if (output) {
          // Parse new tokens from the streaming output
          const newTokens = output
            .split(/\s+/)
            .filter((token) => token.length > 0);

          // Add new tokens to the rolling buffer
          streamingTokenBuffer.push(...newTokens);

          // Keep only the last 20 tokens
          if (streamingTokenBuffer.length > 20) {
            streamingTokenBuffer = streamingTokenBuffer.slice(-20);
          }

          streamingTokenCount = numTokens;
          streamingTps = tps || 0;

          updateStreamingDisplay();
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

  function updateStreamingDisplay() {
    const tokenDisplay = getTokenDisplay();
    const streamingTokensEl = getStreamingTokens();
    const streamingTpsEl = getStreamingTps();

    if (!tokenDisplay) return;

    // Update token display with rolling buffer
    tokenDisplay.innerHTML = "";
    streamingTokenBuffer.forEach((token, index) => {
      const tokenElement = document.createElement("span");
      tokenElement.className = "token-item";
      tokenElement.textContent = token;
      tokenDisplay.appendChild(tokenElement);
    });

    // Update stats
    if (streamingTokensEl) {
      streamingTokensEl.textContent = `${streamingTokenCount} tokens`;
    }
    if (streamingTpsEl) {
      streamingTpsEl.textContent = `${streamingTps.toFixed(1)} TPS`;
    }
  }

  function startStreamingTranscription(audioData) {
    if (!streamingWorker || !streamingWorkerReady) {
      return;
    }

    streamingWorker.postMessage({
      type: "add_audio",
      data: {
        audio: audioData,
        language: "en",
      },
    });
  }

  function stopStreamingTranscription() {
    // Reset streaming data
    streamingTokens = [];
    streamingTokenCount = 0;
    streamingTps = 0;
    streamingTokenBuffer = [];
    updateStreamingDisplay();
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

    // Streaming transcription is handled separately by updateStreamingTranscriptionDisplay()

    console.log("[Display Update]", {
      committed: committedSegments.length,
      streaming: getLayerL0Toggle().checked
        ? `${streamingTokenBuffer.length} tokens`
        : "none",
      partial: currentPartial ? `"${currentPartial}"` : "none",
    });

    if (currentPartial) {
      const currentDiv = document.createElement("div");
      currentDiv.className = "current-transcription";

      const partialSpan = document.createElement("span");
      partialSpan.textContent = `[${currentPartial}]`;
      partialSpan.className = "sentence-partial";
      currentDiv.appendChild(partialSpan);

      transcriptDiv.appendChild(currentDiv);
    }

    transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
  }

  function getL4TranscriptionText() {
    // Extract only L4 (ground truth) segments
    const l4Segments = committedSegments.filter(
      (segment) =>
        !segment.isSeparator && (segment.level === 4 || segment.level === "4")
    );

    // Join the text content with newlines
    return l4Segments.map((segment) => segment.text || segment).join("\n\n");
  }

  function copyL4ToClipboard() {
    const l4Text = getL4TranscriptionText();

    if (!l4Text.trim()) {
      alert("No L4 transcription available to copy");
      return;
    }

    navigator.clipboard
      .writeText(l4Text)
      .then(() => {
        const copyBtn = getCopyL4Btn();
        const originalText = copyBtn.textContent;
        copyBtn.innerHTML = '<span class="checkmark-icon"></span> Copied!';
        copyBtn.style.background =
          "linear-gradient(135deg, #10b981 0%, #059669 100%)";

        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = "";
        }, 2000);
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = l4Text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand("copy");
          const copyBtn = getCopyL4Btn();
          copyBtn.innerHTML = '<span class="checkmark-icon"></span> Copied!';
          setTimeout(() => {
            copyBtn.innerHTML = '<span class="clipboard-icon"></span> L4';
          }, 2000);
        } catch (fallbackErr) {
          console.error("Fallback copy failed: ", fallbackErr);
          alert("Failed to copy to clipboard");
        }
        document.body.removeChild(textArea);
      });
  }

  function updateTimingDisplay(timingStats) {
    const formatTime = (ms) => {
      if (ms < 1000) return `${ms.toFixed(0)}ms`;
      return `${(ms / 1000).toFixed(2)}s`;
    };

    for (let level = 0; level <= 4; level++) {
      const stats = timingStats[level];
      let displayText = "-";

      if (stats && stats.count > 0) {
        const avg = formatTime(stats.averageTime);
        const last = formatTime(stats.lastTime);
        displayText = `${last}/${avg} (${stats.count})`;

        // Add spec stats if available
        if (stats.specStats && stats.specStats.totalDrafts > 0) {
          const hitRate = (stats.specStats.hitRate * 100).toFixed(0);
          displayText += ` [${hitRate}%]`;
        }
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

      // Update timing display
      if (data.timingStats) {
        updateTimingDisplay(data.timingStats);
      }

      updateDisplay();
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
      getQuantSelect().disabled = true;
      getLanguageSelect().disabled = true;
      getBackendSelect().disabled = true;
      getLayerL0Toggle().disabled = true;
      getLayerL1Toggle().disabled = true;
      getLayerL2Toggle().disabled = true;
      getLayerL3Toggle().disabled = true;
      getLayerL4Toggle().disabled = true;
      getStatusDiv().textContent =
        "Please select a tab/screen and SHARE AUDIO...";

      const language = getLanguageSelect().value;
      const backend = getBackendSelect().value;
      const model = getModelSelect().value;
      const quant = getQuantSelect().value;

      // Collect enabled layers
      const enabledLayers = [];
      const l0Enabled = getLayerL0Toggle().checked;
      if (l0Enabled) enabledLayers.push(0);
      if (getLayerL1Toggle().checked) enabledLayers.push(1);
      if (getLayerL2Toggle().checked) enabledLayers.push(2);
      if (getLayerL3Toggle().checked) enabledLayers.push(3);
      if (getLayerL4Toggle().checked) enabledLayers.push(4);

      // Show/hide streaming section based on L0 toggle
      const streamingSection = getStreamingSection();
      if (streamingSection) {
        streamingSection.style.display = l0Enabled ? "block" : "none";
      }

      // Initialize streaming worker if L0 is enabled
      if (l0Enabled && !streamingWorker) {
        initializeStreamingWorker();
      }

      // Ensure at least one layer is enabled
      if (enabledLayers.length === 0) {
        enabledLayers.push(4); // Default to L4 if none selected
        getLayerL4Toggle().checked = true;
      }

      // Load model if not already loaded
      if (!transcriber.isInitialized) {
        await transcriber.init(language, backend, model, enabledLayers, quant);
        setModelLoaded(true);
        getLoadModelBtn().disabled = true;
        getUnloadModelBtn().disabled = false;
      }

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

          // Also send to streaming worker if L0 is enabled
          if (getLayerL0Toggle().checked && streamingWorker) {
            startStreamingTranscription(audioData);
          }
        },
        () => {
          transcriber.commitAndReset();
          if (getLayerL0Toggle().checked) {
            stopStreamingTranscription();
          }
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
    // Don't stop transcriber here - keep model loaded
    // if (transcriber) {
    //   transcriber.stop();
    // }
    if (streamingWorker) {
      stopStreamingTranscription();
      streamingWorkerReady = false; // Reset ready flag
    }
    if (visualizer) {
      visualizer.destroy();
    }
    isRecording = false;
    stopRecordingTimer();
    getStartBtn().disabled = false;
    getStopBtn().disabled = true;
    getModelSelect().disabled = false;
    getQuantSelect().disabled = false;
    getLanguageSelect().disabled = false;
    getBackendSelect().disabled = false;
    getLayerL0Toggle().disabled = false;
    getLayerL1Toggle().disabled = false;
    getLayerL2Toggle().disabled = false;
    getLayerL3Toggle().disabled = false;
    getLayerL4Toggle().disabled = false;
    getStatusDiv().textContent = "Stopped (Model still loaded)";
  });

  getCopyL4Btn().addEventListener("click", copyL4ToClipboard);

  // Model load/unload handlers
  getLoadModelBtn().addEventListener("click", async () => {
    if (isRecording) {
      alert("Cannot load model while recording. Please stop recording first.");
      return;
    }

    try {
      getLoadModelBtn().disabled = true;
      getLoadModelBtn().textContent = "Loading...";

      const language = getLanguageSelect().value;
      const backend = getBackendSelect().value;
      const model = getModelSelect().value;
      const quant = getQuantSelect().value;

      // Collect enabled layers
      const enabledLayers = [];
      if (getLayerL0Toggle().checked) enabledLayers.push(0);
      if (getLayerL1Toggle().checked) enabledLayers.push(1);
      if (getLayerL2Toggle().checked) enabledLayers.push(2);
      if (getLayerL3Toggle().checked) enabledLayers.push(3);
      if (getLayerL4Toggle().checked) enabledLayers.push(4);

      // Ensure at least one layer is enabled
      if (enabledLayers.length === 0) {
        enabledLayers.push(4); // Default to L4 if none selected
        getLayerL4Toggle().checked = true;
      }

      await transcriber.loadModel(
        language,
        backend,
        model,
        enabledLayers,
        quant
      );

      // Update state and UI
      setModelLoaded(true);
      getLoadModelBtn().disabled = true;
      getUnloadModelBtn().disabled = false;
      getStatusDiv().textContent = `Model loaded: ${model.split("/").pop()}`;
    } catch (error) {
      console.error("Error loading model:", error);
      getStatusDiv().textContent = `Error loading model: ${error.message}`;
      getLoadModelBtn().disabled = false;
      getLoadModelBtn().textContent = "Load Model";
    }
  });

  getUnloadModelBtn().addEventListener("click", async () => {
    if (isRecording) {
      alert(
        "Cannot unload model while recording. Please stop recording first."
      );
      return;
    }

    try {
      getUnloadModelBtn().disabled = true;
      getUnloadModelBtn().textContent = "Unloading...";
      getStatusDiv().textContent = "Unloading model...";

      await transcriber.unloadModel();

      // Update state and UI
      setModelLoaded(false);
      getUnloadModelBtn().disabled = true;
      getUnloadModelBtn().textContent = "Unload Model";
      getLoadModelBtn().disabled = false;
      getLoadModelBtn().textContent = "Load Model";
      getStatusDiv().textContent = "Model unloaded";
    } catch (error) {
      console.error("Error unloading model:", error);
      getStatusDiv().textContent = `Error unloading model: ${error.message}`;
      getUnloadModelBtn().disabled = false;
      getUnloadModelBtn().textContent = "Unload Model";
    }
  });

  // L0 toggle handler
  getLayerL0Toggle().addEventListener("change", (e) => {
    const streamingSection = getStreamingSection();
    if (streamingSection) {
      streamingSection.style.display = e.target.checked ? "block" : "none";
    }

    // If turning off L0, clear streaming data
    if (!e.target.checked) {
      streamingTokenBuffer = [];
    }

    // If turning on L0 during recording, initialize streaming worker
    if (e.target.checked && isRecording && !streamingWorker) {
      initializeStreamingWorker();
    }
  });

  // Load saved layer toggle states
  function loadLayerToggleStates() {
    for (let i = 0; i <= 4; i++) {
      const toggleId = `layer-l${i}-toggle`;
      const checkbox = document.getElementById(toggleId);
      if (checkbox) {
        const savedState = localStorage.getItem(`layer-toggle-${i}`);

        let shouldBeChecked;
        if (savedState !== null) {
          shouldBeChecked = savedState === "true";
        } else {
          // Set default states: L0 off, L1-L4 on
          shouldBeChecked = i > 0;
          // Save the default state
          saveLayerToggleState(i, shouldBeChecked);
        }

        checkbox.checked = shouldBeChecked;
      }
    }
  }

  // Save layer toggle state
  function saveLayerToggleState(layerIndex, checked) {
    localStorage.setItem(`layer-toggle-${layerIndex}`, checked.toString());
  }

  // Initialize layer toggle states after a short delay to ensure DOM is ready
  setTimeout(() => {
    loadLayerToggleStates();
  }, 100);

  // Layer toggle button click handlers
  document.querySelectorAll(".layer-toggle-button").forEach((button) => {
    button.addEventListener("click", (e) => {
      // Don't trigger if clicking on the actual checkbox
      if (e.target.type === "checkbox") return;

      const checkbox = button.querySelector('input[type="checkbox"]');
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        // Save the state
        const layerIndex = checkbox.id.match(/layer-l(\d)-toggle/)?.[1];
        if (layerIndex) {
          saveLayerToggleState(layerIndex, checkbox.checked);
        }
        // Trigger the change event manually
        checkbox.dispatchEvent(new Event("change"));
      }
    });
  });

  // Save state when checkboxes change (in case they're changed programmatically)
  [
    getLayerL0Toggle(),
    getLayerL1Toggle(),
    getLayerL2Toggle(),
    getLayerL3Toggle(),
    getLayerL4Toggle(),
  ].forEach((checkbox, index) => {
    if (checkbox) {
      checkbox.addEventListener("change", (e) => {
        saveLayerToggleState(index, e.target.checked);
      });
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

    // If model is loaded, unload it first
    if (transcriber && transcriber.isInitialized) {
      console.log("Unloading current model before switching...");
      await transcriber.unloadModel();
      setModelLoaded(false);
      getLoadModelBtn().disabled = false;
      getUnloadModelBtn().disabled = true;
      getLoadModelBtn().textContent = "Load Model";
    }

    try {
      // Create new transcriber with selected model
      const language = getLanguageSelect().value;
      const backend = getBackendSelect().value;

      // Collect enabled layers
      const enabledLayers = [];
      if (getLayerL0Toggle().checked) enabledLayers.push(0);
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

          if (data.timingStats) {
            updateTimingDisplay(data.timingStats);
          }

          updateDisplay();
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
    0: { totalTime: 0, count: 0, lastTime: 0, averageTime: 0 },
    1: { totalTime: 0, count: 0, lastTime: 0, averageTime: 0 },
    2: { totalTime: 0, count: 0, lastTime: 0, averageTime: 0 },
    3: { totalTime: 0, count: 0, lastTime: 0, averageTime: 0 },
    4: { totalTime: 0, count: 0, lastTime: 0, averageTime: 0 },
  });
}
