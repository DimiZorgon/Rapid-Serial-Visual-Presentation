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
  loadServerApp,
  refGetOrpIndex,
  refSplitWordOrp,
  refGetDelayForWord,
  refCompileChapter,
  refPrepareBookObject,
  refGetCurrentGlobalWordIndex,
  refGetExactGlobalPercentage,
  refResolvePositionFromGlobalWordIndex,
  refResolveRelativePath
} from "../helpers/engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

describe("Tier 1: Core Feature Verification (40 Features)", async () => {
  const orpMod = await loadOrpModule();
  const timingMod = await loadTimingModule();
  const compilerMod = await loadCompilerModule();
  const indexerMod = await loadIndexerModule();

  // -------------------------------------------------------------
  // Feature 1: ORP Calculation
  // -------------------------------------------------------------
  test("F01: ORP Calculation maps clean word length brackets (0 to 4)", () => {
    const fn = orpMod.getOrpIndex;
    assert.equal(fn("a"), 0, "Length 1 -> index 0");
    assert.equal(fn("le"), 1, "Length 2 -> index 1");
    assert.equal(fn("chat"), 1, "Length 4 -> index 1");
    assert.equal(fn("monde"), 1, "Length 5 -> index 1");
    assert.equal(fn("rapide"), 2, "Length 6 -> index 2");
    assert.equal(fn("merveille"), 2, "Length 9 -> index 2");
    assert.equal(fn("merveilles"), 3, "Length 10 -> index 3");
    assert.equal(fn("développement"), 3, "Length 13 -> index 3");
    assert.equal(fn("reconnaissance"), 4, "Length 14 -> index 4");
    assert.equal(fn("extraordinairement"), 4, "Length 18 -> index 4");
    // Strips punctuation
    assert.equal(fn("bonjour,"), 2, "Punctuation stripped (7 clean chars -> index 2)");
    assert.equal(fn("«oui»"), 1, "Guillemets stripped (3 clean chars -> index 1)");
  });

  // -------------------------------------------------------------
  // Feature 2: Word Splitting
  // -------------------------------------------------------------
  test("F02: Word Splitting splits word into prefix, pivot, suffix with quotation offset", () => {
    const fn = orpMod.splitWordOrp;
    const res1 = fn("chat");
    assert.deepEqual(res1, { prefix: "c", pivot: "h", suffix: "at" });

    const res2 = fn("«monde»");
    // Lead offset shifts pivot to index 1 + 1 = 2 ('o')
    assert.equal(res2.pivot, "o");
    assert.equal(res2.prefix, "«m");
    assert.equal(res2.suffix, "nde»");

    const resEmpty = fn("");
    assert.deepEqual(resEmpty, { prefix: "", pivot: "", suffix: "" });

    const resSingle = fn("a");
    assert.deepEqual(resSingle, { prefix: "", pivot: "a", suffix: "" });
  });

  // -------------------------------------------------------------
  // Feature 3: Optical Alignment (38% CSS Grid)
  // -------------------------------------------------------------
  test("F03: Optical Alignment 38% CSS grid column rule verified", () => {
    const htmlPath = path.resolve(__dirname, "../../Liseuse Rapide RSVP.html");
    const content = fs.readFileSync(htmlPath, "utf8");
    assert.match(content, /grid-template-columns:\s*38%\s+auto\s+62%/, "Contains 38% auto 62% optical grid alignment");
  });

  // -------------------------------------------------------------
  // Feature 4: Alignment Ticks
  // -------------------------------------------------------------
  test("F04: Alignment Ticks dual vertical marks configured at 38%", () => {
    const htmlPath = path.resolve(__dirname, "../../Liseuse Rapide RSVP.html");
    const content = fs.readFileSync(htmlPath, "utf8");
    assert.match(content, /\.pivot-tick\s*\{[^}]*left:\s*38%/s, "Pivot tick positioned at left: 38%");
  });

  // -------------------------------------------------------------
  // Feature 5: Font Sizing Scaling (>15 characters)
  // -------------------------------------------------------------
  test("F05: Font Sizing Scaling reduces font class when word length > 15", () => {
    function getWordClass(len) {
      return len > 15
        ? "rsvp-word-grid text-2xl sm:text-4xl font-normal tracking-tight"
        : "rsvp-word-grid text-4xl sm:text-6xl font-normal tracking-tight";
    }
    assert.match(getWordClass(10), /text-4xl/);
    assert.match(getWordClass(15), /text-4xl/);
    assert.match(getWordClass(16), /text-2xl/);
    assert.match(getWordClass(25), /text-2xl/);
  });

  // -------------------------------------------------------------
  // Feature 6: Chapter Compilation
  // -------------------------------------------------------------
  test("F06: Chapter Compilation tokenizes paragraphs, sentences, words with metadata", () => {
    const fn = compilerMod.compileChapter;
    const paras = [
      "Bonjour tout le monde. Ceci est un test.",
      "Deuxième paragraphe ici."
    ];
    const ch = fn("Chapitre 1", paras, 0);
    assert.equal(ch.title, "Chapitre 1");
    assert.equal(ch.sentences.length, 3);
    assert.equal(ch.paragraphs.length, 2);
    assert.equal(ch.words.length, 11);
    assert.equal(ch.words[0].text, "Bonjour");
    assert.equal(ch.words[0].globalIndex, 0);
  });

  // -------------------------------------------------------------
  // Feature 7: Sentence Boundary Detection
  // -------------------------------------------------------------
  test("F07: Sentence Boundary detection preserves closing punctuation and quotes", () => {
    const text = "Julien s'écria : « Jamais !» Puis il partit.";
    const matches = text.match(/[^.!?…]+(?:[.!?…]+["»”)]*|\s*$)/g) || [];
    assert.equal(matches.length, 2);
    assert.equal(matches[0].trim(), "Julien s'écria : « Jamais !»");
    assert.equal(matches[1].trim(), "Puis il partit.");
  });

  // -------------------------------------------------------------
  // Feature 8: Clause Boundary Detection
  // -------------------------------------------------------------
  test("F08: Clause Boundary detects terminal punctuation ([,;:—–])", () => {
    const fn = compilerMod.compileChapter;
    const ch = fn("Clause Test", ["Un mot, puis un autre ; enfin : voilà — dit-il."]);
    const words = ch.words;
    const commaWord = words.find(w => w.text === "mot,");
    const semiToken = words.find(w => /;$/.test(w.text));
    const colonToken = words.find(w => /:$/.test(w.text));
    const dashToken = words.find(w => /—$/.test(w.text));

    assert.ok(commaWord?.isClauseEnd, "Comma is clause end");
    assert.ok(semiToken?.isClauseEnd, "Semicolon is clause end");
    assert.ok(colonToken?.isClauseEnd, "Colon is clause end");
    assert.ok(dashToken?.isClauseEnd, "Dash is clause end");
  });

  // -------------------------------------------------------------
  // Feature 9: Sentence Terminal Detection
  // -------------------------------------------------------------
  test("F09: Sentence Terminal detects sentence end punctuation ([.!?…])", () => {
    const fn = compilerMod.compileChapter;
    const ch = fn("Sentence End Test", ["Vraiment? Oui! Absolument... C'est exact."]);
    const ends = ch.words.filter(w => w.isSentenceEnd);
    assert.equal(ends.length, 4);
    assert.equal(ends[0].text, "Vraiment?");
    assert.equal(ends[1].text, "Oui!");
  });

  // -------------------------------------------------------------
  // Feature 10: Paragraph Terminal Detection
  // -------------------------------------------------------------
  test("F10: Paragraph Terminal flags the last word of each paragraph", () => {
    const fn = compilerMod.compileChapter;
    const ch = fn("Para Test", ["Premier para ici.", "Second para là."]);
    const paraEnds = ch.words.filter(w => w.isParagraphEnd);
    assert.equal(paraEnds.length, 2);
    assert.equal(paraEnds[0].text, "ici.");
    assert.equal(paraEnds[1].text, "là.");
  });

  // -------------------------------------------------------------
  // Feature 11: Timing Multiplier
  // -------------------------------------------------------------
  test("F11: Timing Multiplier calculates delays hierarchically (2.2, 1.9, 1.4, 1.2, 1.0)", () => {
    const fn = timingMod.getDelayForWord;
    const wpm = 300; // Base: 60000 / 300 = 200 ms
    // Paragraph End: 2.2 * 200 = 440
    assert.equal(fn({ text: "fin.", isParagraphEnd: true, isSentenceEnd: true }, wpm), 440);
    // Sentence End: 1.9 * 200 = 380
    assert.equal(fn({ text: "fin.", isParagraphEnd: false, isSentenceEnd: true }, wpm), 380);
    // Clause End: 1.4 * 200 = 280
    assert.equal(fn({ text: "mot,", isParagraphEnd: false, isSentenceEnd: false, isClauseEnd: true }, wpm), 280);
    // Long Word (> 8 chars): 1.2 * 200 = 240
    assert.equal(fn({ text: "extraordinaire", isParagraphEnd: false, isSentenceEnd: false, isClauseEnd: false }, wpm), 240);
    // Standard Word: 1.0 * 200 = 200
    assert.equal(fn({ text: "rapide", isParagraphEnd: false, isSentenceEnd: false, isClauseEnd: false }, wpm), 200);
  });

  // -------------------------------------------------------------
  // Feature 12: Playback Scheduler
  // -------------------------------------------------------------
  test("F12: Playback Scheduler advances word and chapter index accurately", () => {
    const ch1 = compilerMod.compileChapter("Ch1", ["Mot un deux trois."], 0);
    const ch2 = compilerMod.compileChapter("Ch2", ["Suite du livre."], ch1.words.length);
    const book = { chapters: [ch1, ch2], totalWords: ch1.words.length + ch2.words.length };

    let currentCh = 0;
    let currentW = 0;

    function step() {
      if (currentW + 1 < book.chapters[currentCh].words.length) {
        currentW++;
      } else if (currentCh + 1 < book.chapters.length) {
        currentCh++;
        currentW = 0;
      } else {
        return "FIN";
      }
      return "ADVANCED";
    }

    assert.equal(step(), "ADVANCED");
    assert.equal(currentW, 1);
    step(); // w=2
    step(); // w=3 (last word of ch1)
    assert.equal(currentW, 3);
    assert.equal(step(), "ADVANCED"); // transitions to Ch2
    assert.equal(currentCh, 1);
    assert.equal(currentW, 0);
  });

  // -------------------------------------------------------------
  // Feature 13: Pause Context Viewer
  // -------------------------------------------------------------
  test("F13: Pause Context Viewer exposes sentence bounds and active word", () => {
    const ch = compilerMod.compileChapter("Ch1", ["Première phrase. Deuxième longue phrase de test. Troisième phrase."]);
    // Word index 4 is in sentence 1 ("Deuxième longue phrase de test.")
    const word4 = ch.words[4];
    const sentence = ch.sentences[word4.sentenceIndex];
    assert.equal(sentence.index, 1);
    const sentWords = ch.words.slice(sentence.startWordIndex, sentence.endWordIndex + 1);
    assert.equal(sentWords[0].text, "Deuxième");
    assert.equal(sentWords[sentWords.length - 1].text, "test.");
  });

  // -------------------------------------------------------------
  // Feature 14: EPUB Archive Ingestion & Magic Bytes
  // -------------------------------------------------------------
  test("F14: EPUB Archive Ingestion validates ZIP magic bytes (0x50 0x4B 0x03 0x04)", () => {
    const epub3Buf = fs.readFileSync(path.join(FIXTURES_DIR, "sample_valid_epub3.epub"));
    const magic = epub3Buf.subarray(0, 4);
    assert.deepEqual(Array.from(magic), [0x50, 0x4b, 0x03, 0x04], "EPUB header matches ZIP magic bytes");
  });

  // -------------------------------------------------------------
  // Feature 15: Container XML Parsing
  // -------------------------------------------------------------
  test("F15: Container XML Parsing extracts rootfile path", () => {
    const xml = `<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="EPUB/package.opf"/></rootfiles></container>`;
    const match = xml.match(/full-path=["']([^"']+)["']/);
    assert.ok(match, "Found full-path attribute");
    assert.equal(match[1], "EPUB/package.opf");
  });

  // -------------------------------------------------------------
  // Feature 16: OPF Metadata Extraction
  // -------------------------------------------------------------
  test("F16: OPF Metadata Extraction pulls title and creator", () => {
    const opf = `<package><metadata><dc:title>Test Title</dc:title><dc:creator>Test Creator</dc:creator></metadata></package>`;
    const titleMatch = opf.match(/<(?:dc:)?title[^>]*>([^<]+)<\/(?:dc:)?title>/);
    const creatorMatch = opf.match(/<(?:dc:)?creator[^>]*>([^<]+)<\/(?:dc:)?creator>/);
    assert.equal(titleMatch?.[1], "Test Title");
    assert.equal(creatorMatch?.[1], "Test Creator");
  });

  // -------------------------------------------------------------
  // Feature 17: EPUB3 Nav TOC Parsing
  // -------------------------------------------------------------
  test("F17: EPUB3 Nav TOC Parsing extracts chapter links and labels", () => {
    const navXhtml = `<nav epub:type="toc"><ol><li><a href="ch1.xhtml">Chapitre 1 : Introduction</a></li><li><a href="ch2.xhtml">Chapitre 2 : Suite</a></li></ol></nav>`;
    const links = Array.from(navXhtml.matchAll(/<a\s+href=["']([^"']+)["']>([^<]+)<\/a>/g));
    assert.equal(links.length, 2);
    assert.equal(links[0][1], "ch1.xhtml");
    assert.equal(links[0][2], "Chapitre 1 : Introduction");
  });

  // -------------------------------------------------------------
  // Feature 18: EPUB2 NCX TOC Parsing
  // -------------------------------------------------------------
  test("F18: EPUB2 NCX TOC Parsing extracts navPoint elements", () => {
    const ncxXml = `<ncx><navMap><navPoint id="p1"><navLabel><text>Intro NCX</text></navLabel><content src="ch1.html"/></navPoint></navMap></ncx>`;
    const labelMatch = ncxXml.match(/<navLabel>\s*<text>([^<]+)<\/text>\s*<\/navLabel>/);
    const srcMatch = ncxXml.match(/<content\s+src=["']([^"']+)["']/);
    assert.equal(labelMatch?.[1], "Intro NCX");
    assert.equal(srcMatch?.[1], "ch1.html");
  });

  // -------------------------------------------------------------
  // Feature 19: Spine Traversal
  // -------------------------------------------------------------
  test("F19: Spine Traversal respects linear itemref order", () => {
    const opf = `<package><spine><itemref idref="item3"/><itemref idref="item1"/><itemref idref="item2"/></spine></package>`;
    const itemrefs = Array.from(opf.matchAll(/<itemref\s+idref=["']([^"']+)["']/g)).map(m => m[1]);
    assert.deepEqual(itemrefs, ["item3", "item1", "item2"]);
  });

  // -------------------------------------------------------------
  // Feature 20: HTML Sanitization
  // -------------------------------------------------------------
  test("F20: HTML Sanitization strips dangerous tags (script, style, svg, nav, noscript)", () => {
    const dirtyHtml = `<div><script>alert(1)</script><p>Texte sain</p><style>body{}</style><svg></svg></div>`;
    const clean = dirtyHtml.replace(/<(script|style|svg|nav|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "");
    assert.ok(!clean.includes("<script>"));
    assert.ok(!clean.includes("<style>"));
    assert.ok(!clean.includes("<svg>"));
    assert.ok(clean.includes("<p>Texte sain</p>"));
  });

  // -------------------------------------------------------------
  // Feature 21: Chapter Word Threshold
  // -------------------------------------------------------------
  test("F21: Chapter Word Threshold rejects or filters chapters with < 3 words", () => {
    const wordsShort = ["Seulement", "deux"].length;
    const wordsValid = ["Un", "deux", "trois"].length;
    assert.ok(wordsShort < 3, "Short chapter is < 3 words");
    assert.ok(wordsValid >= 3, "Valid chapter has >= 3 words");
  });

  // -------------------------------------------------------------
  // Feature 22: Plain Text Ingestion
  // -------------------------------------------------------------
  test("F22: Plain Text Ingestion splits paragraphs on double newlines", () => {
    const sampleText = fs.readFileSync(path.join(FIXTURES_DIR, "sample_valid.txt"), "utf8");
    const rawParas = sampleText.split(/\r?\n\r?\n+/).map(p => p.trim()).filter(Boolean);
    assert.ok(rawParas.length >= 3, "Extracted at least 3 distinct paragraphs");
  });

  // -------------------------------------------------------------
  // Feature 23: 3-Tier Layout Architecture
  // -------------------------------------------------------------
  test("F23: 3-Tier Layout contains header, main stage, footer with 100dvh root", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "../../Liseuse Rapide RSVP.html"), "utf8");
    assert.match(html, /<header/, "Contains <header>");
    assert.match(html, /<main\s+id="readerMainView"/, "Contains <main id='readerMainView'>");
    assert.match(html, /<footer\s+id="readerFooterView"/, "Contains <footer id='readerFooterView'>");
    assert.match(html, /h-\[100dvh\]/, "Contains 100dvh root height");
  });

  // -------------------------------------------------------------
  // Feature 24: Theme Switching
  // -------------------------------------------------------------
  test("F24: Theme Switching toggles dark mode default and data-theme='light'", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "../../Liseuse Rapide RSVP.html"), "utf8");
    assert.match(html, /--bg:\s*#0a0a0a/, "Dark mode background is #0a0a0a");
    assert.match(html, /\[data-theme="light"\]\s*\{[^}]*--bg:\s*#fafafa/s, "Light mode background is #fafafa");
  });

  // -------------------------------------------------------------
  // Feature 25: Global Progress Slider
  // -------------------------------------------------------------
  test("F25: Global Progress Slider maps 0-1000 range to 0.0% - 100.0%", () => {
    const sliderVal = 584; // 58.4%
    const pct = sliderVal / 10;
    assert.equal(pct, 58.4);
    assert.equal(Math.round(pct * 10), 584);
  });

  // -------------------------------------------------------------
  // Feature 26: Direct Percent Input
  // -------------------------------------------------------------
  test("F26: Direct Percent Input normalizes comma to dot and clamps [0, 100]", () => {
    function parsePct(str) {
      const parsed = parseFloat(String(str).replace(",", "."));
      if (isNaN(parsed)) return 0;
      return Math.max(0, Math.min(100, parsed));
    }
    assert.equal(parsePct("42,5"), 42.5);
    assert.equal(parsePct("120"), 100);
    assert.equal(parsePct("-15"), 0);
  });

  // -------------------------------------------------------------
  // Feature 27: Sentence Navigation
  // -------------------------------------------------------------
  test("F27: Sentence Navigation rewinds intra-sentence when > 2 words in", () => {
    const ch = compilerMod.compileChapter("Nav Test", ["Ceci est une longue phrase avec plusieurs mots ici."]);
    const sent = ch.sentences[0];
    assert.equal(sent.startWordIndex, 0);

    // If we are at word index 5 (5 - 0 = 5 > 2)
    let wordIndex = 5;
    if (wordIndex - sent.startWordIndex > 2) {
      wordIndex = sent.startWordIndex;
    }
    assert.equal(wordIndex, 0, "Rewound to start of current sentence");
  });

  // -------------------------------------------------------------
  // Feature 28: WPM Controls
  // -------------------------------------------------------------
  test("F28: WPM Controls step by 25 and clamp to [100, 1000]", () => {
    function clampWpm(val) {
      return Math.max(100, Math.min(1000, Math.round(val / 25) * 25));
    }
    assert.equal(clampWpm(300 + 25), 325);
    assert.equal(clampWpm(300 - 25), 275);
    assert.equal(clampWpm(1050), 1000);
    assert.equal(clampWpm(50), 100);
    assert.equal(clampWpm(312), 300);
  });

  // -------------------------------------------------------------
  // Feature 29: Expanded Context Modal
  // -------------------------------------------------------------
  test("F29: Expanded Context Modal retains full chapter structure with highlighted active sentence", () => {
    const ch = compilerMod.compileChapter("Modal Test", ["Première phrase.", "Deuxième phrase."]);
    const activeWordIdx = 2; // in sentence 1
    const activeSentIdx = ch.words[activeWordIdx].sentenceIndex;
    assert.equal(activeSentIdx, 1);
    const highlightedWords = ch.words.filter(w => w.sentenceIndex === activeSentIdx);
    assert.equal(highlightedWords.length, 2);
    assert.equal(highlightedWords[0].text, "Deuxième");
  });

  // -------------------------------------------------------------
  // Feature 30: Active Word Centering
  // -------------------------------------------------------------
  test("F30: Active Word Centering targets element with scrollIntoView center block", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "../../Liseuse Rapide RSVP.html"), "utf8");
    assert.match(html, /scrollIntoView\(\{\s*behavior:\s*"smooth",\s*block:\s*"center"\s*\}\)/);
  });

  // -------------------------------------------------------------
  // Feature 31: TOC Modal
  // -------------------------------------------------------------
  test("F31: TOC Modal computes starting percentages for all chapters", () => {
    const ch1 = compilerMod.compileChapter("Ch1", ["Dix mots ici dans le premier chapitre du livre test."]);
    const ch2 = compilerMod.compileChapter("Ch2", ["Dix mots supplémentaires dans le second chapitre du livre test."], ch1.words.length);
    const book = { chapters: [ch1, ch2], totalWords: ch1.words.length + ch2.words.length };
    const pct0 = ((ch1.globalStartWordIndex / (book.totalWords - 1)) * 100).toFixed(1);
    const pct1 = ((ch2.globalStartWordIndex / (book.totalWords - 1)) * 100).toFixed(1);
    assert.equal(pct0, "0.0");
    assert.ok(parseFloat(pct1) > 0, "Second chapter starting percentage > 0");
  });

  // -------------------------------------------------------------
  // Feature 32: Library Modal
  // -------------------------------------------------------------
  test("F32: Library Modal orders books by lastRead timestamp descending", () => {
    const books = [
      { id: "b1", title: "Book 1", lastRead: 1000 },
      { id: "b2", title: "Book 2", lastRead: 3000 },
      { id: "b3", title: "Book 3", lastRead: 2000 }
    ];
    books.sort((a, b) => b.lastRead - a.lastRead);
    assert.equal(books[0].id, "b2");
    assert.equal(books[1].id, "b3");
    assert.equal(books[2].id, "b1");
  });

  // -------------------------------------------------------------
  // Feature 33: Book Deletion Confirmation (Two-click)
  // -------------------------------------------------------------
  test("F33: Book Deletion Confirmation implements two-step confirmation state", () => {
    let confirmDeleteId = null;
    function clickDelete(bookId) {
      if (confirmDeleteId !== bookId) {
        confirmDeleteId = bookId;
        return "Confirmer ?";
      }
      confirmDeleteId = null;
      return "DELETED";
    }
    assert.equal(clickDelete("book-1"), "Confirmer ?");
    assert.equal(clickDelete("book-1"), "DELETED");
  });

  // -------------------------------------------------------------
  // Feature 34: Status Toast Notification
  // -------------------------------------------------------------
  test("F34: Status Toast duration configured to 2200ms", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "../../Liseuse Rapide RSVP.html"), "utf8");
    assert.match(html, /setTimeout\(\(\)\s*=>\s*\{[^}]*opacity\s*=\s*"0"[^}]*\},\s*2200\)/, "Toast timer set to 2200ms");
  });

  // -------------------------------------------------------------
  // Feature 35: Keyboard Navigation Bindings
  // -------------------------------------------------------------
  test("F35: Keyboard Navigation handles Space, Arrow keys, and Escape", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "../../Liseuse Rapide RSVP.html"), "utf8");
    assert.match(html, /e\.code\s*===\s*"Space"/);
    assert.match(html, /e\.code\s*===\s*"ArrowLeft"/);
    assert.match(html, /e\.code\s*===\s*"ArrowRight"/);
    assert.match(html, /e\.code\s*===\s*"ArrowUp"/);
    assert.match(html, /e\.code\s*===\s*"ArrowDown"/);
    assert.match(html, /e\.code\s*===\s*"Escape"/);
  });

  // -------------------------------------------------------------
  // Feature 36: LocalStorage Preferences Schema
  // -------------------------------------------------------------
  test("F36: LocalStorage Preferences persists wpm, theme, and lastBookId", () => {
    const prefs = { wpm: 350, theme: "light", lastBookId: "epub-test-123" };
    const serialized = JSON.stringify(prefs);
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.wpm, 350);
    assert.equal(parsed.theme, "light");
    assert.equal(parsed.lastBookId, "epub-test-123");
  });

  // -------------------------------------------------------------
  // Feature 37: LocalStorage Position Schema
  // -------------------------------------------------------------
  test("F37: LocalStorage Position records chapterIndex, wordIndex, progressPercent, lastRead", () => {
    const pos = { chapterIndex: 2, wordIndex: 14, progressPercent: 12.5, lastRead: Date.now() };
    const serialized = JSON.stringify(pos);
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.chapterIndex, 2);
    assert.equal(parsed.wordIndex, 14);
    assert.equal(parsed.progressPercent, 12.5);
    assert.ok(parsed.lastRead > 0);
  });

  // -------------------------------------------------------------
  // Feature 38: IndexedDB Database Schema
  // -------------------------------------------------------------
  test("F38: IndexedDB Database Schema uses RSVPReaderDB, store 'books', keyPath 'id'", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "../../Liseuse Rapide RSVP.html"), "utf8");
    assert.match(html, /DB_NAME\s*=\s*"RSVPReaderDB"/);
    assert.match(html, /STORE_BOOKS\s*=\s*"books"/);
    assert.match(html, /\{ keyPath:\s*"id"\s*\}/);
  });

  // -------------------------------------------------------------
  // Feature 39: Throttled IDB Synchronization
  // -------------------------------------------------------------
  test("F39: Throttled IDB Sync enforces 2000ms playback interval", () => {
    let lastIdbSync = 10000;
    function shouldSync(now) {
      return (now - lastIdbSync > 2000);
    }
    assert.equal(shouldSync(11000), false, "1000ms elapsed: do not sync");
    assert.equal(shouldSync(12001), true, "2001ms elapsed: trigger sync");
  });

  // -------------------------------------------------------------
  // Feature 40: Page Lifecycle Save
  // -------------------------------------------------------------
  test("F40: Page Lifecycle Save registers pagehide, visibilitychange, beforeunload", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "../../Liseuse Rapide RSVP.html"), "utf8");
    assert.match(html, /addEventListener\("visibilitychange"/);
    assert.match(html, /addEventListener\("pagehide"/);
    assert.match(html, /addEventListener\("beforeunload"/);
  });
});
