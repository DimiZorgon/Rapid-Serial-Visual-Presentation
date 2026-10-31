/**
 * Plain text parser service.
 * Memory-safe, zero-disk, input sanitizing.
 */

export function parseText(input, options = {}) {
  let text = '';
  let byteLength = 0;

  if (Buffer.isBuffer(input)) {
    byteLength = input.length;
    if (input.includes(0)) {
      throw new Error('Invalid text file: binary content detected');
    }
    text = input.toString('utf8');
  } else if (typeof input === 'string') {
    if (input.includes('\0')) {
      throw new Error('Invalid text file: binary content detected');
    }
    text = input;
    byteLength = Buffer.byteLength(input, 'utf8');
  } else {
    throw new Error('Invalid text payload');
  }

  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  // Check for empty or whitespace-only content
  if (!text.trim()) {
    throw new Error('Text content is empty');
  }

  // Normalize newlines (\r\n and \r to \n)
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split on double newlines
  const rawSplit = normalized.split(/\n\s*\n+/);
  const rawParagraphs = [];

  for (const rawPara of rawSplit) {
    const cleaned = rawPara.replace(/\s+/g, ' ').trim();
    if (cleaned.length > 0) {
      rawParagraphs.push(cleaned);
    }
  }

  const totalWords = rawParagraphs.join(' ').split(/\s+/).filter(Boolean).length;
  if (totalWords === 0) {
    throw new Error('Text content is empty');
  }

  // Determine title safely
  let rawTitle = '';
  if (typeof options === 'string') {
    rawTitle = options;
  } else if (options && typeof options === 'object') {
    rawTitle = options.title || options.filename || '';
  }

  let title = String(rawTitle).replace(/<[^>]*>/g, '').replace(/[\r\n]+/g, ' ').trim();
  if (title.endsWith('.txt')) {
    title = title.slice(0, -4).trim();
  }

  if (!title && rawParagraphs.length > 0 && rawParagraphs[0].length <= 80 && !/[.!?…]$/.test(rawParagraphs[0])) {
    title = rawParagraphs[0];
  }

  title = title.replace(/<[^>]*>/g, '').replace(/[\r\n]+/g, ' ').trim();

  if (!title) {
    title = 'Document texte';
  }

  // Truncate title to safe length
  if (title.length > 200) {
    title = title.substring(0, 200).trim();
  }

  let author = options && typeof options === 'object' && options.author
    ? String(options.author).replace(/<[^>]*>/g, '').replace(/[\r\n]+/g, ' ').trim()
    : '';
  if (author.length > 200) {
    author = author.substring(0, 200).trim();
  }
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'texte';
  const bookId = `txt-${slug}-${byteLength}`;

  return {
    id: bookId,
    title,
    author,
    totalWords,
    chapters: [
      {
        title,
        rawParagraphs,
        wordCount: totalWords
      }
    ]
  };
}

export function parseTextContent(content, title, author) {
  return parseText(content, { title, author });
}

export default parseText;
