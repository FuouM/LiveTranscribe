import {
  getTranscriptDiv,
  getCopyL4Btn,
  getLayerL0Toggle,
} from "../utils/dom-helpers.js";

export class TranscriptionDisplay {
  constructor() {
    // Dual-display structure for tracking transcription evolution
    this.committedSegments = [];
    this.currentPartial = "";
    this.lastCommittedText = "";
    this.showDiffView = false; // Toggle for diff visualization
    this.latestL4Diff = null; // Store the latest L4 diff visualization
    this.replacedSegments = []; // Store segments that were replaced for diff comparison
    this.showTokensPerSecond = false; // Toggle for timing display mode
  }

  deduplicateTranscription(newText, type) {
    if (!newText || !newText.trim()) return "";

    const trimmedNew = newText.trim().toLowerCase();

    if (type === "final") {
      const recentCommits = this.committedSegments
        .slice(-3)
        .map((s) => s.text)
        .join(" ")
        .toLowerCase();
      if (
        recentCommits.includes(trimmedNew) ||
        (this.lastCommittedText &&
          this.lastCommittedText.toLowerCase() === trimmedNew)
      ) {
        return "";
      }
      return newText.trim();
    }

    if (
      type === "partial" &&
      this.currentPartial &&
      this.currentPartial.toLowerCase() === trimmedNew
    ) {
      return "";
    }

    return newText.trim();
  }

  updateDisplay() {
    const transcriptDiv = getTranscriptDiv();
    transcriptDiv.innerHTML = "";

    // Check if we should show diff view
    const shouldShowDiff = this.showDiffView && this.latestL4Diff;

    this.committedSegments.forEach((segment, index) => {
      if (segment.isSeparator) {
        // Add a visual separator instead of text
        const separatorDiv = document.createElement("div");
        separatorDiv.className = "transcription-separator";
        separatorDiv.innerHTML =
          '<hr style="border: none; border-top: 1px solid #444; margin: 10px 0;">';
        transcriptDiv.appendChild(separatorDiv);
      } else {
        // Check if this segment has diff data to display
        const hasDiffData =
          this.latestL4Diff &&
          segment === this.latestL4Diff.l4Segment &&
          shouldShowDiff;

        if (hasDiffData) {
          // Show diff view for this L4 segment
          this.renderDiffView(transcriptDiv, this.latestL4Diff);
        } else {
          // Normal segment display
          const segmentDiv = document.createElement("div");
          segmentDiv.className = `committed-text level-${segment.level || 1}`;
          segmentDiv.textContent = segment.text || segment;
          transcriptDiv.appendChild(segmentDiv);
        }
      }
    });

    // Streaming transcription is handled separately by updateStreamingTranscriptionDisplay()

    console.log("[Display Update]", {
      committed: this.committedSegments.length,
      streaming: getLayerL0Toggle().checked ? "active" : "none",
      partial: this.currentPartial ? `"${this.currentPartial}"` : "none",
      diffView: shouldShowDiff ? "active" : "none",
    });

    if (this.currentPartial) {
      const currentDiv = document.createElement("div");
      currentDiv.className = "current-transcription";

      const partialSpan = document.createElement("span");
      partialSpan.textContent = `[${this.currentPartial}]`;
      partialSpan.className = "sentence-partial";
      currentDiv.appendChild(partialSpan);

      transcriptDiv.appendChild(currentDiv);
    }

    transcriptDiv.scrollTop = transcriptDiv.scrollHeight;
  }

  getL4TranscriptionText() {
    // Extract only L4 (ground truth) segments
    const l4Segments = this.committedSegments.filter(
      (segment) => !segment.isSeparator && parseInt(segment.level) === 4
    );

    // Join the text content with newlines
    return l4Segments.map((segment) => segment.text || segment).join("\n\n");
  }

