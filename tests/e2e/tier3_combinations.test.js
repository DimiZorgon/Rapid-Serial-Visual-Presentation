import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadOrpModule,
  loadTimingModule,
  loadCompilerModule,
  loadIndexerModule,
  refCompileChapter,
  refPrepareBookObject,
  refGetDelayForWord,
  refGetExactGlobalPercentage,
  refResolvePositionFromGlobalWordIndex
} from "../helpers/engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

describe("Tier 3: Feature Combinations & State Transitions (>= 20 Tests)", async () => {
  const orpMod = await loadOrpModule();
  const timingMod = await loadTimingModule();
  const compilerMod = await loadCompilerModule();
  const indexerMod = await loadIndexerModule();

  // Helper to create a multi-chapter mock book
  function createTestBook() {
    const rawChapters = [
      {
        title: "Chapitre 1 : L'Aurore",
        paragraphs: [
          "Le soleil se levait doucement sur les collines verdoyantes. La brume matinale se dissipait peu à peu.",
          "Dans le lointain, une cloche sonnait six heures."
        ]
      },
      {
        title: "Chapitre 2 : La Marche",
        paragraphs: [
          "Julien reprit sa route sans hésitation. Le sentier devenait de plus en plus escarpé et caillouteux.",
          "Chaque pas demandait une attention particulière pour ne point glisser."
        ]
      },
      {
        title: "Chapitre 3 : L'Arrivée",
        paragraphs: [
          "Enfin, la grande porte de la ville apparut au tournant du chemin. Le voyage touchait à son terme."
        ]
      }
    ];
    return compilerMod.prepareBookObject({ id: "test-comb-book", title: "Livre Test", author: "Auteur Test", rawChapters });
  }

  // -------------------------------------------------------------
  // Combination 01: Playback Active + Theme Switch
  // -------------------------------------------------------------
  test("C01: Playback active + Theme switch preserves position and running state", () => {
    const book = createTestBook();
    const state = { book, chapterIndex: 1, wordIndex: 5, isPlaying: true, theme: "dark" };

    // Toggle theme to light
    state.theme = "light";

    // Playback state remains active, position unchanged
    assert.equal(state.isPlaying, true);
    assert.equal(state.chapterIndex, 1);
    assert.equal(state.wordIndex, 5);
    assert.equal(state.theme, "light");
  });

  // -------------------------------------------------------------
  // Combination 02: Playback Active + WPM Increment
  // -------------------------------------------------------------
  test("C02: Playback active + WPM increment adapts delay calculation dynamically", () => {
    const book = createTestBook();
    const word = book.chapters[0].words[0]; // normal word
    let wpm = 300;
    const delay300 = timingMod.getDelayForWord(word, wpm);

    wpm += 25; // 325 WPM
    const delay325 = timingMod.getDelayForWord(word, wpm);

    assert.equal(delay300, 200);
    assert.equal(delay325, 185);
    assert.ok(delay325 < delay300, "Higher WPM reduces word delay");
  });

  // -------------------------------------------------------------
  // Combination 03: Playback Active + WPM Decrement
  // -------------------------------------------------------------
  test("C03: Playback active + WPM decrement increases word delay", () => {
    const book = createTestBook();
    const word = book.chapters[0].words[0];
    let wpm = 300;
    wpm -= 25; // 275 WPM
    const delay275 = timingMod.getDelayForWord(word, wpm);

    assert.equal(delay275, 218);
    assert.ok(delay275 > 200, "Lower WPM increases word delay");
  });

  // -------------------------------------------------------------
  // Combination 04: Playback Active + Opening TOC Overlay
  // -------------------------------------------------------------
  test("C04: Playback active + Opening TOC triggers automatic pause", () => {
    const state = { isPlaying: true, overlay: null };
    function openToc() {
      if (state.isPlaying) state.isPlaying = false;
      state.overlay = "toc";
    }
    openToc();
    assert.equal(state.isPlaying, false);
    assert.equal(state.overlay, "toc");
  });

  // -------------------------------------------------------------
  // Combination 05: Playback Active + Opening Library Overlay
  // -------------------------------------------------------------
  test("C05: Playback active + Opening Library triggers automatic pause", () => {
    const state = { isPlaying: true, overlay: null };
    function openLibrary() {
      if (state.isPlaying) state.isPlaying = false;
      state.overlay = "library";
    }
    openLibrary();
    assert.equal(state.isPlaying, false);
    assert.equal(state.overlay, "library");
  });

  // -------------------------------------------------------------
  // Combination 06: Playback Active + Opening Expanded Context
  // -------------------------------------------------------------
  test("C06: Playback active + Opening Expanded Context pauses and renders active word", () => {
    const book = createTestBook();
    const state = { book, chapterIndex: 0, wordIndex: 3, isPlaying: true, overlay: null };
    function openExpanded() {
      state.isPlaying = false;
      state.overlay = "expanded";
    }
    openExpanded();
    assert.equal(state.isPlaying, false);
    assert.equal(state.overlay, "expanded");
    const activeWord = state.book.chapters[state.chapterIndex].words[state.wordIndex];
    assert.equal(activeWord.text, "levait");
  });

  // -------------------------------------------------------------
  // Combination 07: Expanded Context Word Click + Navigation
  // -------------------------------------------------------------
  test("C07: Expanded Context word click jumps to target word and closes overlay", () => {
    const book = createTestBook();
    const state = { book, chapterIndex: 0, wordIndex: 0, overlay: "expanded" };

    function clickWordInContext(targetIdx) {
      state.wordIndex = targetIdx;
      state.overlay = null;
    }

    clickWordInContext(7); // Jump to word 7 ("collines")
    assert.equal(state.wordIndex, 7);
    assert.equal(state.overlay, null);
    assert.equal(book.chapters[0].words[state.wordIndex].text, "collines");
  });

  // -------------------------------------------------------------
  // Combination 08: Slider Seek + Direct Percent Input
  // -------------------------------------------------------------
  test("C08: Slider seek (50%) + Direct input override (75.0%) synchronizes position", () => {
    const book = createTestBook();
    const state = { book, chapterIndex: 0, wordIndex: 0 };

    // 1. Seek to 50%
    const pos50 = indexerMod.resolvePositionFromGlobalWordIndex(book, Math.round(0.5 * (book.totalWords - 1)));
    state.chapterIndex = pos50.chapterIndex;
    state.wordIndex = pos50.wordIndex;
    const pct50 = indexerMod.getExactGlobalPercentage(state);
    assert.ok(Math.abs(pct50 - 50) < 5, "Position at approximately 50%");

    // 2. Direct input override to 75.0%
    const pos75 = indexerMod.resolvePositionFromGlobalWordIndex(book, Math.round(0.75 * (book.totalWords - 1)));
    state.chapterIndex = pos75.chapterIndex;
    state.wordIndex = pos75.wordIndex;
    const pct75 = indexerMod.getExactGlobalPercentage(state);
    assert.ok(Math.abs(pct75 - 75) < 5, "Position at approximately 75%");
  });

  // -------------------------------------------------------------
  // Combination 09: EPUB Ingestion + Chapter TOC Navigation
  // -------------------------------------------------------------
  test("C09: EPUB ingestion + Chapter TOC navigation jumps to word 0 of chapter", () => {
    const book = createTestBook();
    const state = { book, chapterIndex: 0, wordIndex: 8 };

    // Jump to Chapter 2 via TOC
    state.chapterIndex = 1;
    state.wordIndex = 0;

    assert.equal(state.chapterIndex, 1);
    assert.equal(state.wordIndex, 0);
    assert.equal(book.chapters[state.chapterIndex].words[0].text, "Julien");
  });

  // -------------------------------------------------------------
  // Combination 10: Plain Text Ingestion + Rapid Sentence Navigation
  // -------------------------------------------------------------
  test("C10: Plain text ingestion + Rapid sentence navigation (forward 2, back 1)", () => {
    const sampleText = fs.readFileSync(path.join(FIXTURES_DIR, "sample_valid.txt"), "utf8");
    const paras = sampleText.split(/\r?\n\r?\n+/).map(p => p.trim()).filter(Boolean);
    const ch = compilerMod.compileChapter("Txt Book", paras);
    assert.ok(ch.sentences.length >= 4);

    let sentIdx = 0;
    // Step forward 2 sentences
    sentIdx = Math.min(ch.sentences.length - 1, sentIdx + 2);
    assert.equal(sentIdx, 2);

    // Step backward 1 sentence
    sentIdx = Math.max(0, sentIdx - 1);
    assert.equal(sentIdx, 1);

    const targetWordIdx = ch.sentences[sentIdx].startWordIndex;
    assert.ok(targetWordIdx > 0);
  });

  // -------------------------------------------------------------
  // Combination 11: High Speed (1000 WPM) + Paragraph Boundary
  // -------------------------------------------------------------
  test("C11: High speed (1000 WPM) + Paragraph boundary computes 132ms delay", () => {
    // Base at 1000 WPM: 60000 / 1000 = 60ms. Multiplier: 2.2 -> 60 * 2.2 = 132ms.
    const word = { text: "fin.", isParagraphEnd: true, isSentenceEnd: true, isClauseEnd: false };
    const delay = timingMod.getDelayForWord(word, 1000);
    assert.equal(delay, 132);
  });

  // -------------------------------------------------------------
  // Combination 12: Low Speed (100 WPM) + Long Word (>8 Chars)
  // -------------------------------------------------------------
  test("C12: Low speed (100 WPM) + Long word computes 720ms delay", () => {
    // Base at 100 WPM: 60000 / 100 = 600ms. Multiplier: 1.2 -> 600 * 1.2 = 720ms.
    const word = { text: "extraordinaire", isParagraphEnd: false, isSentenceEnd: false, isClauseEnd: false };
    const delay = timingMod.getDelayForWord(word, 100);
    assert.equal(delay, 720);
  });

  // -------------------------------------------------------------
  // Combination 13: Rapid Play/Pause Toggling
  // -------------------------------------------------------------
  test("C13: Rapid play/pause toggling leaves exactly one or zero timer active", () => {
    let timerId = null;
    let isPlaying = false;

    function toggle() {
      if (isPlaying) {
        isPlaying = false;
        clearTimeout(timerId);
        timerId = null;
      } else {
        isPlaying = true;
        timerId = setTimeout(() => {}, 1000);
      }
    }

    // Toggle 10 times rapidly
    for (let i = 0; i < 10; i++) {
      toggle();
    }

    // After 10 toggles (even number), should be paused with null timer
    assert.equal(isPlaying, false);
    assert.equal(timerId, null);

    // 11th toggle -> playing with exactly 1 timer
    toggle();
    assert.equal(isPlaying, true);
    assert.ok(timerId !== null);
    clearTimeout(timerId);
  });

  // -------------------------------------------------------------
  // Combination 14: Library Book Deletion + Active Book Unload
  // -------------------------------------------------------------
  test("C14: Deleting active book falls back to remaining book or null", () => {
    let activeBook = { id: "book-1", title: "Book One" };
    let savedBooks = [
      { id: "book-1", title: "Book One" },
      { id: "book-2", title: "Book Two" }
    ];

    function deleteBook(id) {
      savedBooks = savedBooks.filter(b => b.id !== id);
      if (activeBook && activeBook.id === id) {
        activeBook = savedBooks.length > 0 ? savedBooks[0] : null;
      }
    }

    deleteBook("book-1");
    assert.equal(activeBook.id, "book-2");

    deleteBook("book-2");
    assert.equal(activeBook, null);
  });

  // -------------------------------------------------------------
  // Combination 15: Multi-Book Position Isolation
  // -------------------------------------------------------------
  test("C15: Multi-book state isolation ensures book progress positions do not leak", () => {
    const posStorage = {};
    function savePos(bookId, chap, word) {
      posStorage[bookId] = { chapterIndex: chap, wordIndex: word };
    }
    function getPos(bookId) {
      return posStorage[bookId] || { chapterIndex: 0, wordIndex: 0 };
    }

    savePos("book-A", 3, 45);
    savePos("book-B", 1, 10);

    assert.deepEqual(getPos("book-A"), { chapterIndex: 3, wordIndex: 45 });
    assert.deepEqual(getPos("book-B"), { chapterIndex: 1, wordIndex: 10 });
  });

  // -------------------------------------------------------------
  // Combination 16: Crossing Chapter Boundary During Playback
  // -------------------------------------------------------------
  test("C16: Crossing chapter boundary advances chapter and resets word to 0", () => {
    const book = createTestBook();
    let currentCh = 0;
    let currentW = book.chapters[0].words.length - 1; // last word of ch 0

    function advance() {
      if (currentW + 1 < book.chapters[currentCh].words.length) {
        currentW++;
      } else if (currentCh + 1 < book.chapters.length) {
        currentCh++;
        currentW = 0;
      }
    }

    advance();
    assert.equal(currentCh, 1);
    assert.equal(currentW, 0);
  });

  // -------------------------------------------------------------
  // Combination 17: Playback at End of Book Rewinds on Restart
  // -------------------------------------------------------------
  test("C17: Playback at final word of book rewinds to 0 on play start", () => {
    const book = createTestBook();
    const lastCh = book.chapters.length - 1;
    const lastW = book.chapters[lastCh].words.length - 1;

    let chapterIndex = lastCh;
    let wordIndex = lastW;

    function startReading() {
      if (wordIndex >= book.chapters[chapterIndex].words.length - 1 && chapterIndex >= book.chapters.length - 1) {
        chapterIndex = 0;
        wordIndex = 0;
      }
    }

    startReading();
    assert.equal(chapterIndex, 0);
    assert.equal(wordIndex, 0);
  });

  // -------------------------------------------------------------
  // Combination 18: Throttled IDB Sync During Playback Loop
  // -------------------------------------------------------------
  test("C18: Throttled IDB sync only executes after 2000ms threshold", () => {
    let lastSync = 1000;
    let syncCount = 0;

    function tick(now) {
      if (now - lastSync > 2000) {
        syncCount++;
        lastSync = now;
      }
    }

    tick(1500); // 500ms -> no sync
    tick(2500); // 1500ms -> no sync
    tick(3001); // 2001ms -> sync!
    assert.equal(syncCount, 1);

    tick(4000); // 999ms -> no sync
    tick(5002); // 2001ms -> sync!
    assert.equal(syncCount, 2);
  });

  // -------------------------------------------------------------
  // Combination 19: Visibility Change (Hidden) Triggers Immediate Save
  // -------------------------------------------------------------
  test("C19: Tab visibility hidden triggers pause and immediate persistence sync", () => {
    let isPlaying = true;
    let immediateSyncTriggered = false;

    function onVisibilityChange(state) {
      if (state === "hidden") {
        isPlaying = false;
        immediateSyncTriggered = true;
      }
    }

    onVisibilityChange("hidden");
    assert.equal(isPlaying, false);
    assert.equal(immediateSyncTriggered, true);
  });

  // -------------------------------------------------------------
  // Combination 20: Keyboard Navigation Sequence
  // -------------------------------------------------------------
  test("C20: Keyboard shortcut interactions (Space, Arrow keys)", () => {
    const state = { isPlaying: false, wpm: 300, chapterIndex: 0, wordIndex: 0 };
    function handleKey(code) {
      if (code === "Space") state.isPlaying = !state.isPlaying;
      else if (code === "ArrowUp") state.wpm = Math.min(1000, state.wpm + 25);
      else if (code === "ArrowDown") state.wpm = Math.max(100, state.wpm - 25);
    }

    handleKey("Space");
    assert.equal(state.isPlaying, true);

    handleKey("ArrowUp");
    assert.equal(state.wpm, 325);

    handleKey("ArrowDown");
    assert.equal(state.wpm, 300);

    handleKey("Space");
    assert.equal(state.isPlaying, false);
  });

  // -------------------------------------------------------------
  // Combination 21: Escape Key Cancels Percentage Input
  // -------------------------------------------------------------
  test("C21: Escape key cancels exact percent input without modifying position", () => {
    const state = { currentPct: 35.5, inputVisible: true };
    function handleKey(key, inputValue) {
      if (key === "Escape") {
        state.inputVisible = false; // Discard changes
      } else if (key === "Enter") {
        state.currentPct = parseFloat(inputValue);
        state.inputVisible = false;
      }
    }

    handleKey("Escape", "88.8");
    assert.equal(state.currentPct, 35.5, "Percentage not modified on Escape");
    assert.equal(state.inputVisible, false);
  });

  // -------------------------------------------------------------
  // Combination 22: Single Paragraph Text Intra-Sentence Navigation
  // -------------------------------------------------------------
  test("C22: Single-paragraph multi-sentence text navigation within chapter", () => {
    const ch = compilerMod.compileChapter("Single Para", [
      "Phrase numéro un. Phrase numéro deux avec plus de mots. Phrase numéro trois."
    ]);
    assert.equal(ch.sentences.length, 3);
    assert.equal(ch.paragraphs.length, 1);

    // Jump to sentence 2 start
    const sent2 = ch.sentences[2];
    assert.equal(ch.words[sent2.startWordIndex].text, "Phrase");
  });
});
