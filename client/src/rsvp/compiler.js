/**
 * RSVP Text and Chapter Compilation Module.
 * Tokenizes raw paragraphs into words, clauses, sentences, and paragraphs with metadata.
 */

/**
 * Compiles an array of raw paragraph strings into structured chapter data.
 * 
 * @param {string} title Chapter title
 * @param {string[]} [rawParagraphs=[]] Raw paragraph text strings
 * @param {number} [globalStartOffset=0] Starting global word index offset
 * @returns {{
 *   title: string,
 *   globalStartWordIndex: number,
 *   words: Array<object>,
 *   sentences: Array<object>,
 *   paragraphs: Array<number[]>,
 *   wordCount: number
 * }}
 */
export function compileChapter(title, rawParagraphs = [], globalStartOffset = 0) {
  const words = [];
  const sentences = [];
  const paragraphs = [];
  const offset = Number(globalStartOffset) || 0;

  (rawParagraphs || []).forEach((rawPara) => {
    const cleanPara = String(rawPara || "").replace(/\s+/g, " ").trim();
    if (!cleanPara) return;

    const sentenceMatches = cleanPara.match(/[^.!?…]+(?:[.!?…]+["»”)]*|\s*$)/g) || [cleanPara];
    const paraWordIndices = [];

    sentenceMatches.forEach((rawSent) => {
      const trimmed = rawSent.trim();
      if (!trimmed) return;

      const tokens = trimmed.split(/\s+/).filter(Boolean);
      if (!tokens.length) return;

      const sentIdx = sentences.length;
      const startWordIdx = words.length;

      tokens.forEach((token, idx) => {
        const isLast = (idx === tokens.length - 1);
        const wIdx = words.length;
        words.push({
          index: wIdx,
          globalIndex: offset + wIdx,
          text: token,
          sentenceIndex: sentIdx,
          isClauseEnd: /[,;:—–]$/.test(token),
          isSentenceEnd: isLast || /[.!?…]["»”)]*$/.test(token),
          isParagraphEnd: false
        });
        paraWordIndices.push(wIdx);
      });

      sentences.push({
        index: sentIdx,
        startWordIndex: startWordIdx,
        endWordIndex: words.length - 1
      });
    });

    if (words.length > 0) {
      words[words.length - 1].isParagraphEnd = true;
    }
    if (paraWordIndices.length > 0) {
      paragraphs.push(paraWordIndices);
    }
  });

  // Fallback for empty or whitespace-only chapters
  if (words.length === 0) {
    words.push({
      index: 0,
      globalIndex: offset,
      text: "—",
      sentenceIndex: 0,
      isClauseEnd: false,
      isSentenceEnd: true,
      isParagraphEnd: true
    });
    sentences.push({ index: 0, startWordIndex: 0, endWordIndex: 0 });
    paragraphs.push([0]);
  }

  return {
    title: title || "Chapitre",
    globalStartWordIndex: offset,
    words,
    sentences,
    paragraphs,
    wordCount: words.length
  };
}

/**
 * Prepares a full Book object by compiling all raw chapters with contiguous global offsets.
 * 
 * @param {object} bookData 
 * @returns {object} Full compiled book object
 */
export function prepareBookObject(bookData = {}) {
  const rawChapters = bookData.rawChapters || bookData.chapters || [];
  let runningGlobalOffset = 0;

  const chapters = rawChapters.map((ch, idx) => {
    const paras = ch.paragraphs || ch.rawParagraphs || [];
    const compiled = compileChapter(
      ch.title || `Chapitre ${idx + 1}`,
      paras,
      runningGlobalOffset
    );
    runningGlobalOffset += compiled.words.length;
    return compiled;
  });

  return {
    id: bookData.id || `book-${Date.now()}`,
    title: bookData.title || "Sans titre",
    author: bookData.author || "",
    rawChapters: rawChapters.map(ch => ({
      title: ch.title,
      paragraphs: ch.paragraphs || ch.rawParagraphs || []
    })),
    chapters,
    totalWords: Math.max(1, runningGlobalOffset),
    savedChapterIndex: bookData.chapterIndex || bookData.savedChapterIndex || 0,
    savedWordIndex: bookData.wordIndex || bookData.savedWordIndex || 0
  };
}
