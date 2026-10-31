/**
 * RSVP Reader Main Application Orchestrator.
 * Handles state, playback loop, storage synchronization, event routing, and book ingestion.
 */

import JSZip from "jszip";
import DOMPurify from "dompurify";
import { getOrpIndex, splitWordOrp } from "../rsvp/orp.js";
import { getDelayForWord } from "../rsvp/timing.js";
import { compileChapter, prepareBookObject } from "../rsvp/compiler.js";
import {
  getCurrentGlobalWordIndex,
  getExactGlobalPercentage,
  resolvePositionFromGlobalWordIndex
} from "../rsvp/indexer.js";
import {
  saveBookToIDB,
  updateBookPositionInIDB,
  getAllBooksFromIDB,
  deleteBookFromIDB
} from "../storage/db.js";
import {
  loadPreferences,
  savePreferences,
  loadBookPosition,
  saveBookPosition,
  deleteBookPosition
} from "../storage/prefs.js";
import {
  renderWordDisplay,
  renderPauseSentence,
  updateStageVisibility,
  renderProgressInfo
} from "./stage.js";
import {
  clampWpm,
  updateWpmDisplay,
  updatePlayPauseButton,
  navigatePrevSentence,
  navigateNextSentence,
  parsePercentageInput
} from "./controls.js";
import {
  openExpandedModal,
  closeExpandedModal,
  scrollToActiveWord,
  openTocModal,
  closeTocModal,
  openLibraryModal,
  closeLibraryModal,
  renderLibraryItems
} from "./modals.js";
import { showStatusToast } from "./toast.js";

// Global Reader State
export const state = {
  book: null,
  savedBooks: [],
  chapterIndex: 0,
  wordIndex: 0,
  isPlaying: false,
  wpm: 300,
  theme: "dark",
  timerId: null,
  lastIdbSync: 0,
  confirmDeleteId: null
};

export function getCurrentChapter() {
  if (!state.book || !state.book.chapters || !state.book.chapters.length) {
    return null;
  }
  return state.book.chapters[state.chapterIndex] || state.book.chapters[0];
}

export function renderReader(skipSave = false) {
  const hasBook = Boolean(state.book && state.book.chapters && state.book.chapters.length > 0);
  updateStageVisibility(hasBook);

  const chapter = getCurrentChapter();
  if (!chapter || !chapter.words || !chapter.words.length) return;

  state.wordIndex = Math.max(0, Math.min(chapter.words.length - 1, state.wordIndex));
  const wordObj = chapter.words[state.wordIndex];

  renderWordDisplay(wordObj.text);
  renderProgressInfo(state);
  renderPauseSentence(chapter, wordObj, state.isPlaying, (clickedWordIdx) => {
    state.wordIndex = clickedWordIdx;
    renderReader(true);
    saveProgress(true);
  });

  if (!skipSave) {
    saveProgress(false);
  }
}

export function saveProgress(syncIdb = false) {
  savePreferences({
    wpm: state.wpm,
    theme: state.theme,
    lastBookId: state.book ? state.book.id : null
  });

  if (!state.book) return;
  const pct = getExactGlobalPercentage(state);

  saveBookPosition(state.book.id, {
    chapterIndex: state.chapterIndex,
    wordIndex: state.wordIndex,
    progressPercent: pct
  });

  if (syncIdb) {
    updateBookPositionInIDB(state.book.id, state.chapterIndex, state.wordIndex, pct);
  }
}

export function scheduleNextWord() {
  clearTimeout(state.timerId);
  if (!state.isPlaying) return;

  const chapter = getCurrentChapter();
  if (!chapter || !chapter.words.length) return;

  const currentWord = chapter.words[state.wordIndex];
  const delay = getDelayForWord(currentWord, state.wpm);

  state.timerId = setTimeout(() => {
    if (!state.isPlaying) return;

    if (state.wordIndex + 1 < chapter.words.length) {
      state.wordIndex++;
      const now = Date.now();
      const syncIdb = (now - state.lastIdbSync > 2000);
      renderReader(true);
      saveProgress(syncIdb);
      if (syncIdb) state.lastIdbSync = now;
      scheduleNextWord();
    } else if (state.chapterIndex + 1 < state.book.chapters.length) {
      state.chapterIndex++;
      state.wordIndex = 0;
      renderReader(true);
      saveProgress(true);
      scheduleNextWord();
    } else {
      pauseReading();
      showStatusToast("Fin du livre");
    }
  }, delay);
}

