import multer from 'multer';
import path from 'node:path';

const storage = multer.memoryStorage();

export const uploadEpub = multer({
  storage,
  limits: {
    fileSize: 30 * 1024 * 1024, // 30 MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const validExt = ext === '.epub';
    const validMimes = [
      'application/epub+zip',
      'application/zip',
      'application/x-zip-compressed',
      'application/octet-stream'
    ];
    if (validExt || validMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error('Seuls les fichiers .epub sont acceptés');
      err.status = 400;
      cb(err, false);
    }
  }
});

export const uploadText = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const validExt = ext === '.txt';
    const validMimes = [
      'text/plain',
      'application/octet-stream'
    ];
    if (validExt || validMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error('Seuls les fichiers texte (.txt) sont acceptés');
      err.status = 400;
      cb(err, false);
    }
  }
});
