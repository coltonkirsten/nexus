import { Router, Request, Response } from 'express';
import {
  createVolume,
  getVolume,
  listVolumes,
  updateVolume,
  deleteVolume,
  cloneVolume,
  seedVolumeFromTemplate,
} from '../services/volumes.js';
import {
  readVolumeFileByVolume,
  listVolumeDirectoryByVolume,
} from '../services/volume.js';
import type { VolumeType } from '../types.js';

const router = Router();

// GET /api/volumes - List all volumes
router.get('/', async (req: Request, res: Response) => {
  try {
    const type = req.query.type as VolumeType | undefined;
    if (type && type !== 'ledger' && type !== 'workspace') {
      res.status(400).json({ error: 'Invalid type filter. Must be "ledger" or "workspace".' });
      return;
    }
    const volumes = await listVolumes(type);
    res.json({ volumes });
  } catch (error) {
    console.error('Error listing volumes:', error);
    res.status(500).json({ error: 'Failed to list volumes' });
  }
});

// GET /api/volumes/:id - Get single volume
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const volume = await getVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: 'Volume not found' });
      return;
    }
    res.json({ volume });
  } catch (error) {
    console.error('Error getting volume:', error);
    res.status(500).json({ error: 'Failed to get volume' });
  }
});

// POST /api/volumes - Create new volume
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, type, template, description } = req.body;

    if (!name || !type) {
      res.status(400).json({ error: 'Name and type are required' });
      return;
    }
    if (type !== 'ledger' && type !== 'workspace') {
      res.status(400).json({ error: 'Type must be "ledger" or "workspace"' });
      return;
    }

    const volume = await createVolume(name, type, { template, description });

    // Seed from template if provided
    if (template) {
      try {
        await seedVolumeFromTemplate(volume.id, template);
      } catch (seedError) {
        console.error('Warning: template seeding failed:', seedError);
      }
    }

    res.status(201).json({ volume });
  } catch (error) {
    console.error('Error creating volume:', error);
    res.status(500).json({ error: 'Failed to create volume' });
  }
});

// PATCH /api/volumes/:id - Update volume metadata
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const volume = await getVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: 'Volume not found' });
      return;
    }

    const updates: { name?: string; description?: string } = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const updated = await updateVolume(req.params.id, updates);
    res.json({ volume: updated });
  } catch (error) {
    console.error('Error updating volume:', error);
    res.status(500).json({ error: 'Failed to update volume' });
  }
});

// DELETE /api/volumes/:id - Delete volume (must be detached)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const volume = await getVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: 'Volume not found' });
      return;
    }

    if (volume.attachedTo) {
      res.status(409).json({ error: 'Volume is attached to an agent. Detach it first.' });
      return;
    }

    const deleted = await deleteVolume(req.params.id);
    if (deleted) {
      res.json({ success: true, message: 'Volume deleted' });
    } else {
      res.status(500).json({ error: 'Failed to delete volume' });
    }
  } catch (error) {
    console.error('Error deleting volume:', error);
    res.status(500).json({ error: 'Failed to delete volume' });
  }
});

// POST /api/volumes/:id/clone - Clone a volume
router.post('/:id/clone', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Name is required for cloned volume' });
      return;
    }

    const source = await getVolume(req.params.id);
    if (!source) {
      res.status(404).json({ error: 'Source volume not found' });
      return;
    }

    const cloned = await cloneVolume(req.params.id, name, description);
    res.status(201).json({ volume: cloned });
  } catch (error) {
    console.error('Error cloning volume:', error);
    res.status(500).json({ error: 'Failed to clone volume' });
  }
});

// GET /api/volumes/:id/tree - Browse files in volume
router.get('/:id/tree', async (req: Request, res: Response) => {
  try {
    const volume = await getVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: 'Volume not found' });
      return;
    }

    const dirPath = (req.query.path as string) || '/';
    const entries = await listVolumeDirectoryByVolume(volume, dirPath);
    res.json({ entries });
  } catch (error) {
    console.error('Error browsing volume:', error);
    res.status(500).json({ error: 'Failed to browse volume' });
  }
});

// GET /api/volumes/:id/file - Read file from volume
router.get('/:id/file', async (req: Request, res: Response) => {
  try {
    const volume = await getVolume(req.params.id);
    if (!volume) {
      res.status(404).json({ error: 'Volume not found' });
      return;
    }

    const filePath = req.query.path as string;
    if (!filePath) {
      res.status(400).json({ error: 'File path required' });
      return;
    }

    const result = await readVolumeFileByVolume(volume, filePath);
    if (!result) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    res.json({ content: result.content, encoding: result.encoding });
  } catch (error) {
    console.error('Error reading volume file:', error);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

export default router;
