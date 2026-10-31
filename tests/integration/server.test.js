import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { createApp } from '../../server/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

describe('Server Integration & Security Tests', () => {
  let app;

  before(() => {
    app = createApp();
  });

  describe('Security Headers', () => {
    test('enforces strict security headers on health route', async () => {
      const res = await request(app).get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ok');
      assert.ok(res.body.timestamp);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-frame-options'], 'DENY');
      assert.match(res.headers['content-security-policy'], /default-src 'self'/);
      assert.match(res.headers['content-security-policy'], /object-src 'none'/);
      assert.equal(res.headers['x-powered-by'], undefined);
    });

    test('returns 404 with security headers on unknown api route', async () => {
      const res = await request(app).get('/api/nonexistent-route');
      assert.equal(res.status, 404);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-frame-options'], 'DENY');
      assert.ok(res.body.error);
    });
  });

  describe('Text Parsing Endpoint (/api/parse/text)', () => {
    test('parses valid JSON text payload', async () => {
      const res = await request(app)
        .post('/api/parse/text')
        .send({ text: 'Premier paragraphe de test.\n\nDeuxième paragraphe.', title: 'Test Book' });
      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'Test Book');
      assert.equal(res.body.totalWords, 6);
      assert.equal(res.body.chapters.length, 1);
    });

    test('parses valid multipart text file upload', async () => {
      const fixturePath = path.join(FIXTURES_DIR, 'sample_valid.txt');
      const res = await request(app)
        .post('/api/parse/text')
        .attach('file', fixturePath);
      assert.equal(res.status, 200);
      assert.ok(res.body.totalWords > 50);
      assert.equal(res.body.chapters.length, 1);
    });

    test('rejects empty text payload', async () => {
      const res = await request(app)
        .post('/api/parse/text')
        .send({ text: '    ' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /empty/i);
    });

    test('rejects binary text upload with null bytes', async () => {
      const binaryBuffer = Buffer.from([0x48, 0x65, 0x00, 0x6c, 0x6f]); // "He\0lo"
      const res = await request(app)
        .post('/api/parse/text')
        .attach('file', binaryBuffer, { filename: 'binary.txt', contentType: 'text/plain' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /binary content/i);
    });

    test('rejects request with missing text and file', async () => {
      const res = await request(app)
        .post('/api/parse/text')
        .send({});
      assert.equal(res.status, 400);
      assert.match(res.body.error, /manquant|empty/i);
    });
  });

  describe('EPUB Parsing Endpoint (/api/parse/epub)', () => {
    test('rejects non-ZIP file via magic bytes validation', async () => {
      const fakeBuffer = Buffer.from('NOT A ZIP FILE HEADER');
      const res = await request(app)
        .post('/api/parse/epub')
        .attach('file', fakeBuffer, { filename: 'fake.epub', contentType: 'application/epub+zip' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /invalid zip signature/i);
    });

    test('detects and rejects zip slip path traversal attempt', async () => {
      const buf = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_zipslip_epub.epub'));
      const res = await request(app)
        .post('/api/parse/epub')
        .attach('file', buf, { filename: 'slip.epub', contentType: 'application/epub+zip' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /zip slip|path traversal/i);
    });

    test('detects and rejects zip bomb with excessive entries (>500)', async () => {
      const zip = new JSZip();
      for (let i = 0; i < 505; i++) {
        zip.file(`entry_${i}.txt`, 'a');
      }
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      const res = await request(app)
        .post('/api/parse/epub')
        .attach('file', zipBuffer, { filename: 'bomb_entries.epub', contentType: 'application/epub+zip' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /entry count exceeded|entries/i);
    });

    test('rejects EPUB with empty chapters (< 3 words)', async () => {
      const buf = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_empty_chapters.epub'));
      const res = await request(app)
        .post('/api/parse/epub')
        .attach('file', buf, { filename: 'empty.epub', contentType: 'application/epub+zip' });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /aucun texte lisible/i);
    });

    test('rejects request with missing EPUB file', async () => {
      const res = await request(app)
        .post('/api/parse/epub');
      assert.equal(res.status, 400);
      assert.match(res.body.error, /manquant|no file uploaded/i);
    });

    test('parses valid EPUB3 fixture (sample_valid_epub3.epub)', async () => {
      const buf = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_valid_epub3.epub'));
      const res = await request(app)
        .post('/api/parse/epub')
        .attach('file', buf, { filename: 'sample_valid_epub3.epub', contentType: 'application/epub+zip' });

      assert.equal(res.status, 200);
      assert.ok(res.body.title);
      assert.ok(res.body.chapters.length >= 1);
      assert.ok(res.body.totalWords > 10);
    });
  });

  describe('SEO Endpoints (/robots.txt & /sitemap.xml)', () => {
    test('GET /robots.txt serves valid robots.txt with sitemap reference', async () => {
      const res = await request(app).get('/robots.txt');
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], /text\/plain/);
      assert.match(res.text, /User-agent:\s*\*/);
      assert.match(res.text, /Allow:\s*\//);
      assert.match(res.text, /Sitemap:\s*http.*\/sitemap\.xml/);
    });

    test('GET /sitemap.xml serves valid XML sitemap with site url', async () => {
      const res = await request(app).get('/sitemap.xml');
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], /xml/);
      assert.match(res.text, /<\?xml/);
      assert.match(res.text, /<urlset/);
      assert.match(res.text, /<loc>https?:\/\/.*<\/loc>/);
      assert.match(res.text, /<changefreq>weekly<\/changefreq>/);
      assert.match(res.text, /<priority>1\.0<\/priority>/);
    });

    test('uses configured SITE_URL env variable if provided', async () => {
      const original = process.env.SITE_URL;
      try {
        process.env.SITE_URL = 'https://custom-domain.org';
        const resRobots = await request(app).get('/robots.txt');
        assert.match(resRobots.text, /Sitemap:\s*https:\/\/custom-domain\.org\/sitemap\.xml/);

        const resSitemap = await request(app).get('/sitemap.xml');
        assert.match(resSitemap.text, /<loc>https:\/\/custom-domain\.org\/<\/loc>/);
      } finally {
        if (original === undefined) {
          delete process.env.SITE_URL;
        } else {
          process.env.SITE_URL = original;
        }
      }
    });
  });
});
