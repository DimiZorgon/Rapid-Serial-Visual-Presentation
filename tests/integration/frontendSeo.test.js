import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import * as cheerio from "cheerio";
import { createApp } from "../../server/app.js";

const ROOT_DIR = path.resolve(import.meta.dirname, "../..");
const CLIENT_INDEX = path.join(ROOT_DIR, "client/index.html");
const DIST_INDEX = path.join(ROOT_DIR, "dist/index.html");

describe("Frontend SEO, Google Indexing & Production Build Suite", () => {
  const app = createApp();

  test("client/index.html and dist/index.html contain complete Google SEO tags", () => {
    assert.ok(fs.existsSync(CLIENT_INDEX), "client/index.html exists");
    assert.ok(fs.existsSync(DIST_INDEX), "dist/index.html exists");

    const clientHtml = fs.readFileSync(CLIENT_INDEX, "utf8");
    const $ = cheerio.load(clientHtml);

    // 1. Language & Title
    assert.equal($("html").attr("lang"), "fr", "HTML lang is 'fr'");
    assert.equal($("title").text(), "Liseuse Rapide RSVP — Lecture Rapide en Ligne & EPUB");

    // 2. Canonical URL
    assert.equal($('link[rel="canonical"]').attr("href"), "https://rapide-lecture.noullez.com/");

    // 3. Meta Description & Keywords
    assert.match($('meta[name="description"]').attr("content"), /RSVP/i);
    const keywords = $('meta[name="keywords"]').attr("content");
    assert.match(keywords, /Lecture rapide/i);
    assert.match(keywords, /epub/i);
    assert.match(keywords, /liseuse/i);

    // 4. Open Graph
    assert.equal($('meta[property="og:type"]').attr("content"), "website");
    assert.equal($('meta[property="og:url"]').attr("content"), "https://rapide-lecture.noullez.com/");
    assert.equal($('meta[property="og:locale"]').attr("content"), "fr_FR");
    assert.ok($('meta[property="og:title"]').attr("content"));
    assert.ok($('meta[property="og:image"]').attr("content"));

    // 5. Twitter Card
    assert.equal($('meta[name="twitter:card"]').attr("content"), "summary_large_image");
    assert.ok($('meta[name="twitter:title"]').attr("content"));
    assert.ok($('meta[name="twitter:image"]').attr("content"));

    // 6. JSON-LD Structured Data
    const jsonLdScript = $('script[type="application/ld+json"]').html();
    assert.ok(jsonLdScript, "JSON-LD script present");
    const jsonLd = JSON.parse(jsonLdScript);
    assert.equal(jsonLd["@type"], "WebApplication");
    assert.equal(jsonLd.inLanguage, "fr");
    assert.equal(jsonLd.url, "https://rapide-lecture.noullez.com/");

    // 7. Favicon & Manifest
    assert.equal($('link[rel="icon"]').attr("href"), "/favicon.svg");
    assert.equal($('link[rel="manifest"]').attr("href"), "/site.webmanifest");

    // 8. Zero External CDNs in production
    assert.equal($('script[src*="cdn.tailwindcss.com"]').length, 0, "No Tailwind CDN script");
    assert.equal($('script[src*="cdnjs.cloudflare.com"]').length, 0, "No external JSZip CDN script");
  });

  test("GET / serves compiled dist/index.html with security headers", async () => {
    const res = await request(app).get("/").expect(200);
    assert.match(res.headers["content-type"], /html/);
    assert.match(res.text, /Liseuse Rapide RSVP/);
    assert.ok(res.headers["x-content-type-options"], "nosniff header present");
  });

  test("GET /favicon.svg and /site.webmanifest are served properly", async () => {
    const favRes = await request(app).get("/favicon.svg").expect(200);
    assert.match(favRes.headers["content-type"], /svg/);

    const manifestRes = await request(app).get("/site.webmanifest").expect(200);
    const manifest = JSON.parse(manifestRes.text);
    assert.equal(manifest.name, "Liseuse Rapide RSVP");
    assert.equal(manifest.display, "standalone");
  });

  test("Raspberry Pi & Deployment configuration checks", () => {
    // 1. Trust proxy in express app
    assert.equal(app.get("trust proxy"), 1, "trust proxy enabled in Express app");

    // 2. Package.json engines
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
    assert.ok(pkg.engines && pkg.engines.node, "engines.node specified");

    // 3. DEPLOY.md exists and covers Nginx and Cloudflared
    const deployDoc = fs.readFileSync(path.join(ROOT_DIR, "DEPLOY.md"), "utf8");
    assert.match(deployDoc, /Raspberry Pi/i);
    assert.match(deployDoc, /rapide-lecture\.noullez\.com/i);
    assert.match(deployDoc, /client_max_body_size 30M/i);
    assert.match(deployDoc, /cloudflared/i);
    assert.match(deployDoc, /rsvp-reader\.service/i);
  });
});
