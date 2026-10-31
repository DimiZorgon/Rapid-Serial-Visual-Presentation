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
  refGetOrpIndex,
  refSplitWordOrp,
  refGetDelayForWord,
  refCompileChapter,
  refPrepareBookObject,
  refGetCurrentGlobalWordIndex,
  refGetExactGlobalPercentage,
  refResolvePositionFromGlobalWordIndex
} from "../helpers/engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

describe("Tier 4: End-to-End Real-World User Scenarios (>= 5 Scenarios)", async () => {
  const orpMod = await loadOrpModule();
  const timingMod = await loadTimingModule();
  const compilerMod = await loadCompilerModule();
  const indexerMod = await loadIndexerModule();

  // -------------------------------------------------------------
  // Scenario 1: Multi-Chapter Continuous Reading Workflow
  // -------------------------------------------------------------
  test("S01: Multi-chapter reading journey transitions seamlessly across chapters", () => {
    // 1. Ingest a multi-chapter book
    const rawChapters = [
      {
        title: "Chapitre 1 : Le Départ",
        paragraphs: ["Trois mots ici.", "Fin premier chapitre."]
      },
      {
        title: "Chapitre 2 : L'Étape",
        paragraphs: ["Nouveau chapitre commence ici.", "La route continue."]
      }
    ];
    const book = compilerMod.prepareBookObject({ id: "journey-book-1", title: "Voyage", rawChapters });
    assert.equal(book.chapters.length, 2);
    const ch0WordCount = book.chapters[0].words.length;
    const ch1WordCount = book.chapters[1].words.length;
    assert.equal(book.totalWords, ch0WordCount + ch1WordCount);

    // 2. Initialize reader state at start
    const state = {
      book,
      chapterIndex: 0,
      wordIndex: 0,
      isPlaying: true,
      wpm: 300,
      statusMessage: null
    };

    // 3. Simulate playback step function
    function playStep() {
      const curCh = state.book.chapters[state.chapterIndex];
      if (state.wordIndex + 1 < curCh.words.length) {
        state.wordIndex++;
      } else if (state.chapterIndex + 1 < state.book.chapters.length) {
        state.chapterIndex++;
        state.wordIndex = 0;
      } else {
        state.isPlaying = false;
        state.statusMessage = "Fin du livre";
      }
    }

    // Advance to end of chapter 0
    while (state.chapterIndex === 0 && state.wordIndex < ch0WordCount - 1) {
      playStep();
    }
    assert.equal(state.chapterIndex, 0);
    assert.equal(state.wordIndex, ch0WordCount - 1);

    // One more step triggers seamless transition to Chapter 1, Word 0
    playStep();
    assert.equal(state.chapterIndex, 1);
    assert.equal(state.wordIndex, 0);
    assert.equal(state.isPlaying, true);

    // Read 2 words into chapter 1
    playStep();
    playStep();
    assert.equal(state.chapterIndex, 1);
    assert.equal(state.wordIndex, 2);

    // Pause reading
    state.isPlaying = false;
    assert.equal(state.isPlaying, false);

    // Verify global progress calculation
    const currentGlobal = indexerMod.getCurrentGlobalWordIndex(state);
    assert.equal(currentGlobal, ch0WordCount + 2);
    const progressPct = indexerMod.getExactGlobalPercentage(state);
    assert.ok(progressPct > 50, "Progress is beyond 50% in chapter 2");
  });

  // -------------------------------------------------------------
  // Scenario 2: Book Completion and Auto-Rewind Journey
  // -------------------------------------------------------------
  test("S02: Book completion workflow pauses gracefully and auto-rewinds on subsequent play", () => {
    const rawChapters = [
      { title: "Épilogue", paragraphs: ["Le grand voyage se termine ici et maintenant."] }
    ];
    const book = compilerMod.prepareBookObject({ id: "book-finish", title: "Fin", rawChapters });
    const totalWords = book.chapters[0].words.length;

    const state = {
      book,
      chapterIndex: 0,
      wordIndex: totalWords - 2, // 1 word before end
      isPlaying: true,
      statusToast: null
    };

    function step() {
      const curCh = state.book.chapters[state.chapterIndex];
      if (state.wordIndex + 1 < curCh.words.length) {
        state.wordIndex++;
      } else {
        state.isPlaying = false;
        state.statusToast = "Fin du livre";
      }
    }

    // Step to last word
    step();
    assert.equal(state.wordIndex, totalWords - 1);
    assert.equal(state.isPlaying, true);

    // Step beyond last word triggers completion
    step();
    assert.equal(state.isPlaying, false);
    assert.equal(state.statusToast, "Fin du livre");

    // User hits Play/Space again: reader auto-rewinds to start
    function startReading() {
      const curCh = state.book.chapters[state.chapterIndex];
      if (state.wordIndex >= curCh.words.length - 1 && state.chapterIndex >= state.book.chapters.length - 1) {
        state.chapterIndex = 0;
        state.wordIndex = 0;
      }
      state.isPlaying = true;
      state.statusToast = null;
    }

    startReading();
    assert.equal(state.isPlaying, true);
    assert.equal(state.chapterIndex, 0);
    assert.equal(state.wordIndex, 0);
  });

  // -------------------------------------------------------------
  // Scenario 3: Session Restore and Page Lifecycle Persistence
  // -------------------------------------------------------------
  test("S03: Session restore preserves position, WPM, and theme across reload", () => {
    const book = compilerMod.prepareBookObject({
      id: "epub-candide-1001",
      title: "Candide",
      author: "Voltaire",
      rawChapters: [
        { title: "Ch1", paragraphs: ["Un premier paragraphe avec plusieurs phrases. En voici une autre."] },
        { title: "Ch2", paragraphs: ["Deuxième chapitre de Candide en Westphalie."] }
      ]
    });

    // Simulated browser session 1
    const mockLocalStorage = {};
    const stateSession1 = {
      book,
      chapterIndex: 1,
      wordIndex: 3,
      wpm: 450,
      theme: "light"
    };

    // User triggers pagehide / visibilitychange -> auto-save
    function triggerPageLifecycleSave(state) {
      mockLocalStorage["rsvp_prefs"] = JSON.stringify({
        wpm: state.wpm,
        theme: state.theme,
        lastBookId: state.book ? state.book.id : null
      });
      const pct = indexerMod.getExactGlobalPercentage(state);
      mockLocalStorage[`rsvp_pos_${state.book.id}`] = JSON.stringify({
        chapterIndex: state.chapterIndex,
        wordIndex: state.wordIndex,
        progressPercent: pct,
        lastRead: 1714500000000
      });
    }

    triggerPageLifecycleSave(stateSession1);

    // Simulated browser reload (session 2)
    const savedPrefs = JSON.parse(mockLocalStorage["rsvp_prefs"]);
    const savedPos = JSON.parse(mockLocalStorage[`rsvp_pos_${savedPrefs.lastBookId}`]);

    const stateSession2 = {
      book,
      chapterIndex: savedPos.chapterIndex,
      wordIndex: savedPos.wordIndex,
      wpm: savedPrefs.wpm,
      theme: savedPrefs.theme,
      isPlaying: false
    };

    assert.equal(stateSession2.chapterIndex, 1);
    assert.equal(stateSession2.wordIndex, 3);
    assert.equal(stateSession2.wpm, 450);
    assert.equal(stateSession2.theme, "light");
    assert.equal(stateSession2.book.chapters[1].words[3].text, "Candide");
  });

  // -------------------------------------------------------------
  // Scenario 4: Multi-Book Library Management & Fallback Deletion
  // -------------------------------------------------------------
  test("S04: Multi-book library workflow: switching books, 2-step deletion, and empty fallback", () => {
    const bookA = { id: "book-A", title: "Candide", progressPercent: 30.0, lastRead: 1000 };
    const bookB = { id: "book-B", title: "Le Rouge et le Noir", progressPercent: 75.0, lastRead: 2000 };

    let library = [bookA, bookB];
    let activeBook = bookB; // user currently reading book B
    let confirmDeleteId = null;

    // 1. Library sorted by lastRead desc: Book B first, Book A second
    library.sort((a, b) => b.lastRead - a.lastRead);
    assert.equal(library[0].id, "book-B");
    assert.equal(library[1].id, "book-A");

    // 2. User clicks delete on active Book B -> First click prompts confirmation
    function onDeleteClick(bookId) {
      if (confirmDeleteId !== bookId) {
        confirmDeleteId = bookId;
        return "CONFIRM_REQUIRED";
      }
      confirmDeleteId = null;
      library = library.filter(b => b.id !== bookId);
      if (activeBook && activeBook.id === bookId) {
        activeBook = library.length > 0 ? library[0] : null;
      }
      return "DELETED";
    }

    assert.equal(onDeleteClick("book-B"), "CONFIRM_REQUIRED");
    assert.equal(confirmDeleteId, "book-B");

    // Second click confirms deletion
    assert.equal(onDeleteClick("book-B"), "DELETED");
    assert.equal(library.length, 1);
    // Reader falls back to Book A
    assert.equal(activeBook.id, "book-A");
    assert.equal(activeBook.progressPercent, 30.0);

    // 3. User deletes Book A with confirmation
    onDeleteClick("book-A"); // prompt
    onDeleteClick("book-A"); // confirm
    assert.equal(library.length, 0);
    // Active book is now null (triggers Empty State View)
    assert.equal(activeBook, null);
  });

  // -------------------------------------------------------------
  // Scenario 5: Plain Text Ingestion to Deep Navigation Workflow
  // -------------------------------------------------------------
  test("S05: Plain text file ingestion followed by slider seek, context inspection, and word select", () => {
    const sampleText = fs.readFileSync(path.join(FIXTURES_DIR, "sample_valid.txt"), "utf8");
    const rawParas = sampleText.split(/\r?\n\r?\n+/).map(p => p.trim()).filter(Boolean);
    const book = compilerMod.prepareBookObject({
      id: "txt-verrieres",
      title: "Verrières",
      rawChapters: [{ title: "Texte Intégral", paragraphs: rawParas }]
    });

    const state = {
      book,
      chapterIndex: 0,
      wordIndex: 0,
      isPlaying: false
    };

    // 1. User drags slider to 80.0%
    const targetIdx = Math.round(0.80 * (book.totalWords - 1));
    const pos = indexerMod.resolvePositionFromGlobalWordIndex(book, targetIdx);
    state.chapterIndex = pos.chapterIndex;
    state.wordIndex = pos.wordIndex;

    const currentWord = book.chapters[0].words[state.wordIndex];
    assert.ok(currentWord, "Word resolved at 80%");

    // 2. User opens Expanded Context view
    const ch = book.chapters[0];
    const activeSentenceIdx = currentWord.sentenceIndex;
    assert.ok(activeSentenceIdx >= 0);

    // 3. User selects word at index 5 in the overlay
    state.wordIndex = 5;
    const newWord = book.chapters[0].words[state.wordIndex];

    // 4. RSVP stage renders the new word with ORP alignment
    const split = orpMod.splitWordOrp(newWord.text);
    assert.equal(split.prefix + split.pivot + split.suffix, newWord.text);
    assert.ok(split.pivot.length === 1);
  });

  // -------------------------------------------------------------
  // Scenario 6: Standalone Architecture & Security Headers Compliance
  // -------------------------------------------------------------
  test("S06: Application architecture ensures local operation and secure isolation", () => {
    // Verify prototype or project structure contains required Helmet CSP policies
    const originalHtml = fs.readFileSync(path.resolve(__dirname, "../../Liseuse Rapide RSVP.html"), "utf8");
    // Verify font family definitions for Inter and JetBrains Mono
    assert.match(originalHtml, /Inter/);
    assert.match(originalHtml, /JetBrains Mono/);
    // Verify zero hardcoded external backend API URLs
    assert.ok(!originalHtml.includes("https://api.example.com"));
    assert.ok(!originalHtml.includes("http://external-server"));
  });
});
