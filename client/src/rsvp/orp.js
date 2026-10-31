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

/**
 * Splits a chunk of 1, 2, or 3 words with psycho-visually aligned ORP.
 * 
 * Positioning principles in multi-word RSVP:
 * - 1 word: ORP of word 1 is the pivot letter.
 * - 2 words: ORP of word 1 is the pivot letter, word 2 follows in suffix (parafoveal span).
 * - 3 words: ORP of word 2 (center word) is the pivot letter, word 1 in prefix, word 3 in suffix.
 * 
 * @param {string[]} words Array of 1 to 3 words
 * @returns {{ prefix: string, pivot: string, suffix: string }}
 */
export function splitChunkOrp(words) {
  if (!Array.isArray(words) || words.length === 0) {
    return { prefix: "", pivot: "", suffix: "" };
  }
  const cleanWords = words.map(w => String(w || "").trim()).filter(Boolean);
  if (cleanWords.length === 0) {
    return { prefix: "", pivot: "", suffix: "" };
  }
  if (cleanWords.length === 1) {
    return splitWordOrp(cleanWords[0]);
  }
  if (cleanWords.length === 2) {
    const s1 = splitWordOrp(cleanWords[0]);
    return {
      prefix: s1.prefix,
      pivot: s1.pivot,
      suffix: s1.suffix + " " + cleanWords[1]
    };
  }
  // 3 words: center word holds the pivot letter
  const s2 = splitWordOrp(cleanWords[1]);
  return {
    prefix: cleanWords[0] + " " + s2.prefix,
    pivot: s2.pivot,
    suffix: s2.suffix + " " + cleanWords[2]
  };
}
