/**
 * DAW-style Waveform Visualizer
 * A professional scrolling waveform display like in digital audio workstations
 */

export class Visualizer {
  constructor(container) {
    this.container = container;
    this.canvas = null;
    this.ctx = null;
    this.mediaStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.animationId = null;
    this.isInitialized = false;

    // Waveform buffer - stores amplitude values for the scrolling display
    this.waveformData = [];
    this.maxDataPoints = 800; // Number of vertical bars in the waveform

    // Visual settings
    this.colors = {
      background: "#0a0a0a",
      waveformTop: "#00d4ff", // Cyan for positive amplitude
      waveformBottom: "#00d4ff", // Same for mirrored
      waveformGlow: "rgba(0, 212, 255, 0.3)",
      gridLine: "rgba(255, 255, 255, 0.06)",
      gridLineAccent: "rgba(255, 255, 255, 0.12)",
      centerLine: "rgba(255, 255, 255, 0.15)",
      timeMarker: "rgba(255, 255, 255, 0.4)",
    };

    // Performance settings
    this.smoothingFactor = 0.85;
    this.lastAmplitude = 0;

    this.initCanvas();
  }

  initCanvas() {
    // Clear container
    if (typeof this.container === "string") {
      this.container = document.querySelector(this.container);
    }
    this.container.innerHTML = "";

    // Create canvas
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.display = "block";
    this.canvas.style.borderRadius = "6px";
    this.container.appendChild(this.canvas);

    // Get context
    this.ctx = this.canvas.getContext("2d");

    // Handle resize
    this.resizeCanvas();
    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(this.container);

    this.isInitialized = true;

    // Draw initial empty state
    this.drawEmptyState();
  }

  resizeCanvas() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    this.ctx.scale(dpr, dpr);

    this.width = rect.width;
    this.height = rect.height;

