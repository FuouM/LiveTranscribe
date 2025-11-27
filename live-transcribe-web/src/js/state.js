// State management for the demo application
let state = {
  models: {
    modules: [],
    activeModuleId: null,
    modelStatuses: {},
    isModelLoaded: false,
  },
  workbench: {
    input: {
      audioStream: null,
      audioURL: null,
    },
    output: {
      text: "",
      partialText: "",
    },
    runtimeConfigs: {},
    isProcessing: false,
    inferenceStartTime: null,
    inferenceDuration: null,
  },
  system: {
    gpuSupported: false,
    useGpu: false,
  },
};

// State setters
export function setModules(modules) {
  state.models.modules = modules;
}

export function setActiveModuleId(id) {
  state.models.activeModuleId = id;
}

export function setModelStatuses(statuses) {
  state.models.modelStatuses = statuses;
}

export function setModelLoaded(isLoaded) {
  state.models.isModelLoaded = isLoaded;
}

export function setAudioStream(stream) {
  state.workbench.input.audioStream = stream;
}

export function setAudioURL(url) {
  state.workbench.input.audioURL = url;
}

export function setOutputText(text) {
  state.workbench.output.text = text;
}

export function setPartialText(text) {
  state.workbench.output.partialText = text;
}

export function setRuntimeConfigs(configs) {
  state.workbench.runtimeConfigs = configs;
}

export function setProcessing(isProcessing) {
  state.workbench.isProcessing = isProcessing;
}

export function setInferenceStartTime(time) {
  state.workbench.inferenceStartTime = time;
}

export function setInferenceDuration(duration) {
  state.workbench.inferenceDuration = duration;
}

export function setGpuSupported(supported) {
  state.system.gpuSupported = supported;
}

export function setUseGpu(use) {
  state.system.useGpu = use;
}

// State getters
export { state };
