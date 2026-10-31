/**
 * RSVP Timing calculation module.
 * Computes natural reading delays based on WPM, punctuation, and word length.
 */

/**
 * Calculates display duration (ms) for a word token.
 * 
 * Multipliers:
 * - Paragraph end: 2.2x
 * - Sentence end: 1.9x
 * - Clause end: 1.4x
 * - Word length > 8 characters: 1.2x
 * - Standard word: 1.0x
 * 
 * @param {object} wordObj Token object containing flags (isParagraphEnd, isSentenceEnd, isClauseEnd, text)
 * @param {number} [wpm=300] Words per minute
 * @returns {number} Duration in milliseconds rounded to nearest integer
 */
export function getDelayForWord(wordObj, wpm = 300) {
  if (!wordObj) return Math.round(60000 / (wpm || 300));
  const effectiveWpm = Math.max(10, Number(wpm) || 300);
  const baseMs = 60000 / effectiveWpm;
  let mult = 1.0;

  if (wordObj.isParagraphEnd) {
    mult = 2.2;
  } else if (wordObj.isSentenceEnd) {
    mult = 1.9;
  } else if (wordObj.isClauseEnd) {
    mult = 1.4;
  } else if (wordObj.text && wordObj.text.length > 8) {
    mult = 1.2;
  }

  return Math.round(baseMs * mult);
}