    // Recalculate data points based on width
    this.maxDataPoints = Math.floor(this.width / 2); // 2px per bar
  }

  drawEmptyState() {
    if (!this.ctx) return;

    // Background
    this.ctx.fillStyle = this.colors.background;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw grid
    this.drawGrid();

    // Center line
    const centerY = this.height / 2;
    this.ctx.strokeStyle = this.colors.centerLine;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, centerY);
    this.ctx.lineTo(this.width, centerY);
    this.ctx.stroke();

    // "Waiting for audio" text
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    this.ctx.font = '14px "SF Mono", "Monaco", "Inconsolata", monospace';
    this.ctx.textAlign = "center";
    this.ctx.fillText(
      "Waiting for audio...",
      this.width / 2,
      this.height / 2 + 5
    );
  }

  drawGrid() {
    const ctx = this.ctx;

    // Vertical grid lines (time markers)
    const verticalSpacing = 50;
    ctx.strokeStyle = this.colors.gridLine;
    ctx.lineWidth = 1;

    for (let x = 0; x < this.width; x += verticalSpacing) {
      // Accent every 4th line
      ctx.strokeStyle =
        x % (verticalSpacing * 4) === 0
          ? this.colors.gridLineAccent
          : this.colors.gridLine;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }

    // Horizontal grid lines (amplitude markers)
    const horizontalSpacing = this.height / 6;
    ctx.strokeStyle = this.colors.gridLine;

    for (let y = horizontalSpacing; y < this.height; y += horizontalSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
  }

  setMediaStream(stream) {
    if (!this.isInitialized) {
      console.warn("Visualizer not initialized");
      return;
    }

    try {
      this.mediaStream = stream;
      this.waveformData = [];

      // Create audio context and analyser
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();

      // High resolution analysis
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.3;
      source.connect(this.analyser);

      // Start visualization
      this.startVisualization();

      console.log("DAW waveform visualizer started");
    } catch (error) {
      console.error("Failed to start visualization:", error);
    }
  }

  startVisualization() {
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    const draw = () => {
      if (!this.analyser) return;

      // Get time domain data
      this.analyser.getFloatTimeDomainData(dataArray);

      // Calculate RMS amplitude
      let sum = 0;
      let max = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const val = Math.abs(dataArray[i]);
        sum += val * val;
        if (val > max) max = val;
      }
      const rms = Math.sqrt(sum / dataArray.length);

      // Use a combination of RMS and peak for better visual response
      let amplitude = rms * 0.7 + max * 0.3;

      // Apply smoothing
      amplitude =
        this.lastAmplitude * this.smoothingFactor +
        amplitude * (1 - this.smoothingFactor);
      this.lastAmplitude = amplitude;

      // Boost for visibility (audio levels can be quite low)
      amplitude = Math.min(1, amplitude * 3);

      // Add to waveform data
      this.waveformData.push(amplitude);

      // Keep buffer at max size
      if (this.waveformData.length > this.maxDataPoints) {
        this.waveformData.shift();
      }

      // Render
      this.render();

      this.animationId = requestAnimationFrame(draw);
    };

    draw();
  }

  render() {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    const centerY = height / 2;

    // Clear with background
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    this.drawGrid();

    // Draw center line
    ctx.strokeStyle = this.colors.centerLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    if (this.waveformData.length === 0) return;

    // Calculate bar dimensions
    const barWidth = 2;
    const barGap = 0;
    const totalBarWidth = barWidth + barGap;
    const maxBars = Math.floor(width / totalBarWidth);

    // Get the visible portion of waveform data
    const startIdx = Math.max(0, this.waveformData.length - maxBars);
    const visibleData = this.waveformData.slice(startIdx);

    // Calculate starting X position (right-aligned, scrolling left)
    const startX = width - visibleData.length * totalBarWidth;

    // Draw waveform bars
    ctx.lineCap = "round";

    for (let i = 0; i < visibleData.length; i++) {
      const amplitude = visibleData[i];
      const x = startX + i * totalBarWidth;

      // Calculate bar height (max is half the canvas height minus padding)
      const maxBarHeight = height / 2 - 8;
      const barHeight = amplitude * maxBarHeight;

      if (barHeight < 0.5) continue; // Skip very small bars

      // Create gradient for the bar
      const gradient = ctx.createLinearGradient(
        x,
        centerY - barHeight,
        x,
        centerY + barHeight
      );
      gradient.addColorStop(0, this.colors.waveformTop);
      gradient.addColorStop(0.5, "rgba(0, 212, 255, 0.8)");
      gradient.addColorStop(1, this.colors.waveformBottom);

      // Draw glow effect (subtle)
      ctx.shadowColor = this.colors.waveformGlow;
      ctx.shadowBlur = 4;

      // Draw the mirrored waveform bar
      ctx.fillStyle = gradient;

      // Top bar (positive)
      ctx.fillRect(x, centerY - barHeight, barWidth, barHeight);

      // Bottom bar (mirrored/negative)
      ctx.fillRect(x, centerY, barWidth, barHeight);
    }

    // Reset shadow
    ctx.shadowBlur = 0;

    // Draw level meter on the right side
    this.drawLevelMeter(
      ctx,
      width,
      height,
      this.waveformData[this.waveformData.length - 1] || 0
    );
  }

  drawLevelMeter(ctx, width, height, level) {
    const meterWidth = 4;
    const meterX = width - meterWidth - 8;
    const meterHeight = height - 16;
    const meterY = 8;

    // Meter background
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(meterX, meterY, meterWidth, meterHeight);

    // Meter level
    const levelHeight = level * meterHeight;

    // Color based on level
    let meterColor;
    if (level > 0.8) {
      meterColor = "#ff3366"; // Red for clipping
    } else if (level > 0.6) {
      meterColor = "#ffaa00"; // Orange for high
    } else {
      meterColor = "#00d4ff"; // Cyan for normal
    }

    ctx.fillStyle = meterColor;
    ctx.fillRect(
      meterX,
      meterY + meterHeight - levelHeight,
      meterWidth,
      levelHeight
    );

    // Meter border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    ctx.strokeRect(meterX, meterY, meterWidth, meterHeight);
  }

  pause() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.audioContext && this.audioContext.state === "running") {
      this.audioContext.suspend();
    }
  }

  play() {
    if (this.audioContext && this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    if (!this.animationId && this.analyser) {
      this.startVisualization();
    }
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
    this.mediaStream = null;
    this.waveformData = [];
    this.isInitialized = false;

    // Clear canvas
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
  }

  // Legacy method for compatibility
  draw(audioData) {
    // Handled by real-time visualization loop
  }
}
