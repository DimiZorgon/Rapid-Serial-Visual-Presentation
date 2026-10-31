/**
 * LocalStorage preferences and position manager.
 */

const PREFS_KEY = "rsvp_prefs";
const POS_PREFIX = "rsvp_pos_";

export function loadPreferences() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { wpm: 300, chunkSize: 1, theme: "dark", lastBookId: null };
}

export function savePreferences(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

export function loadBookPosition(bookId, fallbackChap = 0, fallbackWord = 0) {
  try {
    const raw = localStorage.getItem(`${POS_PREFIX}${bookId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        chapterIndex: typeof parsed.chapterIndex === "number" ? parsed.chapterIndex : fallbackChap,
        wordIndex: typeof parsed.wordIndex === "number" ? parsed.wordIndex : fallbackWord,
        progressPercent: typeof parsed.progressPercent === "number" ? parsed.progressPercent : 0
      };
    }
  } catch {}
  return { chapterIndex: fallbackChap, wordIndex: fallbackWord, progressPercent: 0 };
}

export function saveBookPosition(bookId, pos) {
  if (!bookId) return;
  try {
    localStorage.setItem(`${POS_PREFIX}${bookId}`, JSON.stringify({
      chapterIndex: pos.chapterIndex,
      wordIndex: pos.wordIndex,
      progressPercent: pos.progressPercent,
      lastRead: Date.now()
    }));
  } catch {}
}

export function deleteBookPosition(bookId) {
  if (!bookId) return;
  try {
    localStorage.removeItem(`${POS_PREFIX}${bookId}`);
  } catch {}
}
