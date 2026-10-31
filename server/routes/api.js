import { Router } from 'express';
import parseRouter from './parse.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

router.use('/parse', parseRouter);

export default router;
