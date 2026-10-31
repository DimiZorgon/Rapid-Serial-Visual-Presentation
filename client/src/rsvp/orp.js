/**
 * Optimal Recognition Point (ORP) calculation and word splitting module.
 */

/**
 * Calculates the Optimal Recognition Point (ORP) character index for a given word.
 * Punctuation is stripped prior to length calculation.
 * 
 * Length brackets:
 * - 0 - 1 char: index 0
 * - 2 - 5 chars: index 1
 * - 6 - 9 chars: index 2
 * - 10 - 13 chars: index 3
 * - 14+ chars: index 4
 * 
 * @param {string} word 
 * @returns {number} 0-based ORP index
 */
export function getOrpIndex(word) {
  if (typeof word !== "string") return 0;
  const clean = word.replace(/[.,;:!?…«»"“”()[\]]/g, "");
  const len = clean.length;
  if (len <= 1) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  if (len <= 13) return 3;
  return 4;
}

/**
 * Splits a word into prefix, pivot (ORP letter), and suffix.
 * Handles leading quotes and bracket offsets (+1).
 * 
 * @param {string} word 
 * @returns {{ prefix: string, pivot: string, suffix: string }}
 */
export function splitWordOrp(word) {
  if (!word || typeof word !== "string") {
    return { prefix: "", pivot: "", suffix: "" };
  }
  const leadOffset = /^[«"“([‘']/.test(word) ? 1 : 0;
  const rawIdx = getOrpIndex(word) + leadOffset;
  const idx = Math.min(Math.max(0, word.length - 1), rawIdx);

  return {
    prefix: word.slice(0, idx),
    pivot: word.charAt(idx),
    suffix: word.slice(idx + 1)
  };
}
