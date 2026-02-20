import { Router, Request, Response } from 'express';
import { listCellTypes, getCellType } from '../services/cellTypes.js';
import {
  getAllCredentials,
  getCredentials,
  setCredentials,
  deleteCredentials,
  maskCredentials,
} from '../services/credentials.js';

const router = Router();

// GET /api/cell-types — list all cell types with their credential schemas (no values)
router.get('/', (_req: Request, res: Response) => {
  try {
    const cellTypes = listCellTypes();
    res.json({ cellTypes });
  } catch (error) {
    console.error('Error listing cell types:', error);
    res.status(500).json({ error: 'Failed to list cell types' });
  }
});

// GET /api/credentials — get all stored credentials with values masked
router.get('/credentials', async (_req: Request, res: Response) => {
  try {
    const all = await getAllCredentials();
    const masked: Record<string, Record<string, string>> = {};
    for (const [cellType, creds] of Object.entries(all)) {
      masked[cellType] = maskCredentials(creds);
    }
    res.json({ credentials: masked });
  } catch (error) {
    console.error('Error getting credentials:', error);
    res.status(500).json({ error: 'Failed to get credentials' });
  }
});

// GET /api/credentials/:cellType — get credentials for a specific cell type (masked)
router.get('/credentials/:cellType', async (req: Request, res: Response) => {
  try {
    const { cellType } = req.params;
    const cellTypeDef = getCellType(cellType);
    if (!cellTypeDef) {
      res.status(404).json({ error: `Unknown cell type: ${cellType}` });
      return;
    }

    const creds = await getCredentials(cellType);
    res.json({ cellType, credentials: maskCredentials(creds) });
  } catch (error) {
    console.error('Error getting credentials:', error);
    res.status(500).json({ error: 'Failed to get credentials' });
  }
});

// PUT /api/credentials/:cellType — set credentials for a cell type
router.put('/credentials/:cellType', async (req: Request, res: Response) => {
  try {
    const { cellType } = req.params;
    const cellTypeDef = getCellType(cellType);
    if (!cellTypeDef) {
      res.status(404).json({ error: `Unknown cell type: ${cellType}` });
      return;
    }

    const values = req.body as Record<string, string>;
    if (!values || typeof values !== 'object') {
      res.status(400).json({ error: 'Request body must be an object of key-value pairs' });
      return;
    }

    // Validate that all keys are valid credential fields for this cell type
    const validKeys = new Set(cellTypeDef.credentials.map(c => c.key));
    for (const key of Object.keys(values)) {
      if (!validKeys.has(key)) {
        res.status(400).json({ error: `Invalid credential key "${key}" for cell type "${cellType}"` });
        return;
      }
    }

    await setCredentials(cellType, values);
    const updated = await getCredentials(cellType);
    res.json({ cellType, credentials: maskCredentials(updated) });
  } catch (error) {
    console.error('Error setting credentials:', error);
    res.status(500).json({ error: 'Failed to set credentials' });
  }
});

// DELETE /api/credentials/:cellType — remove credentials for a cell type
router.delete('/credentials/:cellType', async (req: Request, res: Response) => {
  try {
    const { cellType } = req.params;
    await deleteCredentials(cellType);
    res.json({ success: true, message: `Credentials for ${cellType} deleted` });
  } catch (error) {
    console.error('Error deleting credentials:', error);
    res.status(500).json({ error: 'Failed to delete credentials' });
  }
});

export default router;
