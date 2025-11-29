import {
  getStartBtn,
  getStopBtn,
  getModelSelect,
  getLanguageSelect,
  getBackendSelect,
  getQuantSelect,
  getLayerL0Toggle,
  getLayerL1Toggle,
  getLayerL2Toggle,
  getLayerL3Toggle,
  getLayerL4Toggle,
  getLoadModelBtn,
  getUnloadModelBtn,
  getCopyL4Btn,
  getStatusDiv,
  getStreamingSection,
  getCanvas,
  getOnnxLayersToggle,
  getDiffViewToggle,
  getTimingDisplayToggle,
  getLayerToggle,
} from "../utils/dom-helpers.js";

const numTotalLayers = 5;

export class EventHandlers {
  constructor(appState, managers) {
    this.appState = appState;
    this.managers = managers;
    this.onnxEnabled = false; // Track ONNX state
    this.diffViewEnabled = false; // Track diff view state
    this.timingDisplayTokensPerSecond = false; // Track timing display mode
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Start button handler
    getStartBtn().addEventListener("click", () => this.handleStartRecording());

    // Stop button handler
    getStopBtn().addEventListener("click", () => this.handleStopRecording());

    // Copy L4 button handler
    getCopyL4Btn().addEventListener("click", () =>
      this.managers.transcriptionDisplay.copyL4ToClipboard()
    );

    // Model load/unload handlers
    getLoadModelBtn().addEventListener("click", () => this.handleLoadModel());
    getUnloadModelBtn().addEventListener("click", () =>
      this.handleUnloadModel()
    );

    // L0 toggle handler
    getLayerToggle(0).addEventListener("change", (e) =>
      this.handleL0ToggleChange(e)
    );

    // Model select handler
    getModelSelect().addEventListener("change", () => this.handleModelChange());

    // ONNX toggle handler
    getOnnxLayersToggle().addEventListener("click", () =>
      this.handleOnnxToggle()
    );

    // Diff view toggle handler
    getDiffViewToggle().addEventListener("click", () =>
      this.handleDiffViewToggle()
    );

    // Timing display toggle handler
    const timingToggle = getTimingDisplayToggle();
    if (timingToggle) {
      console.log("Found timing display toggle button");
      timingToggle.addEventListener("click", () =>
        this.handleTimingDisplayToggle()
      );
    } else {
      console.error("Timing display toggle button not found");
    }

    // Initialize ONNX button state
    this.updateOnnxButtonState();

    // Initialize timing display button state
    this.updateTimingDisplayButtonState();

    // Layer toggle button click handlers
    document.querySelectorAll(".layer-toggle-button").forEach((button) => {
      button.addEventListener("click", (e) => this.handleLayerToggleClick(e));
    });

    // Save state when checkboxes change
    for (let i = 0; i < numTotalLayers; i++) {
      const checkbox = getLayerToggle(i);
      if (checkbox) {
        checkbox.addEventListener("change", (e) =>
          this.saveLayerToggleState(i, e.target.checked)
        );
      }
    }

    // Initialize layer toggle states after a short delay to ensure DOM is ready
    setTimeout(() => {
      this.loadLayerToggleStates();
    }, 100);
  }

