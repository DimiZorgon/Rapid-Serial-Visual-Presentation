import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { configureSecurityHeaders } from './middleware/security.js';
import apiRouter from './routes/api.js';
import createSeoRouter from './routes/seo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  // 1. Disable x-powered-by & enable trust proxy
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // 2. Security Headers (Helmet)
  app.use(configureSecurityHeaders());

  // 3. Body Parsing
  app.use(express.json({ limit: '30mb' }));
  app.use(express.urlencoded({ extended: true, limit: '30mb' }));

  // 4. Static Client Serving
  const distPath = path.resolve(__dirname, '../dist');
  app.use(express.static(distPath));

  // 5. SEO Endpoints
  app.use('/', createSeoRouter());

  // 6. API Endpoints
  app.use('/api', apiRouter);

  // 6. Unknown API 404 Handler
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint API introuvable (Route not found)' });
  });

  // 7. SPA Fallback (Production client routing)
  app.get('*', (req, res, next) => {
    if (req.accepts('html')) {
      res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) next();
      });
    } else {
      next();
    }
  });

  // 8. Centralized Error Handler
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || err.name === 'MulterError') {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum allowed size is 30MB.' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    }

    const statusCode = err.status || err.statusCode || 500;
    const message = err.message || 'Erreur interne du serveur';
    res.status(statusCode).json({ error: message });
  });

  return app;
}

const app = createApp();
export default app;
