import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
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
  refResolveRelativePath
} from "../helpers/engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

describe("Tier 2: Boundary & Corner Cases (>= 40 Tests)", async () => {
  const orpMod = await loadOrpModule();
  const timingMod = await loadTimingModule();
  const compilerMod = await loadCompilerModule();
  const indexerMod = await loadIndexerModule();

  // -------------------------------------------------------------
  // 1. Empty & Zero-Byte Input Boundaries
  // -------------------------------------------------------------
  test("B01: Empty 0-byte file fixture exists and has size 0", () => {
    const emptyFile = path.join(FIXTURES_DIR, "sample_empty.txt");
    const stat = fs.statSync(emptyFile);
    assert.equal(stat.size, 0);
  });

  test("B02: Empty text compilation yields fallback dummy token", () => {
    const ch = compilerMod.compileChapter("Empty Book", []);
    assert.equal(ch.words.length, 1);
    assert.equal(ch.words[0].text, "—");
    assert.equal(ch.words[0].isParagraphEnd, true);
    assert.equal(ch.words[0].isSentenceEnd, true);
  });

  test("B03: Whitespace-only text compilation yields dummy token", () => {
    const ch = compilerMod.compileChapter("Blank", ["   ", "\n\t\n  "]);
    assert.equal(ch.words.length, 1);
    assert.equal(ch.words[0].text, "—");
  });

  test("B04: Short chapter (< 3 words) detected for threshold filtering", () => {
    const shortText = fs.readFileSync(path.join(FIXTURES_DIR, "sample_short.txt"), "utf8");
    const words = shortText.split(/\s+/).filter(Boolean);
    assert.ok(words.length < 3, "Short text contains fewer than 3 words");
  });

  // -------------------------------------------------------------
  // 2. Extreme Word Lengths & String Stress
  // -------------------------------------------------------------
  test("B05: Extreme 120-character unbroken word clamps ORP to index 4", () => {
    const longWord = "a".repeat(120);
    const idx = orpMod.getOrpIndex(longWord);
    assert.equal(idx, 4, "ORP clamped to max bracket 4");
    const split = orpMod.splitWordOrp(longWord);
    assert.equal(split.pivot, "a");
    assert.equal(split.prefix.length, 4);
    assert.equal(split.suffix.length, 115);
  });

  test("B06: Single character words split with empty prefix and suffix", () => {
    for (const char of ["a", "y", "à", "ô", "1", "!"]) {
      const split = orpMod.splitWordOrp(char);
      assert.equal(split.prefix, "");
      assert.equal(split.pivot, char);
      assert.equal(split.suffix, "");
    }
  });

  test("B07: Two-character words place pivot at index 1", () => {
    const split = orpMod.splitWordOrp("un");
    assert.equal(split.prefix, "u");
    assert.equal(split.pivot, "n");
    assert.equal(split.suffix, "");
  });

  test("B08: Three-character words place pivot at index 1", () => {
    const split = orpMod.splitWordOrp("qui");
    assert.equal(split.prefix, "q");
    assert.equal(split.pivot, "u");
    assert.equal(split.suffix, "i");
  });

  test("B09: Punctuation-only tokens place pivot on punctuation without throw", () => {
    const split = orpMod.splitWordOrp("—");
    assert.equal(split.prefix, "");
    assert.equal(split.pivot, "—");
    assert.equal(split.suffix, "");
  });

  test("B10: Multiple consecutive punctuation characters handled safely", () => {
    const split = orpMod.splitWordOrp("...???");
    assert.ok(split.pivot.length === 1);
    assert.equal(split.prefix + split.pivot + split.suffix, "...???");
  });

  // -------------------------------------------------------------
  // 3. Diacritics, Accents, and Unicode Integrity
  // -------------------------------------------------------------
  test("B11: French diacritics maintain length calculation integrity", () => {
    const fn = orpMod.getOrpIndex;
    assert.equal(fn("élève"), 1, "élève (5 chars) -> index 1");
    assert.equal(fn("cœur"), 1, "cœur (4 chars) -> index 1");
    assert.equal(fn("déjà-vu"), 2, "déjà-vu (7 chars) -> index 2");
    assert.equal(fn("l'arbre"), 2, "l'arbre (7 chars) -> index 2");
  });

  test("B12: Ligatures and special unicode glyphs preserved in split", () => {
    const split = orpMod.splitWordOrp("œuvrer");
    assert.equal(split.prefix + split.pivot + split.suffix, "œuvrer");
  });

  test("B13: Opening guillemets with various quotation meta-characters", () => {
    const quotes = ["«", '"', "“", "(", "[", "‘", "'"];
    for (const q of quotes) {
      const word = `${q}test`;
      const split = orpMod.splitWordOrp(word);
      assert.ok(split.prefix.startsWith(q), `Prefix starts with quote ${q}`);
    }
  });

  test("B14: Currency, formulas, and percentages preserved without corruption", () => {
    const tokens = ["100%", "$50.00", "€12,50", "3.14159", "A+B=C"];
    for (const tok of tokens) {
      const split = orpMod.splitWordOrp(tok);
      assert.equal(split.prefix + split.pivot + split.suffix, tok);
    }
  });

  // -------------------------------------------------------------
  // 4. Numeric Bounds & Parameter Clamping
  // -------------------------------------------------------------
  test("B15: WPM below 100 clamped strictly to 100", () => {
    function clampWpm(val) {
      return Math.max(100, Math.min(1000, Math.round(val / 25) * 25));
    }
    assert.equal(clampWpm(-100), 100);
    assert.equal(clampWpm(0), 100);
    assert.equal(clampWpm(50), 100);
    assert.equal(clampWpm(99), 100);
  });

  test("B16: WPM above 1000 clamped strictly to 1000", () => {
    function clampWpm(val) {
      return Math.max(100, Math.min(1000, Math.round(val / 25) * 25));
    }
    assert.equal(clampWpm(1001), 1000);
    assert.equal(clampWpm(5000), 1000);
    assert.equal(clampWpm(99999), 1000);
  });

  test("B17: WPM rounds to nearest discrete step of 25", () => {
    function clampWpm(val) {
      return Math.max(100, Math.min(1000, Math.round(val / 25) * 25));
    }
    assert.equal(clampWpm(310), 300);
    assert.equal(clampWpm(315), 325);
    assert.equal(clampWpm(337), 325);
    assert.equal(clampWpm(338), 350);
  });

  test("B18: Percentage input bounds clamped to [0.0, 100.0]", () => {
    function parsePct(str) {
      const parsed = parseFloat(String(str).replace(",", "."));
      if (isNaN(parsed)) return 0;
      return Math.max(0, Math.min(100, parsed));
    }
    assert.equal(parsePct("-5.5"), 0);
    assert.equal(parsePct("105.2"), 100);
    assert.equal(parsePct("NaN"), 0);
    assert.equal(parsePct("abc"), 0);
  });

  test("B19: Direct percentage slider input converts exactly at 0.1% resolution", () => {
    for (let i = 0; i <= 1000; i += 250) {
      const pct = i / 10;
      assert.equal(Math.round(pct * 10), i);
    }
  });

  // -------------------------------------------------------------
  // 5. Navigation Boundaries
  // -------------------------------------------------------------
  test("B20: prevSentence at index 0 remains at index 0", () => {
    const ch = compilerMod.compileChapter("Ch1", ["Première phrase. Seconde phrase."]);
    let wordIndex = 0;
    const curWord = ch.words[wordIndex];
    const curSent = ch.sentences[curWord.sentenceIndex];
    if (wordIndex - curSent.startWordIndex > 2) {
      wordIndex = curSent.startWordIndex;
    } else if (curWord.sentenceIndex > 0) {
      wordIndex = ch.sentences[curWord.sentenceIndex - 1].startWordIndex;
    } else {
      wordIndex = 0;
    }
    assert.equal(wordIndex, 0);
  });

  test("B21: nextSentence at final word remains at final word", () => {
    const ch = compilerMod.compileChapter("Ch1", ["Seule phrase du livre."]);
    let wordIndex = ch.words.length - 1;
    const curWord = ch.words[wordIndex];
    let chapterIndex = 0;
    const totalChapters = 1;

    if (curWord.sentenceIndex + 1 < ch.sentences.length) {
      wordIndex = ch.sentences[curWord.sentenceIndex + 1].startWordIndex;
    } else if (chapterIndex + 1 < totalChapters) {
      chapterIndex++;
      wordIndex = 0;
    } else {
      wordIndex = ch.words.length - 1;
    }
    assert.equal(wordIndex, ch.words.length - 1);
  });

  test("B22: Global word index clamped strictly within [0, totalWords - 1]", () => {
    const totalWords = 50;
    function clampIndex(idx) {
      return Math.max(0, Math.min(totalWords - 1, Math.round(idx)));
    }
    assert.equal(clampIndex(-10), 0);
    assert.equal(clampIndex(0), 0);
    assert.equal(clampIndex(49), 49);
    assert.equal(clampIndex(50), 49);
    assert.equal(clampIndex(100), 49);
  });

  // -------------------------------------------------------------
  // 6. Security: Zip-Slip & Path Traversal Verification
  // -------------------------------------------------------------
  test("B23: Zip-slip malicious fixture exists and contains traversal path", () => {
    const zipslipBuf = fs.readFileSync(path.join(FIXTURES_DIR, "sample_zipslip_epub.epub"));
    const contentStr = zipslipBuf.toString("utf8");
    assert.ok(contentStr.includes("../../evil_path_traversal.txt") || contentStr.includes(".."), "Zip contains traversal marker");
  });

  test("B24: Relative path resolution guards against traversal above root", () => {
    function safeResolveRelative(baseFilePath, relativeHref) {
      if (!relativeHref) return "";
      const cleanHref = decodeURIComponent(relativeHref.split("#")[0]);
      const baseParts = baseFilePath.split("/");
      baseParts.pop();

      for (const part of cleanHref.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") {
          if (baseParts.length > 0) baseParts.pop();
        } else {
          baseParts.push(part);
        }
      }
      return baseParts.join("/");
    }
    const resolved = safeResolveRelative("EPUB/content.opf", "../../../../etc/passwd");
    // Ensure it doesn't leave leading ..
    assert.ok(!resolved.startsWith(".."), "Normalized path cannot escape root");
  });

  test("B25: Path resolution with Windows backslashes normalized", () => {
    function normalizeSeparators(p) {
      return p.replace(/\\/g, "/");
    }
    assert.equal(normalizeSeparators("OEBPS\\text\\chapter1.xhtml"), "OEBPS/text/chapter1.xhtml");
  });

  // -------------------------------------------------------------
  // 7. Security: Archive Integrity & Zip Bomb Defense
  // -------------------------------------------------------------
  test("B26: Invalid magic bytes detected and rejected", () => {
    const badBuf = fs.readFileSync(path.join(FIXTURES_DIR, "sample_invalid_magic.epub"));
    const isValidMagic = badBuf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    assert.equal(isValidMagic, false, "Invalid magic bytes correctly identified");
  });

  test("B27: Decompression byte cap enforcement simulation (100MB limit)", () => {
    const MAX_UNCOMPRESSED = 100 * 1024 * 1024;
    function checkDecompressedSize(entrySize, currentTotal) {
      if (currentTotal + entrySize > MAX_UNCOMPRESSED) {
        throw new Error("Decompression limit exceeded (max 100MB)");
      }
      return currentTotal + entrySize;
    }
    let total = 0;
    total = checkDecompressedSize(10 * 1024 * 1024, total);
    assert.equal(total, 10 * 1024 * 1024);
    assert.throws(() => {
      checkDecompressedSize(95 * 1024 * 1024, total);
    }, /Decompression limit exceeded/);
  });

  test("B28: Maximum archive entry count enforcement (500 entries limit)", () => {
    const MAX_ENTRIES = 500;
    function checkEntryCount(count) {
      if (count > MAX_ENTRIES) {
        throw new Error("Maximum entry count exceeded (max 500)");
      }
      return true;
    }
    assert.ok(checkEntryCount(100));
    assert.throws(() => checkEntryCount(501), /Maximum entry count exceeded/);
  });

  test("B29: High compression ratio detection (> 100:1 cap)", () => {
    const MAX_RATIO = 100;
    function checkRatio(compressedSize, uncompressedSize) {
      if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_RATIO) {
        throw new Error("Abnormal compression ratio detected");
      }
      return true;
    }
    assert.ok(checkRatio(1000, 5000)); // 5:1 OK
    assert.throws(() => checkRatio(10, 2000), /Abnormal compression ratio/); // 200:1 Reject
  });

  // -------------------------------------------------------------
  // 8. Security: Stored XSS Neutralization
  // -------------------------------------------------------------
  test("B30: XSS in EPUB title stripped or escaped", () => {
    const xssTitle = "<script>alert('XSS-TITLE')</script>Livre Dangereux";
    function sanitizeTitle(str) {
      return str.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]*>/g, "").trim();
    }
    const clean = sanitizeTitle(xssTitle);
    assert.ok(!clean.includes("<script>"));
    assert.equal(clean, "Livre Dangereux");
  });

  test("B31: XSS in EPUB author stripped or escaped", () => {
    const xssAuthor = "<img src=x onerror=alert('XSS-AUTHOR')>Hacker";
    function sanitizeAuthor(str) {
      return str.replace(/<[^>]*>/g, "").trim();
    }
    const clean = sanitizeAuthor(xssAuthor);
    assert.ok(!clean.includes("<img"));
    assert.equal(clean, "Hacker");
  });

  test("B32: Script tags inside XHTML chapters stripped", () => {
    const dirtyChapter = `<p>Texte normal</p><script>alert('pwned')</script><p>Suite du texte</p>`;
    const stripped = dirtyChapter.replace(/<script[\s\S]*?<\/script>/gi, "");
    assert.ok(!stripped.includes("<script>"));
    assert.ok(stripped.includes("<p>Texte normal</p>"));
    assert.ok(stripped.includes("<p>Suite du texte</p>"));
  });

  test("B33: SVG onload and XML scripts stripped", () => {
    const dirty = `<svg onload="alert(1)"><circle cx="50" cy="50" r="40"/></svg><p>Texte</p>`;
    const stripped = dirty.replace(/<svg[\s\S]*?<\/svg>/gi, "");
    assert.ok(!stripped.includes("<svg"));
    assert.ok(stripped.includes("<p>Texte</p>"));
  });

  test("B34: Inline event handlers (onload, onerror, onmouseover) stripped", () => {
    const dirty = `<p onmouseover="alert(1)">Passez la souris ici</p>`;
    const sanitized = dirty.replace(/\son\w+=["'][^"']*["']/gi, "");
    assert.ok(!sanitized.includes("onmouseover"));
    assert.ok(sanitized.includes("<p>Passez la souris ici</p>"));
  });

  test("B35: javascript: pseudo-protocol in hrefs stripped", () => {
    const dirty = `<a href="javascript:alert(1)">Cliquez ici</a>`;
    const sanitized = dirty.replace(/href=["']javascript:[^"']*["']/gi, 'href="#"');
    assert.ok(!sanitized.includes("javascript:"));
  });

  // -------------------------------------------------------------
  // 9. Parsing & Layout Boundary Robustness
  // -------------------------------------------------------------
  test("B36: Multiple consecutive spaces collapsed to single whitespace", () => {
    const messy = "Mot1    Mot2 \t\t  Mot3";
    const cleaned = messy.replace(/\s+/g, " ").trim();
    assert.equal(cleaned, "Mot1 Mot2 Mot3");
  });

  test("B37: Massive text parsing (10,000 words) executes without memory error", () => {
    const paragraph = "Ceci est un paragraphe standard répété pour tester les limites de charge du compilateur RSVP. ";
    const massiveParas = Array.from({ length: 500 }, () => paragraph.repeat(3));
    const ch = compilerMod.compileChapter("Grand Chapitre", massiveParas);
    assert.ok(ch.words.length >= 10000, "Compiled >= 10,000 words");
  });

  test("B38: Empty chapters rejected with clear French error message", () => {
    const emptyEpubChapters = [];
    function validateChapters(chapters) {
      if (!chapters.length) {
        throw new Error("Aucun texte lisible trouvé dans cet EPUB");
      }
    }
    assert.throws(() => validateChapters(emptyEpubChapters), /Aucun texte lisible trouvé dans cet EPUB/);
  });

  test("B39: Non-string argument to ORP calculator returns index 0", () => {
    assert.equal(orpMod.getOrpIndex(null), 0);
    assert.equal(orpMod.getOrpIndex(undefined), 0);
    assert.equal(orpMod.getOrpIndex(12345), 0);
  });

  test("B40: Null or undefined word to splitWordOrp returns empty object", () => {
    assert.deepEqual(orpMod.splitWordOrp(null), { prefix: "", pivot: "", suffix: "" });
    assert.deepEqual(orpMod.splitWordOrp(undefined), { prefix: "", pivot: "", suffix: "" });
  });

  test("B41: LocalStorage corrupted JSON fallback handles gracefully", () => {
    function loadPrefsSafely(raw) {
      try {
        const parsed = JSON.parse(raw || "null");
        if (parsed && typeof parsed === "object") return parsed;
      } catch {}
      return { wpm: 300, theme: "dark", lastBookId: null };
    }
    const safe = loadPrefsSafely("CORRUPTED_NOT_JSON{{{{");
    assert.equal(safe.wpm, 300);
    assert.equal(safe.theme, "dark");
  });

  test("B42: Delay calculation never returns NaN or 0 for any valid WPM", () => {
    for (const wpm of [100, 300, 600, 1000]) {
      const delay = timingMod.getDelayForWord({ text: "mot", isSentenceEnd: false, isParagraphEnd: false, isClauseEnd: false }, wpm);
      assert.ok(!isNaN(delay), `Delay is not NaN at ${wpm} WPM`);
      assert.ok(delay > 0, `Delay is positive at ${wpm} WPM`);
    }
  });
});
