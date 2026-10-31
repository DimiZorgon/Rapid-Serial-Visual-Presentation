import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import JSZip from 'jszip';
import { createApp } from '../server/app.js';
import { parseEpub, isSafeZipPath, resolveRelativePath } from '../server/services/epubParser.js';
import { parseText } from '../server/services/textParser.js';

describe('Milestone 1 Adversarial Challenge Suite', () => {
  let app;

  before(() => {
    app = createApp();
  });

  describe('1. Zip Slip Bypasses & Path Traversal', () => {
    test('isSafeZipPath blocks diverse path traversal vectors', () => {
      const maliciousPaths = [
        '../evil.txt',
        '..\\evil.txt',
        'foo/../../evil.txt',
        'foo\\..\\..\\evil.txt',
        '/etc/passwd',
        '\\windows\\system32',
        'C:/boot.ini',
        'C:\\boot.ini',
        'D:file.txt',
        '\0evil.txt',
        'a/\0/b.txt',
        '..',
        '/root',
        'foo/bar/../../../root.txt'
      ];

      for (const p of maliciousPaths) {
        assert.equal(isSafeZipPath(p), false, `Path should be blocked: ${p}`);
      }
    });

    test('resolveRelativePath blocks directory traversal escapes outside archive root', () => {
      const escapeAttempts = [
        ['base/path.opf', '../../secret.txt'],
        ['base/path.opf', '%2e%2e%2f%2e%2e%2fsecret.txt'],
        ['base/path.opf', '/root/secret.txt'],
        ['base/path.opf', 'C:/secret.txt'],
        ['base/path.opf', '..\\..\\secret.txt'],
        ['base/path.opf', 'sub/\0evil.txt']
      ];

      for (const [base, href] of escapeAttempts) {
        const resolved = resolveRelativePath(base, href);
        assert.equal(resolved, '', `Escape attempt should resolve to empty string: ${href}`);
      }
    });

    test('resolveRelativePath allows safe internal relative navigation', () => {
      assert.equal(resolveRelativePath('base/path.opf', '../secret.txt'), 'secret.txt');
      assert.equal(resolveRelativePath('base/path.opf', 'chapter1.xhtml'), 'base/chapter1.xhtml');
    });

    test('EPUB archive with Zip Slip in container.xml rootfile is rejected', async () => {
      const zip = new JSZip();
      zip.file('mimetype', 'application/epub+zip');
      zip.file('META-INF/container.xml', `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles><rootfile full-path="../../etc/passwd"/></rootfiles>
        </container>`);
      const buf = await zip.generateAsync({ type: 'nodebuffer' });

      await assert.rejects(
        () => parseEpub(buf),
        /Zip Slip|path traversal/i
      );
    });

    test('EPUB archive with manifest href Zip Slip is rejected', async () => {
      const zip = new JSZip();
      zip.file('mimetype', 'application/epub+zip');
      zip.file('META-INF/container.xml', `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles>
        </container>`);
      zip.file('OEBPS/content.opf', `<?xml version="1.0"?>
        <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
          <manifest><item id="c1" href="../../secret.xhtml" media-type="application/xhtml+xml"/></manifest>
          <spine><itemref idref="c1"/></spine>
        </package>`);
      const buf = await zip.generateAsync({ type: 'nodebuffer' });

      await assert.rejects(
        () => parseEpub(buf),
        /Zip Slip|path traversal/i
      );
    });

    test('EPUB archive with URL-encoded manifest href Zip Slip is rejected', async () => {
      const zip = new JSZip();
      zip.file('mimetype', 'application/epub+zip');
      zip.file('META-INF/container.xml', `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles>
        </container>`);
      zip.file('OEBPS/content.opf', `<?xml version="1.0"?>
        <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
          <manifest><item id="c1" href="%2e%2e%2f%2e%2e%2fsecret.xhtml" media-type="application/xhtml+xml"/></manifest>
          <spine><itemref idref="c1"/></spine>
        </package>`);
      const buf = await zip.generateAsync({ type: 'nodebuffer' });

      await assert.rejects(
        () => parseEpub(buf),
        /Zip Slip|path traversal/i
      );
    });
  });

  describe('2. Zip Bomb Thresholds', () => {
    test('rejects archive with 501 entries (exceeding MAX_ZIP_ENTRIES = 500)', async () => {
      const zip = new JSZip();
      zip.file('mimetype', 'application/epub+zip');
      for (let i = 0; i < 501; i++) {
        zip.file(`dummy_${i}.txt`, 'x');
      }
      const buf = await zip.generateAsync({ type: 'nodebuffer' });

      await assert.rejects(
        () => parseEpub(buf),
        /Zip bomb defense: entry count exceeded/i
      );
    });

    test('rejects archive when cumulative extracted bytes exceed MAX_UNCOMPRESSED_BYTES (100MB)', async () => {
      const zip = new JSZip();
      zip.file('mimetype', 'application/epub+zip');
      zip.file('META-INF/container.xml', `<?xml version="1.0"?>
        <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
          <rootfiles><rootfile full-path="content.opf"/></rootfiles>
        </container>`);
      zip.file('content.opf', `<?xml version="1.0"?>
        <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
          <manifest><item id="c1" href="large.xhtml" media-type="application/xhtml+xml"/></manifest>
          <spine><itemref idref="c1"/></spine>
        </package>`);
      const hugeText = 'mot '.repeat(26 * 1024 * 1024);
      zip.file('large.xhtml', `<html><body><p>${hugeText}</p></body></html>`);
      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

      await assert.rejects(
        () => parseEpub(buf),
        /decompressed size exceeded/i
      );
    });
  });

  describe('3. Non-Text & Script Injection in Text Parser', () => {
    test('rejects binary file containing null bytes (buffer & string)', () => {
      assert.throws(() => parseText(Buffer.from([0x00, 0x41, 0x42])), /binary content detected/i);
      assert.throws(() => parseText('Bonjour\0Monde'), /binary content detected/i);
    });

    test('rejects non-string/non-buffer inputs', () => {
      assert.throws(() => parseText(12345), /Invalid text payload/i);
      assert.throws(() => parseText(null), /Invalid text payload/i);
      assert.throws(() => parseText({}), /Invalid text payload/i);
      assert.throws(() => parseText([]), /Invalid text payload/i);
    });

    test('sanitizes explicit title containing script/html tags', () => {
      const res = parseText('Contenu texte valide avec plusieurs mots ici.', {
        title: '<script>alert("XSS")</script>Mon Livre Securise'
      });
      assert.ok(!res.title.includes('<script>'));
      assert.ok(!res.title.includes('</script>'));
      assert.ok(res.title.includes('Mon Livre Securise'));
    });

    test('sanitizes HTML tags from inferred title', () => {
      const text = '<script>alert("XSS")</script>\n\nDeuxième paragraphe ordinaire.';
      const res = parseText(text);
      assert.ok(!res.title.includes('<script>'));
      assert.ok(!res.title.includes('</script>'));
    });

    test('sanitizes HTML tags from author field', () => {
      const text = 'Contenu de test pour verifier auteur.';
      const res = parseText(text, { author: '<script>alert("author")</script>' });
      assert.ok(!res.author.includes('<script>'));
      assert.ok(!res.author.includes('</script>'));
    });
  });

  describe('4. Security Headers (Helmet)', () => {
    test('verifies all required security headers on API responses', async () => {
      const res = await request(app).get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-frame-options'], 'DENY');
      assert.equal(res.headers['x-powered-by'], undefined);
      assert.match(res.headers['content-security-policy'], /default-src 'self'/);
      assert.match(res.headers['content-security-policy'], /object-src 'none'/);
      assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
    });

    test('verifies security headers on 404 responses', async () => {
      const res = await request(app).get('/api/does-not-exist');
      assert.equal(res.status, 404);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-frame-options'], 'DENY');
    });

    test('verifies security headers on 400 error responses', async () => {
      const res = await request(app).post('/api/parse/text').send({});
      assert.equal(res.status, 400);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-frame-options'], 'DENY');
    });
  });

  describe('5. Rejection of Oversized Uploads', () => {
    test('rejects EPUB upload exceeding 30MB limit via Multer', async () => {
      const bigBuffer = Buffer.alloc(31 * 1024 * 1024);
      bigBuffer[0] = 0x50;
      bigBuffer[1] = 0x4B;
      bigBuffer[2] = 0x03;
      bigBuffer[3] = 0x04;

      const res = await request(app)
        .post('/api/parse/epub')
        .attach('file', bigBuffer, { filename: 'too_large.epub', contentType: 'application/epub+zip' });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /too large|30MB/i);
    });

    test('rejects text upload exceeding 10MB limit via Multer', async () => {
      const bigText = Buffer.alloc(11 * 1024 * 1024, 0x41);

      const res = await request(app)
        .post('/api/parse/text')
        .attach('file', bigText, { filename: 'too_large.txt', contentType: 'text/plain' });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /too large|file too large|upload error/i);
    });

    test('rejects excessive file count (> 1 file)', async () => {
      const res = await request(app)
        .post('/api/parse/text')
        .attach('file', Buffer.from('Texte 1'), 'f1.txt')
        .attach('file', Buffer.from('Texte 2'), 'f2.txt');

      assert.equal(res.status, 400);
    });
  });
});
