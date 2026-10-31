/**
 * RSVP Stage visual rendering module.
 * Controls word display, ORP alignment, font scaling, and pause context sentence.
 */

import { splitWordOrp } from "../rsvp/orp.js";
import { getExactGlobalPercentage } from "../rsvp/indexer.js";

export function renderWordDisplay(wordText) {
  const { prefix, pivot, suffix } = splitWordOrp(wordText || "");

  const prefixEl = document.getElementById("rsvpPrefix");
  const pivotEl = document.getElementById("rsvpPivot");
  const suffixEl = document.getElementById("rsvpSuffix");
  const container = document.getElementById("rsvpWordContainer");

  if (prefixEl) prefixEl.textContent = prefix;
  if (pivotEl) pivotEl.textContent = pivot;
  if (suffixEl) suffixEl.textContent = suffix;

  if (container) {
    container.className = (wordText && wordText.length > 15)
      ? "rsvp-word-grid text-2xl sm:text-4xl font-normal tracking-tight"
      : "rsvp-word-grid text-4xl sm:text-6xl font-normal tracking-tight";
  }
}

export function renderPauseSentence(chapter, currentWordObj, isPlaying, onWordClick) {
  const container = document.getElementById("pauseSentenceContainer");
  const textEl = document.getElementById("pauseSentenceText");
  if (!container || !textEl) return;

  if (isPlaying) {
    container.style.opacity = "0";
    container.style.pointerEvents = "none";
    return;
  }

  container.style.opacity = "1";
  container.style.pointerEvents = "auto";

  if (!chapter || !currentWordObj) {
    textEl.textContent = "";
    return;
  }

  const sent = chapter.sentences[currentWordObj.sentenceIndex];
  if (!sent) {
    textEl.textContent = "";
    return;
  }

  const frag = document.createDocumentFragment();
  for (let i = sent.startWordIndex; i <= sent.endWordIndex; i++) {
    const w = chapter.words[i];
    if (!w) continue;
    const span = document.createElement("span");
    span.textContent = w.text;
    span.className = "tappable-word" + (i === currentWordObj.index ? " active-word-mark" : "");
    span.addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof onWordClick === "function") {
        onWordClick(i);
      }
    });
    frag.appendChild(span);
    if (i < sent.endWordIndex) {
      frag.appendChild(document.createTextNode(" "));
    }
  }

  textEl.replaceChildren(frag);
}

export function updateStageVisibility(hasBook) {
  const emptyView = document.getElementById("emptyStateView");
  const mainView = document.getElementById("readerMainView");
  const footerView = document.getElementById("readerFooterView");
  const tocBtn = document.getElementById("btnOpenToc");

  if (emptyView) emptyView.classList.toggle("hidden", hasBook);
  if (mainView) {
    mainView.classList.toggle("hidden", !hasBook);
    mainView.classList.toggle("flex", hasBook);
  }
  if (footerView) {
    footerView.classList.toggle("hidden", !hasBook);
    footerView.classList.toggle("flex", hasBook);
  }
  if (tocBtn) tocBtn.classList.toggle("hidden", !hasBook);
}

export function renderProgressInfo(state) {
  if (!state.book) return;
  const chapter = state.book.chapters[state.chapterIndex] || state.book.chapters[0];

  const bookTitleEl = document.getElementById("bookTitleHeader");
  const footerChapterEl = document.getElementById("btnFooterChapter");
  const percentDisplayEl = document.getElementById("btnPercentDisplay");
  const sliderEl = document.getElementById("globalProgressSlider");

  if (bookTitleEl) bookTitleEl.textContent = state.book.title;
  if (footerChapterEl && chapter) footerChapterEl.textContent = chapter.title;

  const exactPercent = getExactGlobalPercentage(state);
  if (percentDisplayEl) percentDisplayEl.textContent = `${exactPercent.toFixed(1)}%`;
  if (sliderEl) sliderEl.value = Math.round(exactPercent * 10);
}
