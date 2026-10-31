/**
 * Modals and Overlays module: Library, Table of Contents, and Expanded Context view.
 * Utilizes textContent and DOMPurify for XSS-safe rendering.
 */

import DOMPurify from "dompurify";
import { getExactGlobalPercentage } from "../rsvp/indexer.js";

function safeText(str) {
  if (!str) return "";
  return DOMPurify.sanitize(String(str), { ALLOWED_TAGS: [] });
}

/* ================= EXPANDED CONTEXT OVERLAY ================= */

export function openExpandedModal(state, onWordSelected) {
  if (!state.book) return;
  const chapter = state.book.chapters[state.chapterIndex] || state.book.chapters[0];
  if (!chapter) return;

  const titleEl = document.getElementById("expandedChapterTitle");
  if (titleEl) titleEl.textContent = safeText(chapter.title);

  const container = document.getElementById("expandedTextContainer");
  if (!container) return;
  container.innerHTML = "";

  const activeWord = chapter.words[state.wordIndex];
  const activeSentIdx = activeWord ? activeWord.sentenceIndex : -1;
  const frag = document.createDocumentFragment();

  chapter.paragraphs.forEach((wordIndices) => {
    const p = document.createElement("p");
    wordIndices.forEach((wIdx, pos) => {
      const w = chapter.words[wIdx];
      if (!w) return;

      const span = document.createElement("span");
      span.textContent = w.text;

      let cls = "tappable-word";
      if (w.sentenceIndex === activeSentIdx) cls += " active-sentence-mark";
      if (wIdx === state.wordIndex) {
        cls += " active-word-mark";
        span.id = "activeExpandedWord";
      }
      span.className = cls;

      span.addEventListener("click", () => {
        if (typeof onWordSelected === "function") {
          onWordSelected(wIdx);
        }
        closeExpandedModal();
      });

      p.appendChild(span);
      if (pos < wordIndices.length - 1) {
        p.appendChild(document.createTextNode(" "));
      }
    });
    frag.appendChild(p);
  });

  container.appendChild(frag);

  const overlay = document.getElementById("expandedOverlay");
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
  }

  setTimeout(scrollToActiveWord, 40);
}

export function scrollToActiveWord() {
  const el = document.getElementById("activeExpandedWord");
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

export function closeExpandedModal() {
  const overlay = document.getElementById("expandedOverlay");
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.classList.remove("flex");
  }
}

/* ================= TOC OVERLAY ================= */

export function openTocModal(state, onChapterSelected) {
  if (!state.book || !state.book.chapters) return;

  const list = document.getElementById("tocList");
  if (!list) return;
  list.innerHTML = "";

  const totalWords = state.book.totalWords || 1;

  state.book.chapters.forEach((ch, idx) => {
    const isCurrent = (idx === state.chapterIndex);
    const chapStartPct = totalWords > 1
      ? ((ch.globalStartWordIndex / (totalWords - 1)) * 100).toFixed(1)
      : "0.0";

    const btn = document.createElement("button");
    btn.className = `w-full text-left py-2 flex items-center justify-between gap-4 transition ${
      isCurrent ? "text-fg font-medium" : "text-muted hover:text-fg"
    }`;

    const titleSpan = document.createElement("span");
    titleSpan.className = "truncate";
    titleSpan.textContent = safeText(ch.title);

    const pctSpan = document.createElement("span");
    pctSpan.className = "font-mono text-xs shrink-0 opacity-60";
    pctSpan.textContent = `${chapStartPct}%`;

    btn.appendChild(titleSpan);
    btn.appendChild(pctSpan);

    btn.addEventListener("click", () => {
      if (typeof onChapterSelected === "function") {
        onChapterSelected(idx);
      }
      closeTocModal();
    });

    list.appendChild(btn);
  });

  const overlay = document.getElementById("tocOverlay");
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
  }
}

export function closeTocModal() {
  const overlay = document.getElementById("tocOverlay");
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.classList.remove("flex");
  }
}

/* ================= LIBRARY OVERLAY ================= */

export function renderLibraryItems({
  books,
  currentBookId,
  confirmDeleteId,
  onOpenBook,
  onConfirmDelete,
  onRequestDelete,
  getLocalPos
}) {
  const container = document.getElementById("libraryList");
  const countLabel = document.getElementById("libraryCountLabel");

  if (countLabel) {
    countLabel.textContent = books && books.length > 0 ? `(${books.length})` : "";
  }

  if (!container) return;
  container.innerHTML = "";

  if (!books || books.length === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.className = "text-muted text-xs";
    emptyMsg.textContent = "Aucun livre enregistré dans le navigateur.";
    container.appendChild(emptyMsg);
    return;
  }

  books.forEach((rec) => {
    const isCurrent = currentBookId === rec.id;
    const savedPos = getLocalPos ? getLocalPos(rec.id, rec.chapterIndex || 0, rec.wordIndex || 0) : null;
    const pct = isCurrent
      ? (savedPos ? savedPos.progressPercent : (rec.progressPercent || 0))
      : (savedPos ? savedPos.progressPercent : (rec.progressPercent || 0));

    const row = document.createElement("div");
    row.className = "flex items-center justify-between gap-4 py-2";

    const isConfirming = (confirmDeleteId === rec.id);

    const openBtn = document.createElement("button");
    openBtn.className = "book-open-btn text-left min-w-0 flex-1 group";

    const titleDiv = document.createElement("div");
    titleDiv.className = `truncate ${isCurrent ? 'text-fg font-medium' : 'text-muted group-hover:text-fg'} transition`;
    titleDiv.textContent = safeText(rec.title);

    const metaDiv = document.createElement("div");
    metaDiv.className = "text-xs text-muted font-mono mt-0.5";
    const authorText = rec.author ? ` • ${safeText(rec.author)}` : "";
    metaDiv.textContent = `${Number(pct || 0).toFixed(1)}%${authorText}`;

    openBtn.appendChild(titleDiv);
    openBtn.appendChild(metaDiv);

    openBtn.addEventListener("click", () => {
      if (typeof onOpenBook === "function") {
        onOpenBook(rec);
      }
    });

    const delBtn = document.createElement("button");
    delBtn.className = "book-del-btn text-xs font-mono text-muted hover:text-fg transition shrink-0 py-1 px-2";
    delBtn.textContent = isConfirming ? "Confirmer ?" : "Supprimer";

    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!isConfirming) {
        if (typeof onRequestDelete === "function") {
          onRequestDelete(rec.id);
        }
      } else {
        if (typeof onConfirmDelete === "function") {
          onConfirmDelete(rec.id);
        }
      }
    });

    row.appendChild(openBtn);
    row.appendChild(delBtn);
    container.appendChild(row);
  });
}

export function openLibraryModal() {
  const overlay = document.getElementById("libraryOverlay");
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.classList.add("flex");
  }
}

export function closeLibraryModal() {
  const overlay = document.getElementById("libraryOverlay");
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.classList.remove("flex");
  }
}
