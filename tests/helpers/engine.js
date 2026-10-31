import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

// -------------------------------------------------------------
// Reference implementations from Liseuse Rapide RSVP.html (Oracle)
// -------------------------------------------------------------

export function refGetOrpIndex(word) {
  if (typeof word !== "string") return 0;
  const len = word.replace(/[.,;:!?…«»"“”()[\]]/g, "").length;
  if (len <= 1) return 0;
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  if (len <= 13) return 3;
  return 4;
}

export function refSplitWordOrp(word) {
  if (!word) return { prefix: "", pivot: "", suffix: "" };
  const lead = /^[«"“([‘']/.test(word) ? 1 : 0;
  const idx = Math.min(word.length - 1, refGetOrpIndex(word) + lead);
  return {
    prefix: word.slice(0, idx),
    pivot: word.charAt(idx),
    suffix: word.slice(idx + 1)
  };
}

export function refGetDelayForWord(wordObj, wpm = 300) {
  const baseMs = 60000 / wpm;
  let mult = 1.0;
  if (wordObj.isParagraphEnd) mult = 2.2;
  else if (wordObj.isSentenceEnd) mult = 1.9;
  else if (wordObj.isClauseEnd) mult = 1.4;
  else if (wordObj.text && wordObj.text.length > 8) mult = 1.2;
  return Math.round(baseMs * mult);
}

export function refCompileChapter(title, rawParagraphs = [], globalStartOffset = 0) {
  const words = [];
  const sentences = [];
  const paragraphs = [];

  rawParagraphs.forEach((rawPara) => {
    const cleanPara = String(rawPara).replace(/\s+/g, " ").trim();
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
          globalIndex: globalStartOffset + wIdx,
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

  if (words.length === 0) {
    words.push({
      index: 0,
      globalIndex: globalStartOffset,
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
    globalStartWordIndex: globalStartOffset,
    words,
    sentences,
    paragraphs,
    wordCount: words.length
  };
}

export function refPrepareBookObject(bookData) {
  const rawChapters = bookData.rawChapters || [];
  let runningGlobalOffset = 0;

  const chapters = rawChapters.map((ch, idx) => {
    const compiled = refCompileChapter(
      ch.title || `Chapitre ${idx + 1}`,
      ch.paragraphs || [],
      runningGlobalOffset
    );
    runningGlobalOffset += compiled.words.length;
    return compiled;
  });

  return {
    id: bookData.id || `book-${Date.now()}`,
    title: bookData.title || "Sans titre",
    author: bookData.author || "",
    rawChapters,
    chapters,
    totalWords: Math.max(1, runningGlobalOffset),
    savedChapterIndex: bookData.chapterIndex || 0,
    savedWordIndex: bookData.wordIndex || 0
  };
}

export function refGetCurrentGlobalWordIndex(state) {
  if (!state.book || !state.book.chapters || !state.book.chapters.length) return 0;
  const ch = state.book.chapters[state.chapterIndex] || state.book.chapters[0];
  return ch.globalStartWordIndex + state.wordIndex;
}

export function refGetExactGlobalPercentage(state) {
  if (!state.book || state.book.totalWords <= 1) return 0;
  const globalIdx = refGetCurrentGlobalWordIndex(state);
  return Math.min(100, Math.max(0, (globalIdx / (state.book.totalWords - 1)) * 100));
}

export function refResolvePositionFromGlobalWordIndex(book, targetGlobalIdx) {
  if (!book || !book.chapters || !book.chapters.length) {
    return { chapterIndex: 0, wordIndex: 0 };
  }
  const clamped = Math.max(0, Math.min(book.totalWords - 1, Math.round(targetGlobalIdx)));

  for (let c = 0; c < book.chapters.length; c++) {
    const ch = book.chapters[c];
    const start = ch.globalStartWordIndex;
    const end = start + ch.words.length - 1;
    if (clamped >= start && clamped <= end) {
      return { chapterIndex: c, wordIndex: clamped - start };
    }
  }

  const lastChIdx = book.chapters.length - 1;
  return {
    chapterIndex: lastChIdx,
    wordIndex: book.chapters[lastChIdx].words.length - 1
  };
}

export function refResolveRelativePath(baseFilePath, relativeHref) {
  if (!relativeHref) return "";
  const cleanHref = decodeURIComponent(relativeHref.split("#")[0]);
  const baseParts = baseFilePath.split("/");
  baseParts.pop();

  for (const part of cleanHref.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join("/");
}

// -------------------------------------------------------------
// Dynamic Module Loader (Targets Project Modules or Reference)
// -------------------------------------------------------------

export async function loadOrpModule() {
  const targetPath = path.resolve(ROOT_DIR, "client/src/rsvp/orp.js");
  if (fs.existsSync(targetPath)) {
    try {
      const mod = await import(targetPath);
      return {
        getOrpIndex: mod.getOrpIndex || refGetOrpIndex,
        splitWordOrp: mod.splitWordOrp || refSplitWordOrp,
        isImplementation: true
      };
    } catch {
      // Fallback
    }
  }
  return {
    getOrpIndex: refGetOrpIndex,
    splitWordOrp: refSplitWordOrp,
    isImplementation: false
  };
}

export async function loadTimingModule() {
  const targetPath = path.resolve(ROOT_DIR, "client/src/rsvp/timing.js");
  if (fs.existsSync(targetPath)) {
    try {
      const mod = await import(targetPath);
      return {
        getDelayForWord: mod.getDelayForWord || refGetDelayForWord,
        isImplementation: true
      };
    } catch {
      // Fallback
    }
  }
  return {
    getDelayForWord: refGetDelayForWord,
    isImplementation: false
  };
}

export async function loadCompilerModule() {
  const targetPath = path.resolve(ROOT_DIR, "client/src/rsvp/compiler.js");
  if (fs.existsSync(targetPath)) {
    try {
      const mod = await import(targetPath);
      return {
        compileChapter: mod.compileChapter || refCompileChapter,
        prepareBookObject: mod.prepareBookObject || refPrepareBookObject,
        isImplementation: true
      };
    } catch {
      // Fallback
    }
  }
  return {
    compileChapter: refCompileChapter,
    prepareBookObject: refPrepareBookObject,
    isImplementation: false
  };
}

export async function loadIndexerModule() {
  const targetPath = path.resolve(ROOT_DIR, "client/src/rsvp/indexer.js");
  if (fs.existsSync(targetPath)) {
    try {
      const mod = await import(targetPath);
      return {
        getCurrentGlobalWordIndex: mod.getCurrentGlobalWordIndex || refGetCurrentGlobalWordIndex,
        getExactGlobalPercentage: mod.getExactGlobalPercentage || refGetExactGlobalPercentage,
        resolvePositionFromGlobalWordIndex: mod.resolvePositionFromGlobalWordIndex || refResolvePositionFromGlobalWordIndex,
        isImplementation: true
      };
    } catch {
      // Fallback
    }
  }
  return {
    getCurrentGlobalWordIndex: refGetCurrentGlobalWordIndex,
    getExactGlobalPercentage: refGetExactGlobalPercentage,
    resolvePositionFromGlobalWordIndex: refResolvePositionFromGlobalWordIndex,
    isImplementation: false
  };
}

export async function loadServerApp() {
  const targetPath = path.resolve(ROOT_DIR, "server/app.js");
  if (fs.existsSync(targetPath)) {
    try {
      const mod = await import(targetPath);
      return mod.app || mod.default || mod;
    } catch {
      return null;
    }
  }
  return null;
}
