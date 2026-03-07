import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import type { Board, Column, Card, CardPriority, ActivityEntry, TeamEvent } from '../types.js';
import { emitTeamEvent } from './teams.js';

// Helper to create team events
function createTeamEvent(
  teamId: string,
  type: TeamEvent['type'],
  agentId: string,
  agentName: string,
  data?: Record<string, unknown>
): TeamEvent {
  return {
    id: uuidv4(),
    teamId,
    type,
    timestamp: new Date().toISOString(),
    agentId,
    agentName,
    data,
  };
}

// Simple async mutex (same pattern as mailbox.ts)
let boardsLock: Promise<void> = Promise.resolve();

function withBoardsLock<T>(fn: () => Promise<T>): Promise<T> {
  const release = boardsLock;
  let resolve: () => void;
  boardsLock = new Promise<void>(r => { resolve = r; });
  return release.then(fn).finally(() => resolve!());
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const BOARDS_DIR = path.join(DATA_DIR, 'boards');

async function ensureDirectories(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(BOARDS_DIR, { recursive: true });
}

function getBoardsPath(teamId: string): string {
  return path.join(BOARDS_DIR, `${teamId}.json`);
}

interface BoardsFile {
  boards: Board[];
}

async function loadBoards(teamId: string): Promise<Board[]> {
  await ensureDirectories();
  try {
    const data = await fs.readFile(getBoardsPath(teamId), 'utf-8');
    const parsed: BoardsFile = JSON.parse(data);
    return parsed.boards || [];
  } catch {
    return [];
  }
}

async function saveBoards(teamId: string, boards: Board[]): Promise<void> {
  await ensureDirectories();
  const data: BoardsFile = { boards };
  await fs.writeFile(getBoardsPath(teamId), JSON.stringify(data, null, 2));
}

// Default columns for new boards
const DEFAULT_COLUMNS: Omit<Column, 'id'>[] = [
  { name: 'Backlog', position: 0, cards: [] },
  { name: 'In Progress', position: 1, cards: [] },
  { name: 'Review', position: 2, cards: [] },
  { name: 'Done', position: 3, cards: [] },
];

// ============ Board Operations ============

export async function listBoards(teamId: string): Promise<Board[]> {
  return loadBoards(teamId);
}

export async function createBoard(
  teamId: string,
  name: string,
  description?: string,
  createdBy: string = 'human'
): Promise<Board> {
  return withBoardsLock(async () => {
    const boards = await loadBoards(teamId);

    const board: Board = {
      id: uuidv4(),
      teamId,
      name,
      description,
      columns: DEFAULT_COLUMNS.map(col => ({
        ...col,
        id: uuidv4(),
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    boards.push(board);
    await saveBoards(teamId, boards);

    // Emit team event
    await emitTeamEvent(createTeamEvent(
      teamId,
      'board_created',
      createdBy === 'human' ? 'human' : createdBy,
      createdBy === 'human' ? 'Human' : createdBy,
      { boardId: board.id, boardName: board.name }
    ));

    return board;
  });
}

export async function getBoard(teamId: string, boardId: string): Promise<Board | null> {
  const boards = await loadBoards(teamId);
  return boards.find(b => b.id === boardId) || null;
}

export async function updateBoard(
  teamId: string,
  boardId: string,
  updates: { name?: string; description?: string }
): Promise<Board | null> {
  return withBoardsLock(async () => {
    const boards = await loadBoards(teamId);
    const board = boards.find(b => b.id === boardId);
    if (!board) return null;

    if (updates.name !== undefined) board.name = updates.name;
    if (updates.description !== undefined) board.description = updates.description;
    board.updatedAt = new Date().toISOString();

    await saveBoards(teamId, boards);
    return board;
  });
}

export async function deleteBoard(teamId: string, boardId: string): Promise<boolean> {
  return withBoardsLock(async () => {
    const boards = await loadBoards(teamId);
    const index = boards.findIndex(b => b.id === boardId);
    if (index === -1) return false;

    const board = boards[index];
    boards.splice(index, 1);
    await saveBoards(teamId, boards);

    // Emit team event
    await emitTeamEvent(createTeamEvent(
      teamId,
      'board_deleted',
      'human',
      'Human',
      { boardId: board.id, boardName: board.name }
    ));

    return true;
  });
}

// ============ Column Operations ============

export async function addColumn(
  teamId: string,
  boardId: string,
  name: string,
  position?: number
): Promise<Column | null> {
  return withBoardsLock(async () => {
    const boards = await loadBoards(teamId);
    const board = boards.find(b => b.id === boardId);
    if (!board) return null;

    const column: Column = {
      id: uuidv4(),
      name,
      position: position ?? board.columns.length,
      cards: [],
    };

    // Insert at position and adjust other positions
    board.columns.push(column);
    board.columns.sort((a, b) => a.position - b.position);
    board.columns.forEach((col, idx) => col.position = idx);

    board.updatedAt = new Date().toISOString();
    await saveBoards(teamId, boards);
    return column;
  });
}

export async function updateColumn(
  teamId: string,
  boardId: string,
  columnId: string,
  updates: { name?: string }
): Promise<Column | null> {
  return withBoardsLock(async () => {
    const boards = await loadBoards(teamId);
    const board = boards.find(b => b.id === boardId);
    if (!board) return null;

    const column = board.columns.find(c => c.id === columnId);
    if (!column) return null;

    if (updates.name !== undefined) column.name = updates.name;
    board.updatedAt = new Date().toISOString();

    await saveBoards(teamId, boards);
    return column;
  });
}

export async function deleteColumn(
  teamId: string,
  boardId: string,
  columnId: string
): Promise<boolean> {
  return withBoardsLock(async () => {
    const boards = await loadBoards(teamId);
    const board = boards.find(b => b.id === boardId);
    if (!board) return false;

    const index = board.columns.findIndex(c => c.id === columnId);
    if (index === -1) return false;

    board.columns.splice(index, 1);
    // Re-normalize positions
    board.columns.forEach((col, idx) => col.position = idx);
    board.updatedAt = new Date().toISOString();

    await saveBoards(teamId, boards);
    return true;
  });
}

export async function reorderColumns(
  teamId: string,
  boardId: string,
  columnIds: string[]
): Promise<Board | null> {
  return withBoardsLock(async () => {
    const boards = await loadBoards(teamId);
    const board = boards.find(b => b.id === boardId);
    if (!board) return null;

    // Validate all column IDs exist
    const existingIds = new Set(board.columns.map(c => c.id));
    if (!columnIds.every(id => existingIds.has(id))) return null;

    // Reorder columns based on provided order
    const columnMap = new Map(board.columns.map(c => [c.id, c]));
    board.columns = columnIds.map((id, idx) => {
      const col = columnMap.get(id)!;
      col.position = idx;
      return col;
    });

    board.updatedAt = new Date().toISOString();
    await saveBoards(teamId, boards);
    return board;
  });
}

// ============ Card Operations ============

export interface CreateCardInput {
  title: string;
  description?: string;
  assigneeId?: string;
  assigneeName?: string;
  priority?: CardPriority;
  labels?: string[];
  dueDate?: string;
  createdBy?: string;
}

export async function createCard(
  teamId: string,
  boardId: string,
  columnId: string,
  input: CreateCardInput
): Promise<Card | null> {
  return withBoardsLock(async () => {
    const boards = await loadBoards(teamId);
    const board = boards.find(b => b.id === boardId);
    if (!board) return null;

    const column = board.columns.find(c => c.id === columnId);
    if (!column) return null;

    const now = new Date().toISOString();
    const card: Card = {
      id: uuidv4(),
      title: input.title,
      description: input.description,
      assigneeId: input.assigneeId,
      assigneeName: input.assigneeName,
      priority: input.priority,
      labels: input.labels || [],
      dueDate: input.dueDate,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy || 'human',
      activity: [{
        timestamp: now,
        action: 'created',
        actor: input.createdBy || 'human',
      }],
    };

    column.cards.push(card);
    board.updatedAt = now;
    await saveBoards(teamId, boards);

    // Emit team event
    await emitTeamEvent(createTeamEvent(
      teamId,
      'card_created',
      input.createdBy === 'human' || !input.createdBy ? 'human' : input.createdBy,
      input.createdBy === 'human' || !input.createdBy ? 'Human' : input.createdBy,
      { boardId, boardName: board.name, cardId: card.id, cardTitle: card.title, columnName: column.name }
    ));

    return card;
  });
}

export interface UpdateCardInput {
  title?: string;
  description?: string;
  assigneeId?: string;
  assigneeName?: string;
  priority?: CardPriority;
  labels?: string[];
  dueDate?: string;
  updatedBy?: string;
}

export async function updateCard(
  teamId: string,
  boardId: string,
  cardId: string,
  input: UpdateCardInput
): Promise<Card | null> {
  return withBoardsLock(async () => {
    const boards = await loadBoards(teamId);
    const board = boards.find(b => b.id === boardId);
    if (!board) return null;

    // Find card in any column
    let card: Card | undefined;
    for (const column of board.columns) {
      card = column.cards.find(c => c.id === cardId);
      if (card) break;
    }
    if (!card) return null;

    const now = new Date().toISOString();
    const changes: string[] = [];

    if (input.title !== undefined && input.title !== card.title) {
      changes.push(`title changed to "${input.title}"`);
      card.title = input.title;
    }
    if (input.description !== undefined) card.description = input.description;
    if (input.assigneeId !== undefined) {
      changes.push(`assigned to ${input.assigneeName || input.assigneeId || 'nobody'}`);
      card.assigneeId = input.assigneeId;
      card.assigneeName = input.assigneeName;
    }
    if (input.priority !== undefined) {
      changes.push(`priority set to ${input.priority}`);
      card.priority = input.priority;
    }
    if (input.labels !== undefined) card.labels = input.labels;
    if (input.dueDate !== undefined) card.dueDate = input.dueDate;

    card.updatedAt = now;
    if (changes.length > 0) {
      card.activity.push({
        timestamp: now,
        action: 'updated',
        actor: input.updatedBy || 'human',
        details: changes.join(', '),
      });
    }

    board.updatedAt = now;
    await saveBoards(teamId, boards);
    return card;
  });
}

export async function deleteCard(
  teamId: string,
  boardId: string,
  cardId: string
): Promise<boolean> {
  return withBoardsLock(async () => {
    const boards = await loadBoards(teamId);
    const board = boards.find(b => b.id === boardId);
    if (!board) return false;

    for (const column of board.columns) {
      const index = column.cards.findIndex(c => c.id === cardId);
      if (index !== -1) {
        const card = column.cards[index];
        column.cards.splice(index, 1);
        board.updatedAt = new Date().toISOString();
        await saveBoards(teamId, boards);

        // Emit team event
        await emitTeamEvent(createTeamEvent(
          teamId,
          'card_deleted',
          'human',
          'Human',
          { boardId, boardName: board.name, cardId: card.id, cardTitle: card.title }
        ));

        return true;
      }
    }

    return false;
  });
}

export async function moveCard(
  teamId: string,
  boardId: string,
  cardId: string,
  targetColumnId: string,
  position?: number,
  movedBy: string = 'human'
): Promise<Card | null> {
  return withBoardsLock(async () => {
    const boards = await loadBoards(teamId);
    const board = boards.find(b => b.id === boardId);
    if (!board) return null;

    // Find and remove card from current column
    let card: Card | undefined;
    let sourceColumn: Column | undefined;
    for (const column of board.columns) {
      const index = column.cards.findIndex(c => c.id === cardId);
      if (index !== -1) {
        card = column.cards.splice(index, 1)[0];
        sourceColumn = column;
        break;
      }
    }
    if (!card || !sourceColumn) return null;

    // Find target column
    const targetColumn = board.columns.find(c => c.id === targetColumnId);
    if (!targetColumn) {
      // Restore card to original position
      sourceColumn.cards.push(card);
      return null;
    }

    // Insert at position or end
    const insertPosition = position ?? targetColumn.cards.length;
    targetColumn.cards.splice(insertPosition, 0, card);

    const now = new Date().toISOString();
    card.updatedAt = now;
    card.activity.push({
      timestamp: now,
      action: 'moved',
      actor: movedBy,
      details: `moved from "${sourceColumn.name}" to "${targetColumn.name}"`,
    });

    board.updatedAt = now;
    await saveBoards(teamId, boards);

    // Emit team event
    await emitTeamEvent(createTeamEvent(
      teamId,
      'card_moved',
      movedBy === 'human' ? 'human' : movedBy,
      movedBy === 'human' ? 'Human' : movedBy,
      {
        boardId,
        boardName: board.name,
        cardId: card.id,
        cardTitle: card.title,
        fromColumn: sourceColumn.name,
        toColumn: targetColumn.name,
      }
    ));

    return card;
  });
}

// ============ Utility ============

export async function deleteBoardsForTeam(teamId: string): Promise<void> {
  try {
    await fs.unlink(getBoardsPath(teamId));
  } catch {
    // File might not exist
  }
}

// Find a card by ID across all boards in a team
export async function findCard(
  teamId: string,
  cardId: string
): Promise<{ board: Board; column: Column; card: Card } | null> {
  const boards = await loadBoards(teamId);
  for (const board of boards) {
    for (const column of board.columns) {
      const card = column.cards.find(c => c.id === cardId);
      if (card) {
        return { board, column, card };
      }
    }
  }
  return null;
}
