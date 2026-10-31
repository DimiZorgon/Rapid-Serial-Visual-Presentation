/**
 * RSVP Global Indexer and Navigation Math Module.
 * Computes exact global positions, percentages, and word resolution across chapters.
 */

/**
 * Returns the current absolute 0-based word index across the entire book.
 * 
 * @param {object} state Object containing { book, chapterIndex, wordIndex }
 * @returns {number} Global word index
 */
export function getCurrentGlobalWordIndex(state) {
  if (!state || !state.book || !state.book.chapters || !state.book.chapters.length) {
    return 0;
  }
  const chIdx = Math.max(0, Math.min(state.book.chapters.length - 1, state.chapterIndex || 0));
  const ch = state.book.chapters[chIdx];
  const wIdx = Math.max(0, Math.min((ch.words ? ch.words.length - 1 : 0), state.wordIndex || 0));
  return (ch.globalStartWordIndex || 0) + wIdx;
}

/**
 * Computes the exact global percentage (0.0 to 100.0) read across the entire book.
 * 
 * @param {object} state Object containing { book, chapterIndex, wordIndex }
 * @returns {number} Percentage from 0 to 100
 */
export function getExactGlobalPercentage(state) {
  if (!state || !state.book || !state.book.totalWords || state.book.totalWords <= 1) {
    return 0;
  }
  const globalIdx = getCurrentGlobalWordIndex(state);
  return Math.min(100, Math.max(0, (globalIdx / (state.book.totalWords - 1)) * 100));
}

/**
 * Resolves a target global word index to the corresponding chapterIndex and intra-chapter wordIndex.
 * 
 * @param {object} book Compiled book object
 * @param {number} targetGlobalIdx Target 0-based global word index
 * @returns {{ chapterIndex: number, wordIndex: number }}
 */
export function resolvePositionFromGlobalWordIndex(book, targetGlobalIdx) {
  if (!book || !book.chapters || !book.chapters.length) {
    return { chapterIndex: 0, wordIndex: 0 };
  }
  const maxIdx = Math.max(0, book.totalWords - 1);
  const clamped = Math.max(0, Math.min(maxIdx, Math.round(Number(targetGlobalIdx) || 0)));

  for (let c = 0; c < book.chapters.length; c++) {
    const ch = book.chapters[c];
    const start = ch.globalStartWordIndex || 0;
    const count = ch.words ? ch.words.length : (ch.wordCount || 1);
    const end = start + count - 1;
    if (clamped >= start && clamped <= end) {
      return { chapterIndex: c, wordIndex: clamped - start };
    }
  }

  const lastChIdx = book.chapters.length - 1;
  const lastCh = book.chapters[lastChIdx];
  const lastChWordsCount = lastCh.words ? lastCh.words.length : 1;
  return {
    chapterIndex: lastChIdx,
    wordIndex: Math.max(0, lastChWordsCount - 1)
  };
}
