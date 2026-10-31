import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getOrpIndex, splitWordOrp } from "../../client/src/rsvp/orp.js";
import { getDelayForWord } from "../../client/src/rsvp/timing.js";
import { compileChapter, prepareBookObject } from "../../client/src/rsvp/compiler.js";
import {
  getCurrentGlobalWordIndex,
  getExactGlobalPercentage,
  resolvePositionFromGlobalWordIndex
} from "../../client/src/rsvp/indexer.js";

describe("Direct RSVP Engine Unit Tests (client/src/rsvp/)", () => {
  test("orp.js: getOrpIndex computes correct brackets and strips punctuation", () => {
    assert.equal(getOrpIndex(""), 0);
    assert.equal(getOrpIndex(null), 0);
    assert.equal(getOrpIndex("a"), 0);
    assert.equal(getOrpIndex("de"), 1);
    assert.equal(getOrpIndex("livre"), 1);
    assert.equal(getOrpIndex("rapide"), 2);
    assert.equal(getOrpIndex("exception"), 2);
    assert.equal(getOrpIndex("merveilleux"), 3);
    assert.equal(getOrpIndex("développement"), 3);
    assert.equal(getOrpIndex("incompréhensible"), 4);
    assert.equal(getOrpIndex("«bonjour!»"), 2);
  });

  test("orp.js: splitWordOrp accounts for leading quotation marks", () => {
    const unquoted = splitWordOrp("chat");
    assert.deepEqual(unquoted, { prefix: "c", pivot: "h", suffix: "at" });

    const quoted = splitWordOrp("«chat»");
    assert.equal(quoted.prefix, "«c");
    assert.equal(quoted.pivot, "h");
    assert.equal(quoted.suffix, "at»");

    const single = splitWordOrp("o");
    assert.deepEqual(single, { prefix: "", pivot: "o", suffix: "" });

    const empty = splitWordOrp("");
    assert.deepEqual(empty, { prefix: "", pivot: "", suffix: "" });
  });

  test("timing.js: getDelayForWord handles all punctuation multipliers", () => {
    const baseWpm = 300; // baseMs = 200
    assert.equal(getDelayForWord({ text: "mot" }, baseWpm), 200); // 1.0x
    assert.equal(getDelayForWord({ text: "extraordinaire" }, baseWpm), 240); // 1.2x (len > 8)
    assert.equal(getDelayForWord({ text: "pause,", isClauseEnd: true }, baseWpm), 280); // 1.4x
    assert.equal(getDelayForWord({ text: "fin.", isSentenceEnd: true }, baseWpm), 380); // 1.9x
    assert.equal(getDelayForWord({ text: "chapitre.", isSentenceEnd: true, isParagraphEnd: true }, baseWpm), 440); // 2.2x
  });

  test("compiler.js: compileChapter creates words, sentences, and paragraphs", () => {
    const paragraphs = [
      "Premier paragraphe avec une virgule, et un point.",
      "Deuxième paragraphe très court."
    ];
    const ch = compileChapter("Test Ch", paragraphs, 100);
    assert.equal(ch.title, "Test Ch");
    assert.equal(ch.globalStartWordIndex, 100);
    assert.equal(ch.words[0].globalIndex, 100);
    assert.equal(ch.paragraphs.length, 2);
    assert.equal(ch.words[ch.words.length - 1].isParagraphEnd, true);
  });

  test("compiler.js: prepareBookObject computes totalWords across multiple chapters", () => {
    const book = prepareBookObject({
      id: "test-book",
      title: "Livre Test",
      rawChapters: [
        { title: "Ch1", paragraphs: ["Trois mots ici."] },
        { title: "Ch2", paragraphs: ["Quatre autres mots ici."] }
      ]
    });
    assert.equal(book.chapters.length, 2);
    assert.equal(book.totalWords, 3 + 4);
    assert.equal(book.chapters[0].globalStartWordIndex, 0);
    assert.equal(book.chapters[1].globalStartWordIndex, 3);
  });

  test("indexer.js: navigation math and percentages", () => {
    const book = prepareBookObject({
      id: "indexer-test",
      rawChapters: [
        { title: "C1", paragraphs: ["Un deux trois quatre cinq."] }, // 5 words: 0..4
        { title: "C2", paragraphs: ["Six sept huit neuf dix."] }     // 5 words: 5..9
      ]
    });
    assert.equal(book.totalWords, 10);

    const state = { book, chapterIndex: 0, wordIndex: 0 };
    assert.equal(getCurrentGlobalWordIndex(state), 0);
    assert.equal(getExactGlobalPercentage(state), 0);

    state.chapterIndex = 1;
    state.wordIndex = 4; // word 9 (last word)
    assert.equal(getCurrentGlobalWordIndex(state), 9);
    assert.equal(getExactGlobalPercentage(state), 100);

    const pos0 = resolvePositionFromGlobalWordIndex(book, 0);
    assert.deepEqual(pos0, { chapterIndex: 0, wordIndex: 0 });

    const pos6 = resolvePositionFromGlobalWordIndex(book, 6);
    assert.deepEqual(pos6, { chapterIndex: 1, wordIndex: 1 });
  });
});
