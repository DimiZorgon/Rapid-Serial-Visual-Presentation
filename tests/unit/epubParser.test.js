import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import {
  parseEpub,
  validateZipSignature,
  isSafeZipPath,
  resolveRelativePath
} from '../../server/services/epubParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

describe('epubParser Unit Tests', () => {
  describe('Path Safety & Zip Slip Utilities', () => {
    test('isSafeZipPath allows safe relative paths', () => {
      assert.equal(isSafeZipPath('META-INF/container.xml'), true);
      assert.equal(isSafeZipPath('OEBPS/chapters/ch1.xhtml'), true);
      assert.equal(isSafeZipPath('mimetype'), true);
    });

    test('isSafeZipPath rejects path traversal and absolute paths', () => {
      assert.equal(isSafeZipPath('../evil.txt'), false);
      assert.equal(isSafeZipPath('../../etc/passwd'), false);
      assert.equal(isSafeZipPath('/absolute/path.xml'), false);
      assert.equal(isSafeZipPath('C:\\windows\\system32'), false);
      assert.equal(isSafeZipPath('test\0null.txt'), false);
      assert.equal(isSafeZipPath(''), false);
    });

    test('resolveRelativePath correctly resolves and prevents escape', () => {
      assert.equal(resolveRelativePath('OEBPS/content.opf', 'chap1.xhtml'), 'OEBPS/chap1.xhtml');
      assert.equal(resolveRelativePath('OEBPS/content.opf', 'text/chap1.xhtml'), 'OEBPS/text/chap1.xhtml');
      assert.equal(resolveRelativePath('OEBPS/text/chap1.xhtml', '../chap2.xhtml'), 'OEBPS/chap2.xhtml');
      assert.equal(resolveRelativePath('OEBPS/content.opf', '../../evil.txt'), '');
      assert.equal(resolveRelativePath('content.opf', '/absolute.xhtml'), '');
    });

    test('resolveRelativePath handles malformed URI encoding safely without throwing URIError', () => {
      assert.doesNotThrow(() => resolveRelativePath('OEBPS/content.opf', '%ZZ/chap.xhtml'));
      assert.equal(resolveRelativePath('OEBPS/content.opf', '%ZZ/chap.xhtml'), '');
      assert.equal(resolveRelativePath('OEBPS/content.opf', '%ZZ/../../escape.xhtml'), '');
    });
  });

  describe('Magic Bytes Validation', () => {
    test('accepts valid ZIP magic bytes (PK\\x03\\x04)', () => {
      const validMagic = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00]);
      assert.doesNotThrow(() => validateZipSignature(validMagic));
    });

    test('rejects non-ZIP buffer or short buffer', () => {
      assert.throws(() => validateZipSignature(Buffer.from('NOT')), /invalid zip signature/i);
      assert.throws(() => validateZipSignature(Buffer.from('HELLO WORLD')), /invalid zip signature/i);
      assert.throws(() => validateZipSignature(null), /invalid zip signature/i);
    });

    test('rejects sample_invalid_magic.epub fixture', async () => {
      const buf = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_invalid_magic.epub'));
      await assert.rejects(
        () => parseEpub(buf),
        /invalid zip signature/i
      );
    });
  });

  describe('Security & Malicious Archives', () => {
    test('rejects Zip Slip archive via sample_zipslip_epub.epub fixture', async () => {
      const buf = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_zipslip_epub.epub'));
      await assert.rejects(
        () => parseEpub(buf),
        /zip slip|path traversal/i
      );
    });

    test('rejects archive with excessive entries (> 500)', async () => {
      const zip = new JSZip();
      for (let i = 0; i < 505; i++) {
        zip.file(`dummy_${i}.txt`, 'x');
      }
      const buf = await zip.generateAsync({ type: 'nodebuffer' });
      await assert.rejects(
        () => parseEpub(buf),
        /entry count exceeded|entries/i
      );
    });

    test('rejects decompressed size exceeding limit', async () => {
      const zip = new JSZip();
      zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
      zip.file('META-INF/container.xml', `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles><rootfile full-path="content.opf"/></rootfiles>
        </container>`);
      zip.file('content.opf', `<?xml version="1.0"?>
        <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
          <manifest><item id="c1" href="large.xhtml" media-type="application/xhtml+xml"/></manifest>
          <spine><itemref idref="c1"/></spine>
        </package>`);
      // 101MB of repeated text
      const hugeText = 'mot '.repeat(26 * 1024 * 1024);
      zip.file('large.xhtml', `<html><body><p>${hugeText}</p></body></html>`);
      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

      await assert.rejects(
        () => parseEpub(buf),
        /decompressed size exceeded/i
      );
    });

    test('rejects EPUB missing container.xml', async () => {
      const zip = new JSZip();
      zip.file('mimetype', 'application/epub+zip');
      zip.file('somefile.txt', 'random');
      const buf = await zip.generateAsync({ type: 'nodebuffer' });

      await assert.rejects(
        () => parseEpub(buf),
        /container\.xml manquant/i
      );
    });

    test('rejects EPUB with empty chapters (< 3 words)', async () => {
      const buf = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_empty_chapters.epub'));
      await assert.rejects(
        () => parseEpub(buf),
        /aucun texte lisible/i
      );
    });
  });

  describe('Valid EPUB Parsing & Sanitization', () => {
    test('parses EPUB2 fixture (sample_valid_epub2.epub)', async () => {
      const buf = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_valid_epub2.epub'));
      const result = await parseEpub(buf, 'sample_valid_epub2.epub');

      assert.ok(result.id.startsWith('epub-'));
      assert.ok(result.title);
      assert.ok(result.chapters.length >= 1);
      assert.ok(result.totalWords > 10);
      assert.ok(result.chapters[0].rawParagraphs.length >= 1);
    });

    test('parses EPUB3 fixture (sample_valid_epub3.epub)', async () => {
      const buf = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_valid_epub3.epub'));
      const result = await parseEpub(buf, 'sample_valid_epub3.epub');

      assert.ok(result.id.startsWith('epub-'));
      assert.ok(result.title);
      assert.ok(result.chapters.length >= 1);
      assert.ok(result.totalWords > 10);
      assert.ok(result.chapters[0].rawParagraphs.length >= 1);
    });

    test('sanitizes scripts and styles from EPUB content (sample_xss_epub.epub)', async () => {
      const buf = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_xss_epub.epub'));
      const result = await parseEpub(buf, 'sample_xss_epub.epub');

      for (const chapter of result.chapters) {
        for (const para of chapter.rawParagraphs) {
          assert.ok(!para.includes('<script>'));
          assert.ok(!para.includes('alert('));
          assert.ok(!para.includes('<style>'));
        }
      }
    });
  });
});
