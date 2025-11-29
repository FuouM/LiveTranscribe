// Simple test to see if basic rendering works
console.log("Main.js loaded and executing... V1.0");

// Import modules
import { initializeThemeToggle } from "./utils/theme.js";
import { loadHtmlTemplate } from "./utils/html-loader.js";
import { getStatusDiv } from "./utils/dom-helpers.js";

// App state
class AppState {
  constructor() {
    this.isRecording = false;
    this.modelLoaded = false;
    this.currentModel = "Xenova/whisper-tiny";
  }

  setModelLoaded(loaded) {
    this.modelLoaded = loaded;
  }

  isModelLoaded() {
    return this.modelLoaded;
  }
}

async function initializeApp() {
  const appContainer = document.getElementById("app-container");
  if (!appContainer) {
    console.error("App container not found!");
    return;
  }

  console.log("Found app container, rendering basic UI...");

  try {
    // Load and set the app container template
    console.log("Loading app container template...");
    const appContainerTemplate = await loadHtmlTemplate(
      "/templates/app-container.html"
    );
    console.log(
      "App container template loaded, length:",
      appContainerTemplate.length
    );
    appContainer.innerHTML = appContainerTemplate;

    // Initialize theme toggle (use requestAnimationFrame to ensure DOM is ready)
    requestAnimationFrame(() => {
      initializeThemeToggle();
    });

    // Now try to render the workbench
    setTimeout(async () => {
      console.log("Attempting to render workbench...");
      const centerStage = document.getElementById("center-stage");
      if (centerStage) {
        try {
          console.log("Loading workbench template...");
          const workbenchTemplate = await loadHtmlTemplate(
            "/templates/workbench.html"
          );
          console.log(
            "Workbench template loaded, length:",
            workbenchTemplate.length
          );
          centerStage.innerHTML = workbenchTemplate;
          console.log("Workbench HTML rendered successfully");

          // Now try to load the full functionality
          loadFullFunctionality();
        } catch (error) {
          console.error("Error loading workbench template:", error);
        }
      }
    }, 100);
  } catch (error) {
    console.error("Error loading app container template:", error);
  }
}

// Initialize the application
initializeApp();

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

  // Import our extracted modules
  const { StreamingManager } = await import("./managers/streaming-manager.js");
  const { TranscriptionDisplay } = await import(
    "./managers/transcription-display.js"
  );
  const { TimerManager } = await import("./managers/timer-manager.js");
  const { EventHandlers } = await import("./managers/event-handlers.js");
  const { ModelManager } = await import("./managers/model-manager.js");

  // Initialize managers
  const appState = new AppState();
  const streamingManager = new StreamingManager();
  const transcriptionDisplay = new TranscriptionDisplay();
  const timerManager = new TimerManager();
  const modelManager = new ModelManager();

  // Set up model manager
  modelManager.setStatusUpdateCallback((text) => {
    getStatusDiv().textContent = text;
  });

  // Create transcriber
  const transcriber = await modelManager.createTranscriber(
    modelManager.getCurrentModel(),
    transcriptionDisplay
  );

  // Initialize visualizer
  const visualizer = new Visualizer(document.getElementById("visualizer"));

  // Set up managers object for event handlers
  const managers = {
    audioProcessor: null,
    transcriber,
    visualizer,
    Visualizer,
    AudioProcessor,
    streamingManager,
    transcriptionDisplay,
    timerManager,
    modelManager,
  };

  // Initialize event handlers
  const eventHandlers = new EventHandlers(appState, managers);

  // Initialize the app
  document.getElementById("model-select").value = appState.currentModel;
  document.getElementById("language-select").value = "en";

  console.log("Full application initialized successfully!");
  getStatusDiv().textContent = "Ready - Full functionality loaded";

  // Initialize timing display
  transcriptionDisplay.updateTimingDisplayWithState({
    0: {
      totalTime: 0,
      count: 0,
      lastTime: 0,
      averageTime: 0,
      totalTokens: 0,
      lastTokens: 0,
      averageTokens: 0,
    },
    1: {
      totalTime: 0,
      count: 0,
      lastTime: 0,
      averageTime: 0,
      totalTokens: 0,
      lastTokens: 0,
      averageTokens: 0,
    },
    2: {
      totalTime: 0,
      count: 0,
      lastTime: 0,
      averageTime: 0,
      totalTokens: 0,
      lastTokens: 0,
      averageTokens: 0,
    },
    3: {
      totalTime: 0,
      count: 0,
      lastTime: 0,
      averageTime: 0,
      totalTokens: 0,
      lastTokens: 0,
      averageTokens: 0,
    },
    4: {
      totalTime: 0,
      count: 0,
      lastTime: 0,
      averageTime: 0,
      totalTokens: 0,
      lastTokens: 0,
      averageTokens: 0,
    },
  });
}
