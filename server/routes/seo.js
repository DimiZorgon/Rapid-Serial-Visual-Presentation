import { Router } from 'express';

export function createSeoRouter() {
  const router = Router();

  router.get('/robots.txt', (req, res) => {
    const siteUrl = (process.env.SITE_URL || 'https://rapide-lecture.noullez.com').replace(/\/+$/, '');
    res.type('text/plain');
    res.send(`User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
  });

  router.get('/sitemap.xml', (req, res) => {
    const siteUrl = (process.env.SITE_URL || 'https://rapide-lecture.noullez.com').replace(/\/+$/, '');
    res.type('application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
  });

  return router;
}

export default createSeoRouter;
