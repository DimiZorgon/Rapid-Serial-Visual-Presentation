import JSZip from 'jszip';
import * as cheerio from 'cheerio';
import path from 'node:path';

export const MAX_ZIP_ENTRIES = 500;
export const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024; // 100 MB
export const MIN_CHAPTER_WORDS = 3;
const ZIP_MAGIC = Buffer.from([0x50, 0x4B, 0x03, 0x04]);

/**
 * Validate ZIP header magic bytes (PK\x03\x04).
 */
export function validateZipSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    throw new Error('Invalid EPUB file: invalid ZIP signature');
  }
  if (!buffer.subarray(0, 4).equals(ZIP_MAGIC)) {
    throw new Error('Invalid EPUB file: invalid ZIP signature');
  }
}

/**
 * Scan raw local file headers to discover all entry names before decompression.
 */
export function getZipEntryNames(buffer) {
  const names = [];
  let pos = 0;
  while (pos < buffer.length - 30) {
    if (buffer.readUInt32LE(pos) === 0x04034b50) {
      const nameLen = buffer.readUInt16LE(pos + 26);
      const extraLen = buffer.readUInt16LE(pos + 28);
      if (pos + 30 + nameLen <= buffer.length) {
        const name = buffer.toString('utf8', pos + 30, pos + 30 + nameLen);
        names.push(name);
      }
      pos += 30 + nameLen + extraLen;
    } else {
      pos++;
    }
  }
  return names;
}

/**
 * Check if a zip entry path is safe (prevent Zip Slip).
 */
export function isSafeZipPath(entryPath) {
  if (typeof entryPath !== 'string' || !entryPath.trim()) return false;
  if (entryPath.includes('\0')) return false;

  const normalized = entryPath.replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(normalized)) return false;
  if (normalized.startsWith('/')) return false;

  const safePath = path.posix.normalize(normalized);
  if (safePath === '..' || safePath.startsWith('../') || safePath.startsWith('/')) {
    return false;
  }

  return true;
}

/**
 * Resolve relative href against base file path safely.
 */
export function resolveRelativePath(baseFilePath, relativeHref) {
  if (!relativeHref) return '';
  const rawHref = relativeHref.split('#')[0].split('?')[0];
  let cleanHref;
  try {
    cleanHref = decodeURIComponent(rawHref);
  } catch {
    return '';
  }
  if (cleanHref.includes('\0')) return '';

  const normalizedHref = cleanHref.replace(/\\/g, '/');
  if (normalizedHref.startsWith('/') || /^[a-zA-Z]:/.test(normalizedHref)) {
    return '';
  }

  const baseDir = path.posix.dirname(baseFilePath.replace(/\\/g, '/'));
  const resolved = path.posix.normalize(path.posix.join(baseDir === '.' ? '' : baseDir, normalizedHref));

  if (resolved.startsWith('..') || resolved.startsWith('/')) {
    return '';
  }

  return resolved;
}

/**
 * Strip scripts, styles, HTML tags, and alert injections from text.
 */
