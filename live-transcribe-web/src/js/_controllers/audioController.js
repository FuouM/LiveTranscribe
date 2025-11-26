import { setAudioStream } from "../state.js";
import { eventBus } from "../_events/eventBus.js";

let audioProcessor = null;
let currentStream = null;

export class AudioProcessor {
  constructor(onAudioData) {
    this.onAudioData = onAudioData;
    this.audioContext = null;
    this.mediaStreamSource = null;
    this.processor = null;
    this.isRecording = false;
  }

  async init() {
    try {
      this.audioContext = new AudioContext({ sampleRate: 16000 });
    } catch (error) {
      console.error("Error creating AudioContext:", error);
      throw error;
    }
  }

  async start(stream) {
    if (this.isRecording) return;

    try {
      currentStream = stream;
      setAudioStream(stream);

      this.mediaStreamSource =
        this.audioContext.createMediaStreamSource(stream);

      // Create a ScriptProcessorNode for real-time audio processing
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (event) => {
        if (!this.isRecording) return;

        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);

        // Convert to Float32Array and send to callback
        const audioData = new Float32Array(inputData);
        this.onAudioData(audioData, { timestamp: Date.now() });
      };

      this.mediaStreamSource.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.isRecording = true;
      eventBus.emit("audio_started");
    } catch (error) {
      console.error("Error starting audio processing:", error);
      throw error;
    }
  }

  stop() {
    if (!this.isRecording) return;

    try {
      if (this.processor) {
        this.processor.disconnect();
        this.processor = null;
      }

      if (this.mediaStreamSource) {
        this.mediaStreamSource.disconnect();
        this.mediaStreamSource = null;
      }

      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
        currentStream = null;
      }

      setAudioStream(null);
      this.isRecording = false;
      eventBus.emit("audio_stopped");
    } catch (error) {
      console.error("Error stopping audio processing:", error);
    }
  }

  isActive() {
    return this.isRecording;
  }
}

export function createAudioProcessor(onAudioData) {
  audioProcessor = new AudioProcessor(onAudioData);
  return audioProcessor;
}

export async function getScreenAudioStream() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // Required for API to work, even though we only use audio
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

    return stream;
  } catch (error) {
    console.error("Error getting screen audio:", error);
    throw error;
  }
}
