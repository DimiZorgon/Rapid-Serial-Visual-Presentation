import { Router } from 'express';
import { uploadEpub, uploadText } from '../middleware/upload.js';
import { parseEpub } from '../services/epubParser.js';
import { parseText } from '../services/textParser.js';

const router = Router();

// POST /api/parse/epub
router.post('/epub', uploadEpub.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'No file uploaded. Fichier EPUB manquant.' });
    }
    const book = await parseEpub(req.file.buffer, req.file.originalname);
    res.json(book);
  } catch (err) {
    res.status(400).json({ error: err.message || "Erreur lors du traitement de l'EPUB" });
  }
});

// POST /api/parse/text (Multipart file OR JSON payload)
router.post('/text', uploadText.single('file'), (req, res) => {
  try {
    if (req.file && req.file.buffer) {
      const book = parseText(req.file.buffer, {
        filename: req.file.originalname,
        title: req.body ? req.body.title : undefined,
        author: req.body ? req.body.author : undefined
      });
      return res.json(book);
    }

    if (req.body && typeof req.body.text === 'string') {
      const book = parseText(req.body.text, {
        title: req.body.title,
        author: req.body.author
      });
      return res.json(book);
    }

    return res.status(400).json({ error: 'Texte ou fichier manquant (Text content is empty)' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Erreur lors du traitement du texte' });
  }
});

export default router;