export function startReading() {
  if (!state.book || !state.book.chapters || !state.book.chapters.length) return;
  const chapter = getCurrentChapter();
  if (state.wordIndex >= chapter.words.length - 1 && state.chapterIndex >= state.book.chapters.length - 1) {
    state.chapterIndex = 0;
    state.wordIndex = 0;
  }
  state.isPlaying = true;
  state.lastIdbSync = Date.now();
  updatePlayPauseButton(true);
  renderReader(true);
  scheduleNextWord();
}

export function pauseReading() {
  const wasPlaying = state.isPlaying;
  state.isPlaying = false;
  clearTimeout(state.timerId);
  updatePlayPauseButton(false);
  renderReader(true);
  if (wasPlaying) {
    saveProgress(true);
  }
}

export function togglePlayPause() {
  if (!state.book) return;
  if (state.isPlaying) {
    pauseReading();
  } else {
    startReading();
  }
}

export function seekToExactPercentage(percentValue, syncIdb = true) {
  if (!state.book) return;
  const clampedPct = Math.max(0, Math.min(100, percentValue));
  const targetGlobalWord = Math.round((clampedPct / 100) * Math.max(0, state.book.totalWords - 1));
  const pos = resolvePositionFromGlobalWordIndex(state.book, targetGlobalWord);

  state.chapterIndex = pos.chapterIndex;
  state.wordIndex = pos.wordIndex;
  renderReader(true);
  saveProgress(syncIdb);
}

export function setWpm(val) {
  state.wpm = clampWpm(val);
  updateWpmDisplay(state.wpm);
  saveProgress(false);
}

export function setTheme(theme) {
  state.theme = theme === "light" ? "light" : "dark";
  if (state.theme === "light") {
    document.body.setAttribute("data-theme", "light");
  } else {
    document.body.removeAttribute("data-theme");
  }
  saveProgress(false);
}

export function loadBook(preparedBook) {
  pauseReading();
  state.book = preparedBook;
  const pos = loadBookPosition(
    preparedBook.id,
    preparedBook.savedChapterIndex || 0,
    preparedBook.savedWordIndex || 0
  );

  state.chapterIndex = Math.max(0, Math.min(preparedBook.chapters.length - 1, pos.chapterIndex));
  const maxW = preparedBook.chapters[state.chapterIndex].words.length;
  state.wordIndex = Math.max(0, Math.min(maxW - 1, pos.wordIndex));

  renderReader(true);
  saveProgress(true);
}

export async function refreshSavedBooks() {
  state.savedBooks = await getAllBooksFromIDB();
  renderLibraryItems({
    books: state.savedBooks,
    currentBookId: state.book ? state.book.id : null,
    confirmDeleteId: state.confirmDeleteId,
    getLocalPos: loadBookPosition,
    onOpenBook: (rec) => {
      state.confirmDeleteId = null;
      loadBook(prepareBookObject(rec));
      closeLibraryModal();
    },
    onRequestDelete: (bookId) => {
      state.confirmDeleteId = bookId;
      refreshSavedBooks();
    },
    onConfirmDelete: async (bookId) => {
      state.confirmDeleteId = null;
      await deleteBookFromIDB(bookId);
      deleteBookPosition(bookId);

      const remaining = await getAllBooksFromIDB();
      state.savedBooks = remaining;
      refreshSavedBooks();

      if (state.book && state.book.id === bookId) {
        if (remaining.length > 0) {
          loadBook(prepareBookObject(remaining[0]));
        } else {
          state.book = null;
          updateStageVisibility(false);
        }
      }
    }
  });
  return state.savedBooks;
}

/* ================= EPUB & TEXT PARSER ================= */

