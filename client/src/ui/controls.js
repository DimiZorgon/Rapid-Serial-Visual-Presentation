/**
 * Controls module: WPM, play/pause, sentence navigation, progress slider, and direct percent input.
 */

export function clampWpm(value) {
  const rounded = Math.round(Number(value || 300) / 25) * 25;
  return Math.max(100, Math.min(1000, rounded));
}

export function updateWpmDisplay(wpm) {
  const display = document.getElementById("wpmDisplay");
  if (display) display.textContent = `${wpm} mpm`;
}

export function updateChunkButtons(chunkSize) {
  const size = Math.max(1, Math.min(3, Number(chunkSize) || 1));
  [1, 2, 3].forEach((n) => {
    const btn = document.getElementById(`btnChunk${n}`);
    if (btn) {
      if (n === size) {
        btn.className = "px-2 py-0.5 rounded transition text-fg font-medium bg-subtle";
      } else {
        btn.className = "px-2 py-0.5 rounded transition hover:text-fg text-muted";
      }
    }
  });
}

export function updatePlayPauseButton(isPlaying) {
  const btn = document.getElementById("btnPlayPause");
  if (btn) btn.textContent = isPlaying ? "Pause" : "Lecture";
}

export function navigatePrevSentence(state) {
  if (!state.book || !state.book.chapters) return;
  const ch = state.book.chapters[state.chapterIndex] || state.book.chapters[0];
  if (!ch || !ch.words || !ch.words.length) return;

  const curWord = ch.words[state.wordIndex] || ch.words[0];
  const curSent = ch.sentences[curWord.sentenceIndex] || ch.sentences[0];

  if (state.wordIndex - curSent.startWordIndex > 2) {
    state.wordIndex = curSent.startWordIndex;
  } else if (curWord.sentenceIndex > 0) {
    state.wordIndex = ch.sentences[curWord.sentenceIndex - 1].startWordIndex;
  } else if (state.chapterIndex > 0) {
    state.chapterIndex--;
    const prevCh = state.book.chapters[state.chapterIndex];
    const lastSent = prevCh.sentences[prevCh.sentences.length - 1];
    state.wordIndex = lastSent.startWordIndex;
  } else {
    state.wordIndex = 0;
  }
}

export function navigateNextSentence(state) {
  if (!state.book || !state.book.chapters) return;
  const ch = state.book.chapters[state.chapterIndex] || state.book.chapters[0];
  if (!ch || !ch.words || !ch.words.length) return;

  const curWord = ch.words[state.wordIndex] || ch.words[0];
  if (curWord.sentenceIndex + 1 < ch.sentences.length) {
    state.wordIndex = ch.sentences[curWord.sentenceIndex + 1].startWordIndex;
  } else if (state.chapterIndex + 1 < state.book.chapters.length) {
    state.chapterIndex++;
    state.wordIndex = 0;
  } else {
    state.wordIndex = ch.words.length - 1;
  }
}

export function parsePercentageInput(rawString) {
  if (!rawString) return null;
  const normalized = String(rawString).replace(",", ".").trim();
  const val = parseFloat(normalized);
  if (isNaN(val)) return null;
  return Math.max(0, Math.min(100, val));
}
