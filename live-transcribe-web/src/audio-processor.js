export class AudioProcessor {
  constructor(stream, onAudioChunk, onSilenceDetected) {
    this.stream = stream;
    this.onAudioChunk = onAudioChunk;
    this.onSilenceDetected = onSilenceDetected;
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.source = this.audioContext.createMediaStreamSource(stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    // Simple energy-based VAD
    this.isSpeaking = false;
    this.silenceFrames = 0;
    this.lastSpeechTime = Date.now();
  }

  start() {
    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);

      // Simple energy-based VAD
      const energy = this.calculateEnergy(inputData);
      const threshold = 0.01;

      if (energy > threshold) {
        this.isSpeaking = true;
        this.lastSpeechTime = Date.now();
        this.silenceFrames = 0;
      } else {
        const silenceDuration = (Date.now() - this.lastSpeechTime) / 1000;
        // 2 seconds of silence = commit
        if (silenceDuration > 2.0 && this.isSpeaking) {
          console.log(
            "[AudioProcessor] 2s silence detected, committing segment"
          );
          if (this.onSilenceDetected) {
            this.onSilenceDetected();
          }
          this.isSpeaking = false;
        }
      }

      // Always send audio chunks for transcription
      this.onAudioChunk(inputData, {
        isSpeaking: this.isSpeaking,
      });
    };
  }

  stop() {
    this.processor.disconnect();
    this.source.disconnect();
    this.stream.getTracks().forEach((track) => track.stop());
    this.audioContext.close();
  }

  calculateEnergy(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }
}
