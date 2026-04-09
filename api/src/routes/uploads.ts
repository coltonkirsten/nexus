import { Router, Request, Response } from 'express';
import multer from 'multer';
import { saveUploadedFile, getUploadedFile, getUploadPath } from '../services/uploads.js';

const router = Router();

// Configure multer for memory storage (we'll save manually)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
    files: 5, // Max 5 files at once
  },
});

// POST /api/uploads - Upload one or more files
router.post('/', upload.array('files', 5), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files provided' });
      return;
    }

    const attachments = await Promise.all(
      files.map((file) =>
        saveUploadedFile(file.buffer, file.originalname, file.mimetype)
      )
    );

    res.json({ attachments });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// POST /api/uploads/single - Upload a single file (simpler API)
router.post('/single', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const attachment = await saveUploadedFile(file.buffer, file.originalname, file.mimetype);
    res.json({ attachment });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// GET /api/uploads/:filename - Retrieve a file
router.get('/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const data = await getUploadedFile(filename);

    if (!data) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Determine content type from extension
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      pdf: 'application/pdf',
      txt: 'text/plain',
      json: 'application/json',
      md: 'text/markdown',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.send(data);
  } catch (error) {
    console.error('Error retrieving file:', error);
    res.status(500).json({ error: 'Failed to retrieve file' });
  }
});

export default router;