  copyL4ToClipboard() {
    const l4Text = this.getL4TranscriptionText();

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

  updateTimingDisplay(timingStats, showTokensPerSecond = false) {
    const formatTime = (ms) => {
      if (ms < 1000) return `${ms.toFixed(0)}ms`;
      return `${(ms / 1000).toFixed(2)}s`;
    };

    const formatTokensPerSecond = (tokens, timeMs) => {
      if (!timeMs || timeMs <= 0 || !tokens || tokens <= 0) return "-";
      const tps = (tokens / (timeMs / 1000)).toFixed(1);
      return `${tps} t/s`;
    };

    for (let level = 0; level <= 4; level++) {
      const stats = timingStats[level];
      let displayText = "-";

      if (stats && stats.count > 0) {
        if (showTokensPerSecond) {
          // Try to show tokens per second: last/average (count)
          const lastTps = formatTokensPerSecond(
            stats.lastTokens,
            stats.lastTime
          );
          const avgTps = formatTokensPerSecond(
            stats.averageTokens,
            stats.averageTime
          );

          // Only show tokens/second if we have valid data, otherwise fall back to time
          if (lastTps !== "-" && avgTps !== "-") {
            displayText = `${lastTps}/${avgTps} (${stats.count})`;
          } else {
            // Fall back to time display
            const avg = formatTime(stats.averageTime);
            const last = formatTime(stats.lastTime);
            displayText = `${last}/${avg} (${stats.count})`;
          }
        } else {
          // Show time: last/average (count)
          const avg = formatTime(stats.averageTime);
          const last = formatTime(stats.lastTime);
          displayText = `${last}/${avg} (${stats.count})`;
        }

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

  // Public method to update timing display with current mode
  updateTimingDisplayWithState(timingStats) {
    this.updateTimingDisplay(timingStats, this.showTokensPerSecond);
  }

  // Set timing display mode
  setTimingDisplayMode(showTokensPerSecond) {
    this.showTokensPerSecond = showTokensPerSecond;
  }

  // Getters and setters for state management
  getCommittedSegments() {
    return this.committedSegments;
  }

  setCommittedSegments(segments) {
    const oldL4Count = this.committedSegments.filter(
      (s) => parseInt(s.level) === 4 && !s.isSeparator
    ).length;
    this.committedSegments = segments;
    const newL4Count = this.committedSegments.filter(
      (s) => parseInt(s.level) === 4 && !s.isSeparator
    ).length;

    // Check if we have a new L4 segment and should generate diff
    if (newL4Count > oldL4Count && this.showDiffView) {
      this.generateLatestL4Diff();
    }
  }

  getCurrentPartial() {
    return this.currentPartial;
  }

  setCurrentPartial(partial) {
    this.currentPartial = partial;
  }

  getLastCommittedText() {
    return this.lastCommittedText;
  }

  setLastCommittedText(text) {
    this.lastCommittedText = text;
  }

  setReplacedSegments(replacedSegments) {
    this.replacedSegments = replacedSegments;
  }

  // Methods for managing segments
  addCommittedSegment(segment) {
    this.committedSegments.push(segment);

    // Check if we added an L4 segment and should generate diff
    if (segment.level === 4 && !segment.isSeparator && this.showDiffView) {
      this.generateLatestL4Diff();
    }
  }

  clearCommittedSegments() {
    this.committedSegments = [];
    this.replacedSegments = []; // Clear replaced segments
    this.latestL4Diff = null; // Clear diff cache
  }

  // Generate layered diff for the latest L4 segment
  generateLatestL4Diff() {
    if (!this.showDiffView) return null;

    // Find the latest L4 segment
    const l4Segments = this.committedSegments.filter(
      (s) => parseInt(s.level) === 4 && !s.isSeparator
    );
    if (l4Segments.length === 0) return null;

    const latestL4 = l4Segments[l4Segments.length - 1];

    // Find the replacement data for this L4 segment
    const replacementData = this.replacedSegments.find(
      (r) => r.l4Segment === latestL4
    );

    if (!replacementData || replacementData.replaced.length === 0) {
      return null; // No comparison possible
    }

    // Separate L2 and L3 segments from the replaced segments
    const l2Segments = replacementData.replaced.filter(
      (s) => parseInt(s.level) === 2
    );
    const l3Segments = replacementData.replaced.filter(
      (s) => parseInt(s.level) === 3
    );

    // Combine segments into single text blocks
    const l2Text = l2Segments
      .map((s) => s.text)
      .join(" ")
      .trim();
    const l3Text = l3Segments
      .map((s) => s.text)
      .join(" ")
      .trim();
    const l4Text = latestL4.text.trim();

    if (!l2Text && !l3Text) return null;

    // Generate the layered diff
    const diff = this.createLayeredDiff(l2Text, l3Text, l4Text);

    this.latestL4Diff = {
      l4Segment: latestL4,
      l2Text: l2Text,
      l3Text: l3Text,
      l4Text: l4Text,
      diff: diff,
    };

    return this.latestL4Diff;
  }

  // Create layered diff highlighting L2 vs L3 vs L4
  createLayeredDiff(l2Text, l3Text, l4Text) {
    const diff = [];

    // Split texts into words
    const l2Words = l2Text.split(/\s+/).filter((w) => w.length > 0);
    const l3Words = l3Text.split(/\s+/).filter((w) => w.length > 0);
    const l4Words = l4Text.split(/\s+/).filter((w) => w.length > 0);

    // Track which words have been used
    const l2Used = new Set();
    const l3Used = new Set();

    // For each L4 word, find the best match in L2/L3
    for (let l4Index = 0; l4Index < l4Words.length; l4Index++) {
      const l4Word = l4Words[l4Index];

      // First try to find match in L3 (higher priority)
      let bestMatch = this.findBestMatch(l4Word, l3Words, l3Used);
      if (bestMatch !== -1) {
        diff.push({
          text: l4Word,
          layer: 3,
          originalIndex: bestMatch,
        });
        l3Used.add(bestMatch);
        continue;
      }

      // Then try L2
      bestMatch = this.findBestMatch(l4Word, l2Words, l2Used);
      if (bestMatch !== -1) {
        diff.push({
          text: l4Word,
          layer: 2,
          originalIndex: bestMatch,
        });
        l2Used.add(bestMatch);
        continue;
      }

      // No match found - L4 only
      diff.push({
        text: l4Word,
        layer: 4,
        originalIndex: l4Index,
      });
    }

    return diff;
  }

  // Find best matching word in the source array
  findBestMatch(targetWord, sourceWords, usedIndices) {
    let bestMatch = -1;
    let bestScore = 0;

    for (let i = 0; i < sourceWords.length; i++) {
      if (usedIndices.has(i)) continue;

      if (this.wordsMatch(targetWord, sourceWords[i])) {
        // Perfect match - use immediately
        return i;
      }

      // For non-perfect matches, we could implement scoring here
      // For now, we'll stick with exact matches after cleaning
    }

    return bestMatch;
  }

  // Enhanced word matching with fuzzy logic
  wordsMatch(word1, word2) {
    if (!word1 || !word2) return false;

    // Clean words by removing punctuation and normalizing
    const clean1 = this.cleanWord(word1);
    const clean2 = this.cleanWord(word2);

    // Exact match after cleaning
    if (clean1 === clean2) return true;

    // Allow for minor differences (1-2 character difference for words > 4 chars)
    if (clean1.length > 4 && clean2.length > 4) {
      const diff = Math.abs(clean1.length - clean2.length);
      if (diff <= 2) {
        // Check if one is substring of the other (handles missing/extra characters)
        if (clean1.includes(clean2) || clean2.includes(clean1)) return true;

        // Check Levenshtein distance for small edits
        if (this.levenshteinDistance(clean1, clean2) <= 2) return true;
      }
    }

    // Handle common transcription variations
    // Numbers as words (twenty vs 20, etc.)
    if (this.isNumberWord(clean1) && this.isNumberWord(clean2)) {
      return this.normalizeNumber(clean1) === this.normalizeNumber(clean2);
    }

    return false;
  }

  // Clean word by removing punctuation and normalizing
  cleanWord(word) {
    return word
      .toLowerCase()
      .replace(/[.,!?;:()[\]{}"']/g, "") // Remove punctuation
      .replace(/[-–—]/g, " ") // Replace dashes with spaces
      .trim();
  }

  // Simple Levenshtein distance for fuzzy matching
  levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  // Check if word represents a number
  isNumberWord(word) {
    const numberWords = [
      "zero",
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
      "ten",
      "eleven",
      "twelve",
      "thirteen",
      "fourteen",
      "fifteen",
      "sixteen",
      "seventeen",
      "eighteen",
      "nineteen",
      "twenty",
      "thirty",
      "forty",
      "fifty",
      "sixty",
      "seventy",
      "eighty",
      "ninety",
      "hundred",
      "thousand",
      "million",
      "billion",
    ];
    return (
      /^\d+$/.test(word) ||
      numberWords.some((numWord) => word.includes(numWord))
    );
  }

  // Normalize number representations
  normalizeNumber(word) {
    // Convert written numbers to digits (basic implementation)
    const numberMap = {
      zero: "0",
      one: "1",
      two: "2",
      three: "3",
      four: "4",
      five: "5",
      six: "6",
      seven: "7",
      eight: "8",
      nine: "9",
      ten: "10",
      eleven: "11",
      twelve: "12",
      thirteen: "13",
      fourteen: "14",
      fifteen: "15",
      sixteen: "16",
      seventeen: "17",
      eighteen: "18",
      nineteen: "19",
      twenty: "20",
    };

    if (/^\d+$/.test(word)) return word;
    return numberMap[word.toLowerCase()] || word;
  }

  // Render the diff view
  renderDiffView(container, diffData) {
    const diffContainer = document.createElement("div");
    diffContainer.className = "layer-diff-container";

    // Render diff segments - group consecutive segments of same layer for connected underlines
    const diffText = document.createElement("div");
    diffText.className = "layer-diff-text";

    // Group consecutive segments by layer
    const groupedSegments = [];
    let currentGroup = null;

    diffData.diff.forEach((segment) => {
      if (!currentGroup || currentGroup.layer !== segment.layer) {
        // Start new group
        currentGroup = {
          layer: segment.layer,
          words: [segment.text],
        };
        groupedSegments.push(currentGroup);
      } else {
        // Add to current group
        currentGroup.words.push(segment.text);
      }
    });

    // Render grouped segments
    groupedSegments.forEach((group, index) => {
      const span = document.createElement("span");
      span.className = `layer-diff-segment layer-diff-l${group.layer}`;
      span.textContent = group.words.join(" ");
      diffText.appendChild(span);

      // Add space between groups (but not after the last group)
      if (index < groupedSegments.length - 1) {
        diffText.appendChild(document.createTextNode(" "));
      }
    });

    diffContainer.appendChild(diffText);
    container.appendChild(diffContainer);
  }

  // Toggle diff view on/off
  setDiffView(enabled) {
    this.showDiffView = enabled;
    if (!enabled) {
      this.latestL4Diff = null;
    } else {
      // Regenerate diff if enabling
      this.generateLatestL4Diff();
    }
    this.updateDisplay();
  }
}