export function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/alert\([^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Case-insensitive search for a file in the zip archive.
 */
export function findZipEntry(zip, targetPath) {
  if (!targetPath) return null;
  const normalized = targetPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (zip.files[normalized]) return zip.files[normalized];

  const lower = normalized.toLowerCase();
  for (const key of Object.keys(zip.files)) {
    if (key.toLowerCase() === lower) {
      return zip.files[key];
    }
  }
  return null;
}

/**
 * Parse an in-memory EPUB buffer and extract structured BookJSON.
 * @param {Buffer} buffer
 * @param {string} [filename="livre.epub"]
 * @returns {Promise<{ id: string, title: string, author: string, totalWords: number, chapters: Array<{ title: string, rawParagraphs: string[], wordCount: number }> }>}
 */
export async function parseEpub(buffer, filename = 'livre.epub') {
  validateZipSignature(buffer);

  // 1. Check raw entry names for Zip Slip path traversal
  const rawEntryNames = getZipEntryNames(buffer);
  for (const rawName of rawEntryNames) {
    if (!isSafeZipPath(rawName)) {
      throw new Error('Malicious EPUB archive: Zip Slip path traversal detected');
    }
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    throw new Error(`Corrupt or unreadable EPUB archive: ${err.message}`);
  }

  const entryKeys = Object.keys(zip.files);

  // 2. Check entry count (Zip bomb defense)
  if (entryKeys.length > MAX_ZIP_ENTRIES) {
    throw new Error(`Zip bomb defense: entry count exceeded (found ${entryKeys.length}, max ${MAX_ZIP_ENTRIES})`);
  }

  // 3. Validate all loaded entry paths for Zip Slip
  for (const entryPath of entryKeys) {
    if (!isSafeZipPath(entryPath)) {
      throw new Error('Malicious EPUB archive: Zip Slip path traversal detected');
    }
  }

  let totalExtractedBytes = 0;
  const safeExtractString = async (entry) => {
    if (!entry) return null;
    const str = await entry.async('string');
    totalExtractedBytes += Buffer.byteLength(str, 'utf8');
    if (totalExtractedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new Error(`Zip bomb defense: decompressed size exceeded limit (${MAX_UNCOMPRESSED_BYTES} bytes)`);
    }
    return str;
  };

  // 4. Locate and parse META-INF/container.xml
  const containerEntry = findZipEntry(zip, 'META-INF/container.xml');
  if (!containerEntry) {
    throw new Error('Fichier EPUB invalide (container.xml manquant)');
  }

  const containerXml = await safeExtractString(containerEntry);
  const containerDoc = cheerio.load(containerXml, { xml: true });
  const rootfileEl = containerDoc('rootfile').first();
  const opfPath = rootfileEl.attr('full-path');

  if (!opfPath) {
    throw new Error('Structure OPF introuvable dans container.xml');
  }

  if (!isSafeZipPath(opfPath)) {
    throw new Error('Malicious EPUB archive: Zip Slip path traversal detected');
  }

  // 5. Locate and parse OPF file
  const opfEntry = findZipEntry(zip, opfPath);
  if (!opfEntry) {
    throw new Error(`Fichier OPF introuvable : ${opfPath}`);
  }

  const opfXml = await safeExtractString(opfEntry);
  const opfDoc = cheerio.load(opfXml, { xml: true });

  // Metadata: Title and Author
  let bookTitle = sanitizeText(opfDoc('metadata title, dc\\:title, title').first().text());
  if (!bookTitle) {
    bookTitle = sanitizeText((filename || 'livre').replace(/\.epub$/i, '').trim()) || 'Sans titre';
  }
  const bookAuthor = sanitizeText(opfDoc('metadata creator, dc\\:creator, creator').first().text());

  // 6. Manifest
  const manifestMap = {};
  let tocNcxId = null;
  let navItemHref = null;

  opfDoc('manifest > item').each((_, el) => {
    const item = opfDoc(el);
    const id = item.attr('id');
    const href = item.attr('href');
    const mediaType = item.attr('media-type') || '';
    const properties = item.attr('properties') || '';

    if (id && href) {
      const resolved = resolveRelativePath(opfPath, href);
      if (!resolved) {
        throw new Error('Malicious EPUB archive: Zip Slip path traversal detected');
      }
      manifestMap[id] = { href, mediaType, properties };
      if (properties.includes('nav')) navItemHref = href;
      if (mediaType === 'application/x-dtbncx+xml') tocNcxId = id;
    }
  });

  // 7. Table of Contents (TOC) mappings
  const hrefToTitleMap = {};

  if (navItemHref) {
    const navPath = resolveRelativePath(opfPath, navItemHref);
    const navEntry = findZipEntry(zip, navPath);
    if (navEntry) {
      const navHtml = await safeExtractString(navEntry);
      const navDoc = cheerio.load(navHtml);
      navDoc('nav a[href]').each((_, a) => {
        const rawHref = navDoc(a).attr('href');
        const res = resolveRelativePath(navPath, rawHref);
        const lbl = sanitizeText(navDoc(a).text());
        if (res && lbl && !hrefToTitleMap[res]) {
          hrefToTitleMap[res] = lbl;
        }
      });
    }
  }

  if (tocNcxId && manifestMap[tocNcxId]) {
    const ncxPath = resolveRelativePath(opfPath, manifestMap[tocNcxId].href);
    const ncxEntry = findZipEntry(zip, ncxPath);
    if (ncxEntry) {
      const ncxXml = await safeExtractString(ncxEntry);
      const ncxDoc = cheerio.load(ncxXml, { xml: true });
      ncxDoc('navPoint').each((_, np) => {
        const point = ncxDoc(np);
        const lbl = sanitizeText(point.find('navLabel > text').first().text());
        const src = point.find('content').first().attr('src');
        if (src && lbl) {
          const res = resolveRelativePath(ncxPath, src);
          if (res && !hrefToTitleMap[res]) {
            hrefToTitleMap[res] = lbl;
          }
        }
      });
    }
  }

  // 8. Spine traversal
  const spineItems = opfDoc('spine > itemref');
  const chapters = [];

  for (let i = 0; i < spineItems.length; i++) {
    const idref = opfDoc(spineItems[i]).attr('idref');
    const item = manifestMap[idref];
    if (!item) continue;

    const fullPath = resolveRelativePath(opfPath, item.href);
    const entry = findZipEntry(zip, fullPath);
    if (!entry) continue;

    const htmlContent = await safeExtractString(entry);
    const htmlDoc = cheerio.load(htmlContent);

    // Security: strip script, style, navigation, embed elements
    htmlDoc('script, style, svg, nav, noscript, iframe, object, embed').remove();

    // Determine chapter title
    let chapterTitle = hrefToTitleMap[fullPath];
    if (!chapterTitle) {
      const heading = htmlDoc('h1, h2, h3, title').first();
      if (heading.length) {
        chapterTitle = sanitizeText(heading.text());
      }
    }

    // Extract text paragraphs
    const blocks = htmlDoc('h1, h2, h3, h4, p, blockquote, li');
    const rawParagraphs = [];

    if (blocks.length > 0) {
      blocks.each((_, el) => {
        const txt = sanitizeText(htmlDoc(el).text());
        if (txt) rawParagraphs.push(txt);
      });
    } else if (htmlDoc('body').length > 0) {
      const txt = sanitizeText(htmlDoc('body').text());
      if (txt) rawParagraphs.push(txt);
    }

    const wordCount = rawParagraphs.join(' ').split(/\s+/).filter(Boolean).length;
    if (wordCount >= MIN_CHAPTER_WORDS) {
      chapters.push({
        title: chapterTitle || `Chapitre ${chapters.length + 1}`,
        rawParagraphs,
        wordCount
      });
    }
  }

  if (chapters.length === 0) {
    throw new Error('Aucun texte lisible trouvé dans cet EPUB');
  }

  const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
  const slug = bookTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'livre';
  const bookId = `epub-${slug}-${buffer.length}`;

  return {
    id: bookId,
    title: bookTitle,
    author: bookAuthor,
    totalWords,
    chapters
  };
}

export const parseEpubBuffer = parseEpub;

export default parseEpub;
