import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseText } from '../../server/services/textParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

describe('textParser Unit Tests', () => {
  test('parses simple text into valid BookJSON structure', () => {
    const content = 'Premier paragraphe de test.\n\nDeuxième paragraphe de test.';
    const result = parseText(content, { title: 'Test Document' });

    assert.ok(result.id.startsWith('txt-test-document-'));
    assert.equal(result.title, 'Test Document');
    assert.equal(result.author, '');
    assert.equal(result.chapters.length, 1);
    assert.equal(result.chapters[0].rawParagraphs.length, 2);
    assert.equal(result.chapters[0].rawParagraphs[0], 'Premier paragraphe de test.');
    assert.equal(result.chapters[0].rawParagraphs[1], 'Deuxième paragraphe de test.');
    assert.equal(result.totalWords, 8);
    assert.equal(result.chapters[0].wordCount, 8);
  });

  test('normalizes carriage returns (\\r\\n and \\r)', () => {
    const crlfText = 'Paragraphe 1\r\nsuite 1\r\n\r\nParagraphe 2\rsuite 2';
    const result = parseText(crlfText);

    assert.equal(result.chapters[0].rawParagraphs.length, 2);
    assert.equal(result.chapters[0].rawParagraphs[0], 'Paragraphe 1 suite 1');
    assert.equal(result.chapters[0].rawParagraphs[1], 'Paragraphe 2 suite 2');
  });

  test('removes UTF-8 BOM character (\\uFEFF)', () => {
    const bomText = '\uFEFFMon titre sans BOM\n\nContenu du document avec du texte.';
    const result = parseText(bomText);

    assert.ok(!result.chapters[0].rawParagraphs[0].includes('\uFEFF'));
    assert.equal(result.title, 'Mon titre sans BOM');
  });

  test('detects and rejects binary content containing null bytes in string', () => {
    assert.throws(
      () => parseText('Texte avec octet\0nul'),
      /binary content detected/i
    );
  });

  test('detects and rejects binary content containing null bytes in buffer', () => {
    const binaryBuf = Buffer.from([0x48, 0x65, 0x00, 0x6c, 0x6c, 0x6f]);
    assert.throws(
      () => parseText(binaryBuf),
      /binary content detected/i
    );
  });

  test('rejects empty or whitespace-only text', () => {
    assert.throws(
      () => parseText('   \n\n\t  \r\n   '),
      /empty/i
    );
    assert.throws(
      () => parseText(Buffer.alloc(0)),
      /empty/i
    );
  });

  test('sanitizes HTML tags from title', () => {
    const textWithHtml = 'Paragraphe unique pour tester le titre.';
    const result = parseText(textWithHtml, { title: '<script>alert(1)</script>Mon Livre' });

    assert.ok(!result.title.includes('<script>'));
    assert.ok(result.title.includes('Mon Livre'));
  });

  test('sanitizes HTML tags from inferred title', () => {
    const text = '<script>alert(1)</script>Titre Auto\n\nDeuxieme paragraphe.';
    const result = parseText(text);

    assert.ok(!result.title.includes('<script>'));
    assert.ok(!result.title.includes('</script>'));
    assert.ok(result.title.includes('Titre Auto'));
  });

  test('sanitizes HTML tags from author field', () => {
    const text = 'Paragraphe pour test auteur.';
    const result = parseText(text, { author: '<script>alert(1)</script>Victor Hugo' });

    assert.ok(!result.author.includes('<script>'));
    assert.ok(!result.author.includes('</script>'));
    assert.ok(result.author.includes('Victor Hugo'));
  });

  test('extracts title from filename when title is omitted', () => {
    const text = 'Voici un texte ordinaire avec plusieurs mots.';
    const result = parseText(text, { filename: 'mon_fichier_test.txt' });

    assert.equal(result.title, 'mon_fichier_test');
  });

  test('parses real valid fixture file correctly', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'sample_valid.txt');
    const content = fs.readFileSync(fixturePath);
    const result = parseText(content, { filename: 'sample_valid.txt' });

    assert.ok(result.totalWords > 50);
    assert.equal(result.chapters.length, 1);
    assert.ok(result.chapters[0].rawParagraphs.length >= 3);
  });

  test('rejects empty fixture file', () => {
    const fixturePath = path.join(FIXTURES_DIR, 'sample_empty.txt');
    const content = fs.readFileSync(fixturePath);

    assert.throws(
      () => parseText(content, { filename: 'sample_empty.txt' }),
      /empty/i
    );
  });
});