function resolveRelativePath(baseFilePath, relativeHref) {
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

function findZipEntry(zip, targetPath) {
  if (zip.files[targetPath]) return zip.files[targetPath];
  const lower = targetPath.toLowerCase();
  for (const key of Object.keys(zip.files)) {
    if (key.toLowerCase() === lower) return zip.files[key];
  }
  return null;
}

export async function parseEpubFile(file) {
  showStatusToast("Importation du livre...");
  const zip = await JSZip.loadAsync(file);

  const containerEntry = findZipEntry(zip, "META-INF/container.xml");
  if (!containerEntry) throw new Error("Fichier EPUB invalide (container.xml manquant)");

  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(await containerEntry.async("string"), "application/xml");
  const rootfileEl = containerDoc.querySelector("rootfile");
  if (!rootfileEl) throw new Error("Structure OPF introuvable");

  const opfPath = rootfileEl.getAttribute("full-path");
  const opfEntry = findZipEntry(zip, opfPath);
  if (!opfEntry) throw new Error("Fichier OPF introuvable");

  const opfDoc = parser.parseFromString(await opfEntry.async("string"), "application/xml");
  const titleEl = opfDoc.querySelector("metadata > title, dc\\:title, title");
  const creatorEl = opfDoc.querySelector("metadata > creator, dc\\:creator, creator");
  const bookTitle = titleEl ? titleEl.textContent.trim() : file.name.replace(/\.epub$/i, "");
  const bookAuthor = creatorEl ? creatorEl.textContent.trim() : "";

  const manifestMap = {};
  let tocNcxId = null;
  let navItemHref = null;

  opfDoc.querySelectorAll("manifest > item").forEach((item) => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    const mediaType = item.getAttribute("media-type") || "";
    const properties = item.getAttribute("properties") || "";
    if (id && href) manifestMap[id] = { href, mediaType, properties };
    if (properties.includes("nav")) navItemHref = href;
    if (mediaType === "application/x-dtbncx+xml") tocNcxId = id;
  });

  const hrefToTitleMap = {};
  if (navItemHref) {
    const navPath = resolveRelativePath(opfPath, navItemHref);
    const navEntry = findZipEntry(zip, navPath);
    if (navEntry) {
      const navDoc = parser.parseFromString(await navEntry.async("string"), "text/html");
      navDoc.querySelectorAll("nav a[href]").forEach((a) => {
        const res = resolveRelativePath(navPath, a.getAttribute("href"));
        const lbl = a.textContent.replace(/\s+/g, " ").trim();
        if (res && lbl && !hrefToTitleMap[res]) hrefToTitleMap[res] = lbl;
      });
    }
  }

  if (tocNcxId && manifestMap[tocNcxId]) {
    const ncxPath = resolveRelativePath(opfPath, manifestMap[tocNcxId].href);
    const ncxEntry = findZipEntry(zip, ncxPath);
    if (ncxEntry) {
      const ncxDoc = parser.parseFromString(await ncxEntry.async("string"), "application/xml");
      ncxDoc.querySelectorAll("navPoint").forEach((np) => {
        const lblEl = np.querySelector("navLabel > text");
        const cntEl = np.querySelector("content");
        if (lblEl && cntEl) {
          const res = resolveRelativePath(ncxPath, cntEl.getAttribute("src"));
          const lbl = lblEl.textContent.replace(/\s+/g, " ").trim();
          if (res && lbl && !hrefToTitleMap[res]) hrefToTitleMap[res] = lbl;
        }
      });
    }
  }

  const spineItems = Array.from(opfDoc.querySelectorAll("spine > itemref"));
  const rawChapters = [];

  for (let i = 0; i < spineItems.length; i++) {
    const idref = spineItems[i].getAttribute("idref");
    const item = manifestMap[idref];
    if (!item) continue;

    const fullPath = resolveRelativePath(opfPath, item.href);
    const entry = findZipEntry(zip, fullPath);
    if (!entry) continue;

    const htmlDoc = parser.parseFromString(await entry.async("string"), "text/html");
    htmlDoc.querySelectorAll("script, style, svg, nav, noscript").forEach((el) => el.remove());

    let chapterTitle = hrefToTitleMap[fullPath];
    if (!chapterTitle) {
      const hEl = htmlDoc.querySelector("h1, h2, h3, title");
      if (hEl && hEl.textContent.trim().length > 1) {
        chapterTitle = hEl.textContent.replace(/\s+/g, " ").trim();
      }
    }

    const blocks = htmlDoc.querySelectorAll("h1, h2, h3, h4, p, blockquote, li");
    const paragraphs = [];

    if (blocks.length > 0) {
      blocks.forEach((el) => {
        const txt = el.textContent.replace(/\s+/g, " ").trim();
        if (txt) paragraphs.push(txt);
      });
    } else if (htmlDoc.body) {
      const txt = htmlDoc.body.textContent.replace(/\s+/g, " ").trim();
      if (txt) paragraphs.push(txt);
    }

    const wordCount = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
    if (wordCount >= 3) {
      rawChapters.push({
        title: chapterTitle || `Chapitre ${rawChapters.length + 1}`,
        paragraphs
      });
    }
  }

  if (!rawChapters.length) {
    throw new Error("Aucun texte lisible trouvé dans cet EPUB");
  }

  const slug = bookTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const bookId = `epub-${slug}-${file.size}`;

  return prepareBookObject({
    id: bookId,
    title: bookTitle,
    author: bookAuthor,
    rawChapters
  });
}

