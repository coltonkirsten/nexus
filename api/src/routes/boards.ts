import { Router, Request, Response } from 'express';
import {
  listBoards,
  createBoard,
  getBoard,
  updateBoard,
  deleteBoard,
  addColumn,
  updateColumn,
  deleteColumn,
  reorderColumns,
  createCard,
  updateCard,
  deleteCard,
  moveCard,
} from '../services/boards.js';
import { getTeam } from '../services/teams.js';
import type { CardPriority } from '../types.js';

const router = Router();

// ============ Board Routes ============

// GET /api/teams/:teamId/boards — list all boards for team
router.get('/:teamId/boards', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;

    const team = await getTeam(teamId);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const boards = await listBoards(teamId);
    res.json({ boards });
  } catch (error) {
    console.error('Error listing boards:', error);
    res.status(500).json({ error: 'Failed to list boards' });
  }
});

// POST /api/teams/:teamId/boards — create board
router.post('/:teamId/boards', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const { name, description, createdBy } = req.body as {
      name: string;
      description?: string;
      createdBy?: string;
    };

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const team = await getTeam(teamId);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const board = await createBoard(teamId, name, description, createdBy);
    res.status(201).json({ board });
  } catch (error) {
    console.error('Error creating board:', error);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

// GET /api/teams/:teamId/boards/:boardId — get single board with columns/cards
router.get('/:teamId/boards/:boardId', async (req: Request, res: Response) => {
  try {
    const { teamId, boardId } = req.params;

    const board = await getBoard(teamId, boardId);
    if (!board) {
      res.status(404).json({ error: 'Board not found' });
      return;
    }

    res.json({ board });
  } catch (error) {
    console.error('Error getting board:', error);
    res.status(500).json({ error: 'Failed to get board' });
  }
});

// PATCH /api/teams/:teamId/boards/:boardId — update board
router.patch('/:teamId/boards/:boardId', async (req: Request, res: Response) => {
  try {
    const { teamId, boardId } = req.params;
    const { name, description } = req.body as {
      name?: string;
      description?: string;
    };

    const board = await updateBoard(teamId, boardId, { name, description });
    if (!board) {
      res.status(404).json({ error: 'Board not found' });
      return;
    }

    res.json({ board });
  } catch (error) {
    console.error('Error updating board:', error);
    res.status(500).json({ error: 'Failed to update board' });
  }
});

// DELETE /api/teams/:teamId/boards/:boardId — delete board
router.delete('/:teamId/boards/:boardId', async (req: Request, res: Response) => {
  try {
    const { teamId, boardId } = req.params;

    const deleted = await deleteBoard(teamId, boardId);
    if (!deleted) {
      res.status(404).json({ error: 'Board not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting board:', error);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

// ============ Column Routes ============

// POST /api/teams/:teamId/boards/:boardId/columns — add column
router.post('/:teamId/boards/:boardId/columns', async (req: Request, res: Response) => {
  try {
    const { teamId, boardId } = req.params;
    const { name, position } = req.body as {
      name: string;
      position?: number;
    };

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const column = await addColumn(teamId, boardId, name, position);
    if (!column) {
      res.status(404).json({ error: 'Board not found' });
      return;
    }

    res.status(201).json({ column });
  } catch (error) {
    console.error('Error adding column:', error);
    res.status(500).json({ error: 'Failed to add column' });
  }
});

// PATCH /api/teams/:teamId/boards/:boardId/columns/:columnId — update column
router.patch('/:teamId/boards/:boardId/columns/:columnId', async (req: Request, res: Response) => {
  try {
    const { teamId, boardId, columnId } = req.params;
    const { name } = req.body as { name?: string };

    const column = await updateColumn(teamId, boardId, columnId, { name });
    if (!column) {
      res.status(404).json({ error: 'Board or column not found' });
      return;
    }

    res.json({ column });
  } catch (error) {
    console.error('Error updating column:', error);
    res.status(500).json({ error: 'Failed to update column' });
  }
});

// DELETE /api/teams/:teamId/boards/:boardId/columns/:columnId — delete column
router.delete('/:teamId/boards/:boardId/columns/:columnId', async (req: Request, res: Response) => {
  try {
    const { teamId, boardId, columnId } = req.params;

    const deleted = await deleteColumn(teamId, boardId, columnId);
    if (!deleted) {
      res.status(404).json({ error: 'Board or column not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting column:', error);
    res.status(500).json({ error: 'Failed to delete column' });
  }
});

// POST /api/teams/:teamId/boards/:boardId/columns/reorder — reorder columns
router.post('/:teamId/boards/:boardId/columns/reorder', async (req: Request, res: Response) => {
  try {
    const { teamId, boardId } = req.params;
    const { columnIds } = req.body as { columnIds: string[] };

    if (!columnIds || !Array.isArray(columnIds)) {
      res.status(400).json({ error: 'columnIds array is required' });
      return;
    }

    const board = await reorderColumns(teamId, boardId, columnIds);
    if (!board) {
      res.status(404).json({ error: 'Board not found or invalid column IDs' });
      return;
    }

    res.json({ board });
  } catch (error) {
    console.error('Error reordering columns:', error);
    res.status(500).json({ error: 'Failed to reorder columns' });
  }
});

// ============ Card Routes ============

// POST /api/teams/:teamId/boards/:boardId/cards — create card
router.post('/:teamId/boards/:boardId/cards', async (req: Request, res: Response) => {
  try {
    const { teamId, boardId } = req.params;
    const {
      columnId,
      title,
      description,
      assigneeId,
      assigneeName,
      priority,
      labels,
      dueDate,
      createdBy,
    } = req.body as {
      columnId: string;
      title: string;
      description?: string;
      assigneeId?: string;
      assigneeName?: string;
      priority?: CardPriority;
      labels?: string[];
      dueDate?: string;
      createdBy?: string;
    };

    if (!columnId || !title) {
      res.status(400).json({ error: 'columnId and title are required' });
      return;
    }

    const card = await createCard(teamId, boardId, columnId, {
      title,
      description,
      assigneeId,
      assigneeName,
      priority,
      labels,
      dueDate,
      createdBy,
    });

    if (!card) {
      res.status(404).json({ error: 'Board or column not found' });
      return;
    }

    res.status(201).json({ card });
  } catch (error) {
    console.error('Error creating card:', error);
    res.status(500).json({ error: 'Failed to create card' });
  }
});

// PATCH /api/teams/:teamId/boards/:boardId/cards/:cardId — update card
router.patch('/:teamId/boards/:boardId/cards/:cardId', async (req: Request, res: Response) => {
  try {
    const { teamId, boardId, cardId } = req.params;
    const {
      title,
      description,
      assigneeId,
      assigneeName,
      priority,
      labels,
      dueDate,
      updatedBy,
    } = req.body as {
      title?: string;
      description?: string;
      assigneeId?: string;
      assigneeName?: string;
      priority?: CardPriority;
      labels?: string[];
      dueDate?: string;
      updatedBy?: string;
    };

    const card = await updateCard(teamId, boardId, cardId, {
      title,
      description,
      assigneeId,
      assigneeName,
      priority,
      labels,
      dueDate,
      updatedBy,
    });

    if (!card) {
      res.status(404).json({ error: 'Board or card not found' });
      return;
    }

    res.json({ card });
  } catch (error) {
    console.error('Error updating card:', error);
    res.status(500).json({ error: 'Failed to update card' });
  }
});

// DELETE /api/teams/:teamId/boards/:boardId/cards/:cardId — delete card
router.delete('/:teamId/boards/:boardId/cards/:cardId', async (req: Request, res: Response) => {
  try {
    const { teamId, boardId, cardId } = req.params;

    const deleted = await deleteCard(teamId, boardId, cardId);
    if (!deleted) {
      res.status(404).json({ error: 'Board or card not found' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting card:', error);
    res.status(500).json({ error: 'Failed to delete card' });
  }
});

// POST /api/teams/:teamId/boards/:boardId/cards/:cardId/move — move card to column
router.post('/:teamId/boards/:boardId/cards/:cardId/move', async (req: Request, res: Response) => {
  try {
    const { teamId, boardId, cardId } = req.params;
    const { targetColumnId, position, movedBy } = req.body as {
      targetColumnId: string;
      position?: number;
      movedBy?: string;
    };

    if (!targetColumnId) {
      res.status(400).json({ error: 'targetColumnId is required' });
      return;
    }

    const card = await moveCard(teamId, boardId, cardId, targetColumnId, position, movedBy);
    if (!card) {
      res.status(404).json({ error: 'Board, card, or target column not found' });
      return;
    }

    res.json({ card });
  } catch (error) {
    console.error('Error moving card:', error);
    res.status(500).json({ error: 'Failed to move card' });
  }
});

export default router;
