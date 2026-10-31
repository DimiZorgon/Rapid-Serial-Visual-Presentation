import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { createApp } from '../../server/app.js';
import {
  parseEpub,
  validateZipSignature,
  getZipEntryNames,
  isSafeZipPath,
  resolveRelativePath,
  sanitizeText
} from '../../server/services/epubParser.js';
import { parseText } from '../../server/services/textParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

describe('Adversarial & Stress Verification Suite', () => {
  let app;

  before(() => {
    app = createApp();
  });

  describe('Adversarial Parser Inputs: validateZipSignature & getZipEntryNames', () => {
    test('validateZipSignature rejects various short or invalid buffers', () => {
      assert.throws(() => validateZipSignature(Buffer.alloc(0)), /invalid zip signature/i);
      assert.throws(() => validateZipSignature(Buffer.alloc(1)), /invalid zip signature/i);
      assert.throws(() => validateZipSignature(Buffer.alloc(3)), /invalid zip signature/i);
      assert.throws(() => validateZipSignature(Buffer.from([0x50, 0x4b, 0x05, 0x06])), /invalid zip signature/i);
      assert.throws(() => validateZipSignature(Buffer.from('GIF89a')), /invalid zip signature/i);
      assert.throws(() => validateZipSignature(null), /invalid zip signature/i);
      assert.throws(() => validateZipSignature(undefined), /invalid zip signature/i);
      assert.throws(() => validateZipSignature('string'), /invalid zip signature/i);
    });

    test('getZipEntryNames handles crafted corrupt zip headers without crashing or hanging', () => {
      // Crafted header with nameLen claiming 60000 bytes in a 50 byte buffer
      const buf = Buffer.alloc(50);
      buf.writeUInt32LE(0x04034b50, 0);
      buf.writeUInt16LE(60000, 26);
      buf.writeUInt16LE(60000, 28);
      const names = getZipEntryNames(buf);
      assert.deepEqual(names, []);

      // Multiple signature repetitions without valid extra space
      const multiSig = Buffer.alloc(120);
      for (let i = 0; i < 90; i += 30) {
        multiSig.writeUInt32LE(0x04034b50, i);
        multiSig.writeUInt16LE(0, i + 26);
        multiSig.writeUInt16LE(0, i + 28);
      }
      const extracted = getZipEntryNames(multiSig);
      assert.equal(extracted.length, 3);
      assert.deepEqual(extracted, ['', '', '']);
    });
  });

  describe('Adversarial Path Traversal & Sanitize Checks', () => {
    test('isSafeZipPath blocks diverse path traversal vectors', () => {
      const malicious = [
        '../foo',
        '../../bar',
        'foo/../../bar',
        'a/b/../../../c',
        'C:/windows',
        'D:\\system32',
        '/etc/shadow',
        '\\etc\\passwd',
        '\\\\server\\share\\evil.txt',
        '//127.0.0.1/c$/boot.ini',
        'test\0evil.xml',
        '..',
        '   ',
        '',
        '\n\t'
      ];
      for (const p of malicious) {
        assert.equal(isSafeZipPath(p), false, `Should reject malicious path: ${p}`);
      }

      const safe = [
        'META-INF/container.xml',
        'OEBPS/content.opf',
        'text/ch1.xhtml',
        'mimetype',
        'images/cover.jpg'
      ];
      for (const p of safe) {
        assert.equal(isSafeZipPath(p), true, `Should accept safe path: ${p}`);
      }
    });

    test('resolveRelativePath prevents escaping root directory', () => {
      assert.equal(resolveRelativePath('OEBPS/content.opf', '../../evil.txt'), '');
      assert.equal(resolveRelativePath('OEBPS/content.opf', '/root.xml'), '');
      assert.equal(resolveRelativePath('OEBPS/content.opf', 'C:/evil.xml'), '');
      assert.equal(resolveRelativePath('OEBPS/content.opf', '..\\..\\evil.txt'), '');
      assert.equal(resolveRelativePath('OEBPS/content.opf', 'ch1.xhtml#fragment'), 'OEBPS/ch1.xhtml');
      assert.equal(resolveRelativePath('OEBPS/content.opf', 'ch1.xhtml?query=param'), 'OEBPS/ch1.xhtml');
      assert.equal(resolveRelativePath('OEBPS/content.opf', '%2e%2e/%2e%2e/escaped.xml'), '');
    });

    test('sanitizeText strips dangerous tags and scripts', () => {
      assert.equal(sanitizeText('<script>alert("xss")</script>Hello'), 'Hello');
      assert.equal(sanitizeText('<style>body{color:red}</style>World'), 'World');
      assert.equal(sanitizeText('<svg onload="alert(1)">Test</svg>'), 'Test');
      assert.equal(sanitizeText('<a href="javascript:alert(1)">Click</a>'), 'Click');
      assert.equal(sanitizeText('<iframe src="http://evil.com"></iframe>Safe'), 'Safe');
      assert.equal(sanitizeText('alert(123) Remaining text'), 'Remaining text');
      assert.equal(sanitizeText(null), '');
      assert.equal(sanitizeText(undefined), '');
      assert.equal(sanitizeText(123), '');
    });
  });

  describe('Adversarial Text Parsing (parseText)', () => {
    test('rejects non-string and non-buffer types', () => {
      assert.throws(() => parseText(null), /invalid text payload/i);
      assert.throws(() => parseText(undefined), /invalid text payload/i);
      assert.throws(() => parseText(12345), /invalid text payload/i);
      assert.throws(() => parseText({}), /invalid text payload/i);
      assert.throws(() => parseText([]), /invalid text payload/i);
    });

    test('rejects empty or whitespace-only inputs', () => {
      assert.throws(() => parseText(''), /empty/i);
      assert.throws(() => parseText('     '), /empty/i);
      assert.throws(() => parseText('\n\n\r\t   \n'), /empty/i);
      assert.throws(() => parseText(Buffer.alloc(0)), /empty/i);
      assert.throws(() => parseText(Buffer.from('   \n  \t')), /empty/i);
    });

    test('rejects binary content containing null bytes', () => {
      assert.throws(() => parseText('Hello\0World'), /binary content detected/i);
      assert.throws(() => parseText(Buffer.from([0x00, 0x41, 0x42])), /binary content detected/i);
      assert.throws(() => parseText(Buffer.from([0x41, 0x42, 0x00])), /binary content detected/i);
    });

    test('handles extreme input sizes and long unbroken strings safely', () => {
      // 10,000 double newlines
      const thousandsNewlines = 'Start\n' + '\n\n'.repeat(5000) + 'End';
      const result1 = parseText(thousandsNewlines);
      assert.equal(result1.chapters[0].rawParagraphs.length, 2);
      assert.equal(result1.totalWords, 2);

      // 10,000 char unbroken word
      const longWord = 'A'.repeat(10000);
      const result2 = parseText(longWord);
      assert.equal(result2.totalWords, 1);
      assert.equal(result2.title, 'Document texte');
    });

    test('sanitizes HTML from title and bounds title length', () => {
      const xssTitle = '<script>alert("pwnd")</script><img src=x onerror=alert(1)>Titre Valide';
      const result = parseText('Contenu du paragraphe pour tester.', { title: xssTitle });
      assert.ok(!result.title.includes('<script>'));
      assert.ok(!result.title.includes('onerror'));
      assert.ok(result.title.includes('Titre Valide'));

      const longTitle = 'X'.repeat(300);
      const resultLong = parseText('Contenu du livre.', { title: longTitle });
      assert.ok(resultLong.title.length <= 200);
    });
  });

  describe('Adversarial EPUB Parsing (parseEpub)', () => {
    test('rejects empty and short buffers', async () => {
      await assert.rejects(() => parseEpub(Buffer.alloc(0)), /invalid zip signature/i);
      await assert.rejects(() => parseEpub(Buffer.alloc(3)), /invalid zip signature/i);
      await assert.rejects(() => parseEpub(Buffer.alloc(4)), /invalid zip signature/i);
    });

    test('rejects truncated zip starting with PK\\x03\\x04', async () => {
      const truncated = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00]);
      await assert.rejects(() => parseEpub(truncated), /corrupt or unreadable/i);
    });

    test('rejects zip missing container.xml', async () => {
      const zip = new JSZip();
      zip.file('mimetype', 'application/epub+zip');
      zip.file('dummy.txt', 'Pas de container.xml ici');
      const buf = await zip.generateAsync({ type: 'nodebuffer' });
      await assert.rejects(() => parseEpub(buf), /container\.xml manquant/i);
    });

    test('rejects EPUB with invalid/empty container.xml', async () => {
      const zip = new JSZip();
      zip.file('META-INF/container.xml', '<?xml version="1.0"?><container></container>');
      const buf = await zip.generateAsync({ type: 'nodebuffer' });
      await assert.rejects(() => parseEpub(buf), /structure opf introuvable/i);
    });

    test('rejects EPUB with OPF full-path pointing outside archive (Zip slip)', async () => {
      const zip = new JSZip();
      zip.file('META-INF/container.xml', `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="../../etc/passwd" media-type="application/oebps-package+xml"/>
          </rootfiles>
        </container>`);
      const buf = await zip.generateAsync({ type: 'nodebuffer' });
      await assert.rejects(() => parseEpub(buf), /zip slip/i);
    });

    test('rejects EPUB where OPF file is not present in archive', async () => {
      const zip = new JSZip();
      zip.file('META-INF/container.xml', `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles>
            <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
          </rootfiles>
        </container>`);
      const buf = await zip.generateAsync({ type: 'nodebuffer' });
      await assert.rejects(() => parseEpub(buf), /fichier opf introuvable/i);
    });

    test('rejects EPUB with no readable chapters (all under 3 words)', async () => {
      const emptyChapPath = path.join(FIXTURES_DIR, 'sample_empty_chapters.epub');
      const buf = fs.readFileSync(emptyChapPath);
      await assert.rejects(() => parseEpub(buf), /aucun texte lisible trouvé/i);
    });

    test('rejects zip bomb with excessive entries (>500)', async () => {
      const zip = new JSZip();
      for (let i = 0; i < 505; i++) {
        zip.file(`entry_${i}.txt`, 'a');
      }
      const buf = await zip.generateAsync({ type: 'nodebuffer' });
      await assert.rejects(() => parseEpub(buf), /zip bomb defense: entry count exceeded/i);
    });

    test('rejects zip slip archive', async () => {
      const zipSlipPath = path.join(FIXTURES_DIR, 'sample_zipslip_epub.epub');
      const buf = fs.readFileSync(zipSlipPath);
      await assert.rejects(() => parseEpub(buf), /zip slip path traversal/i);
    });
  });

  describe('Adversarial HTTP Server Endpoints', () => {
    test('POST /api/health returns 404 with security headers', async () => {
      const res = await request(app).post('/api/health');
      assert.equal(res.status, 404);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-frame-options'], 'DENY');
    });

    test('POST /api/parse/text with invalid JSON body returns 400', async () => {
      const res = await request(app)
        .post('/api/parse/text')
        .set('Content-Type', 'application/json')
        .send('{"text": "broken json');
      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    test('POST /api/parse/text with invalid payload types returns 400', async () => {
      const res1 = await request(app).post('/api/parse/text').send({});
      assert.equal(res1.status, 400);

      const res2 = await request(app).post('/api/parse/text').send({ text: '' });
      assert.equal(res2.status, 400);

      const res3 = await request(app).post('/api/parse/text').send({ text: '    ' });
      assert.equal(res3.status, 400);

      const res4 = await request(app).post('/api/parse/text').send({ text: 12345 });
      assert.equal(res4.status, 400);

      const res5 = await request(app).post('/api/parse/text').send({ text: 'Test\0Binary' });
      assert.equal(res5.status, 400);
    });

    test('POST /api/parse/text multipart rejects invalid file types (.exe, .pdf)', async () => {
      const res = await request(app)
        .post('/api/parse/text')
        .attach('file', Buffer.from('console.log("hello")'), 'script.exe');
      assert.equal(res.status, 400);
      assert.match(res.body.error, /seuls les fichiers texte/i);
    });

    test('POST /api/parse/text multipart rejects empty file', async () => {
      const res = await request(app)
        .post('/api/parse/text')
        .attach('file', Buffer.alloc(0), 'empty.txt');
      assert.equal(res.status, 400);
      assert.match(res.body.error, /empty/i);
    });

    test('POST /api/parse/epub multipart rejects non-epub extension/mimetype', async () => {
      const res = await request(app)
        .post('/api/parse/epub')
        .attach('file', Buffer.from('hello world'), 'sample.jpg');
      assert.equal(res.status, 400);
      assert.match(res.body.error, /seuls les fichiers \.epub sont acceptés/i);
    });

    test('POST /api/parse/epub multipart rejects 0-byte file', async () => {
      const res = await request(app)
        .post('/api/parse/epub')
        .attach('file', Buffer.alloc(0), 'empty.epub');
      assert.equal(res.status, 400);
      assert.match(res.body.error, /invalid zip signature/i);
    });

    test('POST /api/parse/epub multipart rejects corrupt PK header', async () => {
      const res = await request(app)
        .post('/api/parse/epub')
        .attach('file', Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x01]), 'corrupt.epub');
      assert.equal(res.status, 400);
      assert.match(res.body.error, /corrupt or unreadable/i);
    });

    test('POST /api/parse/epub without file field returns 400', async () => {
      const res = await request(app)
        .post('/api/parse/epub')
        .send({ dummy: 'no file' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /fichier epub manquant/i);
    });

    test('POST /api/parse/epub successfully handles valid EPUB3 fixture', async () => {
      const epubPath = path.join(FIXTURES_DIR, 'sample_valid_epub3.epub');
      const res = await request(app)
        .post('/api/parse/epub')
        .attach('file', epubPath);
      assert.equal(res.status, 200);
      assert.ok(res.body.id.startsWith('epub-'));
      assert.ok(res.body.title);
      assert.ok(res.body.chapters.length >= 2);
      assert.ok(res.body.totalWords > 0);
    });

    test('enforces security headers across both success and error responses', async () => {
      const resSuccess = await request(app).get('/api/health');
      assert.equal(resSuccess.status, 200);
      assert.equal(resSuccess.headers['x-content-type-options'], 'nosniff');
      assert.equal(resSuccess.headers['x-frame-options'], 'DENY');

      const resError = await request(app).get('/api/unknown-endpoint');
      assert.equal(resError.status, 404);
      assert.equal(resError.headers['x-content-type-options'], 'nosniff');
      assert.equal(resError.headers['x-frame-options'], 'DENY');
    });
  });
});