export async function parseTextFile(file) {
  showStatusToast("Importation du texte...");
  const rawText = await file.text();
  const clean = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "").trim();

  if (!clean) {
    throw new Error("Fichier texte vide");
  }

  const rawParas = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const title = file.name.replace(/\.txt$/i, "");
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const bookId = `txt-${slug}-${file.size}`;

  return prepareBookObject({
    id: bookId,
    title,
    author: "",
    rawChapters: [{
      title,
      paragraphs: rawParas
    }]
  });
}

/* ================= EVENT INITIALIZATION ================= */

export function initAppEvents() {
  // Play / Pause
  const stageEl = document.getElementById("rsvpStage");
  const playPauseBtn = document.getElementById("btnPlayPause");
  if (stageEl) stageEl.addEventListener("click", togglePlayPause);
  if (playPauseBtn) playPauseBtn.addEventListener("click", togglePlayPause);

  // Sentence Navigation
  const prevBtn = document.getElementById("btnPrevSentence");
  const nextBtn = document.getElementById("btnNextSentence");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      pauseReading();
      navigatePrevSentence(state);
      renderReader(true);
      saveProgress(true);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      pauseReading();
      navigateNextSentence(state);
      renderReader(true);
      saveProgress(true);
    });
  }

  // WPM adjustments
  const wpmMinusBtn = document.getElementById("btnWpmMinus");
  const wpmPlusBtn = document.getElementById("btnWpmPlus");
  if (wpmMinusBtn) wpmMinusBtn.addEventListener("click", () => setWpm(state.wpm - 25));
  if (wpmPlusBtn) wpmPlusBtn.addEventListener("click", () => setWpm(state.wpm + 25));

  // Theme toggle
  const themeBtn = document.getElementById("btnToggleTheme");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      setTheme(state.theme === "dark" ? "light" : "dark");
    });
  }

  // Progress slider
  const slider = document.getElementById("globalProgressSlider");
  if (slider) {
    slider.addEventListener("input", (e) => {
      pauseReading();
      const pct = parseInt(e.target.value, 10) / 10;
      seekToExactPercentage(pct, false);
    });
    slider.addEventListener("change", () => {
      saveProgress(true);
    });
  }

  // Exact percent input
  const percentDisplayBtn = document.getElementById("btnPercentDisplay");
  const percentInputContainer = document.getElementById("percentInputContainer");
  const percentExactInput = document.getElementById("percentExactInput");

  function openPercentInput() {
    if (!state.book) return;
    pauseReading();
    if (percentDisplayBtn) percentDisplayBtn.classList.add("hidden");
    if (percentInputContainer) {
      percentInputContainer.classList.remove("hidden");
      percentInputContainer.classList.add("flex");
    }
    if (percentExactInput) {
      percentExactInput.value = getExactGlobalPercentage(state).toFixed(1);
      percentExactInput.focus();
      percentExactInput.select();
    }
  }

  function commitPercentInput(applyChange = true) {
    if (!percentInputContainer || percentInputContainer.classList.contains("hidden")) return;
    if (applyChange && percentExactInput) {
      const parsed = parsePercentageInput(percentExactInput.value);
      if (parsed !== null) {
        seekToExactPercentage(parsed, true);
      }
    }
    percentInputContainer.classList.add("hidden");
    percentInputContainer.classList.remove("flex");
    if (percentDisplayBtn) percentDisplayBtn.classList.remove("hidden");
  }

  if (percentDisplayBtn) percentDisplayBtn.addEventListener("click", openPercentInput);
  if (percentExactInput) {
    percentExactInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitPercentInput(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        commitPercentInput(false);
      }
    });
    percentExactInput.addEventListener("blur", () => commitPercentInput(true));
  }

  // Expanded Context
  const expandBtn = document.getElementById("btnExpandContext");
  const closeExpandedBtn = document.getElementById("btnCloseExpanded");
  const centerWordBtn = document.getElementById("btnCenterActiveWord");

  if (expandBtn) {
    expandBtn.addEventListener("click", () => {
      pauseReading();
      openExpandedModal(state, (clickedWIdx) => {
        state.wordIndex = clickedWIdx;
        renderReader(true);
        saveProgress(true);
      });
    });
  }
  if (closeExpandedBtn) closeExpandedBtn.addEventListener("click", closeExpandedModal);
  if (centerWordBtn) centerWordBtn.addEventListener("click", scrollToActiveWord);

  // TOC
  const openTocBtn = document.getElementById("btnOpenToc");
  const footerChapterBtn = document.getElementById("btnFooterChapter");
  const closeTocBtn = document.getElementById("btnCloseToc");

  function handleOpenToc() {
    pauseReading();
    openTocModal(state, (chIdx) => {
      state.chapterIndex = chIdx;
      state.wordIndex = 0;
      renderReader(true);
      saveProgress(true);
    });
  }

  if (openTocBtn) openTocBtn.addEventListener("click", handleOpenToc);
  if (footerChapterBtn) footerChapterBtn.addEventListener("click", handleOpenToc);
  if (closeTocBtn) closeTocBtn.addEventListener("click", closeTocModal);

  // Library
  const openLibraryBtn = document.getElementById("btnOpenLibrary");
  const closeLibraryBtn = document.getElementById("btnCloseLibrary");

  if (openLibraryBtn) {
    openLibraryBtn.addEventListener("click", () => {
      pauseReading();
      state.confirmDeleteId = null;
      refreshSavedBooks();
      openLibraryModal();
    });
  }
  if (closeLibraryBtn) closeLibraryBtn.addEventListener("click", closeLibraryModal);

  // File Upload (EPUB and Text)
  const fileInputs = document.querySelectorAll("#epubFileInput");
  fileInputs.forEach((input) => {
    input.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        pauseReading();
        let parsedBook;
        if (/\.epub$/i.test(file.name) || file.type.includes("epub")) {
          parsedBook = await parseEpubFile(file);
        } else {
          parsedBook = await parseTextFile(file);
        }

        const existingPos = loadBookPosition(parsedBook.id, 0, 0);

        await saveBookToIDB({
          id: parsedBook.id,
          title: parsedBook.title,
          author: parsedBook.author,
          rawChapters: parsedBook.rawChapters,
          totalWords: parsedBook.totalWords,
          chapterIndex: existingPos.chapterIndex,
          wordIndex: existingPos.wordIndex,
          progressPercent: existingPos.progressPercent,
          lastRead: Date.now()
        });

        await refreshSavedBooks();
        loadBook(parsedBook);
        closeLibraryModal();
        showStatusToast("Livre enregistré");
      } catch (err) {
        showStatusToast(err.message || "Erreur lors de l'importation");
      } finally {
        e.target.value = "";
      }
    });
  });

  // Lifecycle Auto-Save
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      pauseReading();
      saveProgress(true);
    }
  });
  window.addEventListener("pagehide", () => saveProgress(true));
  window.addEventListener("beforeunload", () => saveProgress(true));

  // Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.target && e.target.tagName === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      togglePlayPause();
    } else if (e.code === "ArrowLeft") {
      e.preventDefault();
      pauseReading();
      navigatePrevSentence(state);
      renderReader(true);
      saveProgress(true);
    } else if (e.code === "ArrowRight") {
      e.preventDefault();
      pauseReading();
      navigateNextSentence(state);
      renderReader(true);
      saveProgress(true);
    } else if (e.code === "ArrowUp") {
      e.preventDefault();
      setWpm(state.wpm + 25);
    } else if (e.code === "ArrowDown") {
      e.preventDefault();
      setWpm(state.wpm - 25);
    } else if (e.code === "Escape") {
      closeExpandedModal();
      closeTocModal();
      closeLibraryModal();
    }
  });
}

export async function bootstrapApp() {
  initAppEvents();

  // Restore preferences
  let lastBookId = null;
  const prefs = loadPreferences();
  if (prefs) {
    if (prefs.wpm) setWpm(prefs.wpm);
    if (prefs.theme) setTheme(prefs.theme);
    lastBookId = prefs.lastBookId;
  }

  // Refresh saved books from IndexedDB
  const savedBooks = await refreshSavedBooks();

  if (savedBooks.length > 0) {
    const target = savedBooks.find((b) => b.id === lastBookId) || savedBooks[0];
    loadBook(prepareBookObject(target));
  } else {
    updateStageVisibility(false);
  }
}

// Auto-run bootstrap when loaded in browser
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    bootstrapApp().catch(console.error);
  });
}
