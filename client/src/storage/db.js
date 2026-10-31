/**
 * IndexedDB persistence module for RSVP reader.
 * Manages saved books and reading positions in 'RSVPReaderDB'.
 */

const DB_NAME = "RSVPReaderDB";
const DB_VERSION = 1;
const STORE_BOOKS = "books";

let dbInstance = null;

export function openBooksDatabase() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB non supporté"));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        const store = db.createObjectStore(STORE_BOOKS, { keyPath: "id" });
        store.createIndex("lastRead", "lastRead", { unique: false });
      }
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

export async function saveBookToIDB(bookRecord) {
  try {
    const db = await openBooksDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOOKS, "readwrite");
      tx.objectStore(STORE_BOOKS).put(bookRecord);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch {
    return false;
  }
}

export async function updateBookPositionInIDB(bookId, chapterIndex, wordIndex, progressPercent) {
  try {
    const db = await openBooksDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_BOOKS, "readwrite");
      const store = tx.objectStore(STORE_BOOKS);
      const getReq = store.get(bookId);

      getReq.onsuccess = () => {
        const rec = getReq.result;
        if (rec) {
          rec.chapterIndex = chapterIndex;
          rec.wordIndex = wordIndex;
          rec.progressPercent = progressPercent;
          rec.lastRead = Date.now();
          store.put(rec);
        }
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function getAllBooksFromIDB() {
  try {
    const db = await openBooksDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_BOOKS, "readonly");
      const req = tx.objectStore(STORE_BOOKS).getAll();

      req.onsuccess = () => {
        const list = (req.result || []).filter((b) => !b.isDemo);
        list.sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0));
        resolve(list);
      };

      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function deleteBookFromIDB(bookId) {
  try {
    const db = await openBooksDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_BOOKS, "readwrite");
      tx.objectStore(STORE_BOOKS).delete(bookId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}