  async handleStartRecording() {
    try {
      getStartBtn().disabled = true;
      getModelSelect().disabled = true;
      getQuantSelect().disabled = true;
      getLanguageSelect().disabled = true;
      getBackendSelect().disabled = true;
      getLayerToggle(0).disabled = true;
      getLayerToggle(1).disabled = true;
      getLayerToggle(2).disabled = true;
      getLayerToggle(3).disabled = true;
      getLayerToggle(4).disabled = true;

      getStatusDiv().textContent =
        "Please select a tab/screen and SHARE AUDIO...";

      const language = getLanguageSelect().value;
      const backend = getBackendSelect().value;
      const model = getModelSelect().value;
      const quant = getQuantSelect().value;

      // Collect enabled layers
      const enabledLayers = [];
      const l0Enabled = getLayerToggle(0).checked;
      if (l0Enabled) enabledLayers.push(0);
      if (getLayerToggle(1).checked) enabledLayers.push(1);
      if (getLayerToggle(2).checked) enabledLayers.push(2);
      if (getLayerToggle(3).checked) enabledLayers.push(3);
      if (getLayerToggle(4).checked) enabledLayers.push(4);

      // Show/hide streaming section based on L0 toggle
      const streamingSection = getStreamingSection();
      if (streamingSection) {
        streamingSection.style.display = l0Enabled ? "block" : "none";
      }

      // Initialize streaming worker if L0 is enabled
      if (l0Enabled && !this.managers.streamingManager.getWorker()) {
        this.managers.streamingManager.initializeStreamingWorker();
      }

      // Ensure at least one layer is enabled
      if (enabledLayers.length === 0) {
        enabledLayers.push(4); // Default to L4 if none selected
        getLayerToggle(4).checked = true;
      }

      // Load model if not already loaded
      if (!this.managers.transcriber.isInitialized) {
        const useOnnx = this.isOnnxEnabled();
        await this.managers.transcriber.init(
          language,
          backend,
          model,
          enabledLayers,
          quant,
          useOnnx
        );
        this.appState.setModelLoaded(true);
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
      if (this.managers.visualizer) {
        this.managers.visualizer.destroy();
      }
      this.managers.visualizer = new this.managers.Visualizer(getCanvas());

      // Set the MediaStream for real-time waveform visualization
      this.managers.visualizer.setMediaStream(stream);

      this.managers.audioProcessor = new this.managers.AudioProcessor(
        stream,
        (audioData, metadata) => {
          this.managers.transcriber.process(audioData, metadata);

          // Also send to streaming worker if L0 is enabled
          if (
            getLayerToggle(0).checked &&
            this.managers.streamingManager.getWorker()
          ) {
            this.managers.streamingManager.startStreamingTranscription(
              audioData
            );
          }
        },
        () => {
          this.managers.transcriber.commitAndReset();
          if (getLayerToggle(0).checked) {
            this.managers.streamingManager.stopStreamingTranscription();
          }
        }
      );

      this.managers.audioProcessor.start();
      this.appState.isRecording = true;
      this.managers.timerManager.startRecordingTimer();
      getStopBtn().disabled = false;
      getStatusDiv().textContent = "Recording...";
    } catch (err) {
      console.error("Error starting:", err);
      getStatusDiv().textContent = "Error: " + err.message;
      getStartBtn().disabled = false;
      getLanguageSelect().disabled = false;
      getBackendSelect().disabled = false;
    }
  }

  handleStopRecording() {
    if (this.managers.audioProcessor) {
      this.managers.audioProcessor.stop();
    }
    // Don't stop transcriber here - keep model loaded
    if (this.managers.streamingManager.getWorker()) {
      this.managers.streamingManager.stopStreamingTranscription();
      // streamingWorkerReady = false; // Reset ready flag - this should be handled in streaming manager
    }
    if (this.managers.visualizer) {
      this.managers.visualizer.destroy();
    }
    this.appState.isRecording = false;
    this.managers.timerManager.stopRecordingTimer();
    getStartBtn().disabled = false;
    getStopBtn().disabled = true;
    getModelSelect().disabled = false;
    getQuantSelect().disabled = false;
    getLanguageSelect().disabled = false;
    getBackendSelect().disabled = false;
    getLayerToggle(0).disabled = false;
    getLayerToggle(1).disabled = false;
    getLayerToggle(2).disabled = false;
    getLayerToggle(3).disabled = false;
    getLayerToggle(4).disabled = false;
    getStatusDiv().textContent = "Stopped (Model still loaded)";
  }

  async handleLoadModel() {
    if (this.appState.isRecording) {
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
      for (let i = 0; i < numTotalLayers; i++) {
        const layerToggle = getLayerToggle(i);
        if (layerToggle && layerToggle.checked) {
          enabledLayers.push(i);
        }
      }

      // Ensure at least one layer is enabled
      if (enabledLayers.length === 0) {
        enabledLayers.push(4); // Default to L4 if none selected
        getLayerToggle(4).checked = true;
      }

      const useOnnx = this.isOnnxEnabled();

      await this.managers.transcriber.loadModel(
        language,
        backend,
        model,
        enabledLayers,
        quant,
        useOnnx
      );

      // Update state and UI
      this.appState.setModelLoaded(true);
      getLoadModelBtn().disabled = true;
      getUnloadModelBtn().disabled = false;
      getStatusDiv().textContent = `Model loaded: ${model.split("/").pop()}`;
    } catch (error) {
      console.error("Error loading model:", error);
      getStatusDiv().textContent = `Error loading model: ${error.message}`;
      getLoadModelBtn().disabled = false;
      getLoadModelBtn().textContent = "Load Model";
    }
  }

  async handleUnloadModel() {
    if (this.appState.isRecording) {
      alert(
        "Cannot unload model while recording. Please stop recording first."
      );
      return;
    }

    try {
      getUnloadModelBtn().disabled = true;
      getUnloadModelBtn().textContent = "Unloading...";
      getStatusDiv().textContent = "Unloading model...";

      await this.managers.transcriber.unloadModel();

      // Update state and UI
      this.appState.setModelLoaded(false);
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
  }

  handleL0ToggleChange(e) {
    const streamingSection = getStreamingSection();
    if (streamingSection) {
      streamingSection.style.display = e.target.checked ? "block" : "none";
    }

    // If turning off L0, clear streaming data
    if (!e.target.checked) {
      // This should be handled by streaming manager
    }

    // If turning on L0 during recording, initialize streaming worker
    if (
      e.target.checked &&
      this.appState.isRecording &&
      !this.managers.streamingManager.getWorker()
    ) {
      this.managers.streamingManager.initializeStreamingWorker();
    }
  }

  handleLayerToggleClick(e) {
    // Don't trigger if clicking on the actual checkbox
    if (e.target.type === "checkbox") return;

    const checkbox = e.currentTarget.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.checked = !checkbox.checked;
      // Save the state
      const layerIndex = checkbox.id.match(/layer-l(\d)-toggle/)?.[1];
      if (layerIndex) {
        this.saveLayerToggleState(layerIndex, checkbox.checked);
      }
      // Trigger the change event manually
      checkbox.dispatchEvent(new Event("change"));
    }
  }

  loadLayerToggleStates() {
    for (let i = 0; i <= 4; i++) {
      const checkbox = getLayerToggle(i);
      if (checkbox) {
        const savedState = localStorage.getItem(`layer-toggle-${i}`);

        let shouldBeChecked;
        if (savedState !== null) {
          shouldBeChecked = savedState === "true";
        } else {
          // Set default states: L0 off, L1-L4 on
          shouldBeChecked = i > 0;
          // Save the default state
          this.saveLayerToggleState(i, shouldBeChecked);
        }

        checkbox.checked = shouldBeChecked;
      }
    }
  }

  saveLayerToggleState(layerIndex, checked) {
    localStorage.setItem(`layer-toggle-${layerIndex}`, checked.toString());
  }

  async handleModelChange() {
    const newModel = getModelSelect().value;
    const wasRecording = this.appState.isRecording;
    const oldModel = this.appState.currentModel;

    // If currently recording, stop first
    if (this.appState.isRecording) {
      console.log("Stopping recording to change model...");
      this.handleStopRecording();
      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // If model is loaded, unload it first
    if (this.managers.transcriber && this.managers.transcriber.isInitialized) {
      console.log("Unloading current model before switching...");
      await this.managers.transcriber.unloadModel();
      this.appState.setModelLoaded(false);
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
      for (let i = 0; i < numTotalLayers; i++) {
        const layerToggle = getLayerToggle(i);
        if (layerToggle && layerToggle.checked) {
          enabledLayers.push(i);
        }
      }

      // Update current model
      this.appState.currentModel = newModel;

      // Initialize with new model
      const useOnnx = this.isOnnxEnabled();
      await this.managers.transcriber.init(
        language,
        backend,
        newModel,
        enabledLayers,
        null,
        useOnnx
      );

      // If we were recording before, restart recording
      if (wasRecording) {
        console.log("Restarting recording with new model...");
        // Simulate clicking start button
        this.handleStartRecording();
      } else {
        getStatusDiv().textContent = `Ready - Model: ${newModel
          .split("/")
          .pop()}`;
      }
    } catch (error) {
      console.error("Error switching model:", error);
      getStatusDiv().textContent = `Error switching model: ${error.message}`;

      // Revert to previous model on error
      this.appState.currentModel = oldModel;
      getModelSelect().value = oldModel;
      if (wasRecording) {
        // Try to restart with original model
        try {
          this.handleStartRecording();
        } catch (restartError) {
          console.error("Error restarting with original model:", restartError);
        }
      }
    }
  }

  handleOnnxToggle() {
    this.onnxEnabled = !this.onnxEnabled;
    this.updateOnnxButtonState();

    // If a model is loaded, we should probably reload it with the new ONNX setting
    // But for now, just update the state - user will need to reload model manually
    console.log(`ONNX ${this.onnxEnabled ? "enabled" : "disabled"}`);
  }

  updateOnnxButtonState() {
    const button = getOnnxLayersToggle();
    if (this.onnxEnabled) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  }

  isOnnxEnabled() {
    return this.onnxEnabled;
  }

  handleDiffViewToggle() {
    this.diffViewEnabled = !this.diffViewEnabled;
    this.updateDiffViewButtonState();

    // Update transcription display diff view setting
    this.managers.transcriptionDisplay.setDiffView(this.diffViewEnabled);
  }

  updateDiffViewButtonState() {
    const button = getDiffViewToggle();
    if (this.diffViewEnabled) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  }

  handleTimingDisplayToggle() {
    this.timingDisplayTokensPerSecond = !this.timingDisplayTokensPerSecond;
    this.updateTimingDisplayButtonState();

    // Update transcription display timing mode
    this.managers.transcriptionDisplay.setTimingDisplayMode(
      this.timingDisplayTokensPerSecond
    );

    // Refresh the current timing display
    if (this.managers.transcriber && this.managers.transcriber.timingStats) {
      this.managers.transcriptionDisplay.updateTimingDisplayWithState(
        this.managers.transcriber.timingStats
      );
    }
  }

  updateTimingDisplayButtonState() {
    const button = getTimingDisplayToggle();
    button.textContent = this.timingDisplayTokensPerSecond
      ? "Tokens/s"
      : "Time";
    if (this.timingDisplayTokensPerSecond) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  }

  isDiffViewEnabled() {
    return this.diffViewEnabled;
  }
}
