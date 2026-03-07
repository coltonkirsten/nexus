import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  LayoutGrid,
  GripVertical,
  Trash2,
  Clock,
  User,
  AlertCircle,
  ChevronDown,
  X,
  Pencil,
  Check,
} from 'lucide-react';

interface ActivityEntry {
  timestamp: string;
  action: string;
  actor: string;
  details?: string;
}

interface Card {
  id: string;
  title: string;
  description?: string;
  assigneeId?: string;
  assigneeName?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  labels: string[];
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  activity: ActivityEntry[];
}

interface Column {
  id: string;
  name: string;
  position: number;
  cards: Card[];
}

interface Board {
  id: string;
  teamId: string;
  name: string;
  description?: string;
  columns: Column[];
  createdAt: string;
  updatedAt: string;
}

interface TeamKanbanTabProps {
  teamId: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// API functions
async function getBoards(teamId: string): Promise<Board[]> {
  const res = await fetch(`${API_URL}/api/teams/${teamId}/boards`);
  if (!res.ok) throw new Error('Failed to fetch boards');
  const data = await res.json();
  return data.boards;
}

async function getBoard(teamId: string, boardId: string): Promise<Board> {
  const res = await fetch(`${API_URL}/api/teams/${teamId}/boards/${boardId}`);
  if (!res.ok) throw new Error('Failed to fetch board');
  const data = await res.json();
  return data.board;
}

async function createBoard(teamId: string, name: string, description?: string): Promise<Board> {
  const res = await fetch(`${API_URL}/api/teams/${teamId}/boards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throw new Error('Failed to create board');
  const data = await res.json();
  return data.board;
}

async function deleteBoard(teamId: string, boardId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/teams/${teamId}/boards/${boardId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete board');
}

async function createCard(
  teamId: string,
  boardId: string,
  columnId: string,
  title: string,
  data?: { description?: string; priority?: string; assigneeId?: string }
): Promise<Card> {
  const res = await fetch(`${API_URL}/api/teams/${teamId}/boards/${boardId}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ columnId, title, ...data }),
  });
  if (!res.ok) throw new Error('Failed to create card');
  const result = await res.json();
  return result.card;
}

async function updateCard(
  teamId: string,
  boardId: string,
  cardId: string,
  updates: Partial<Card>
): Promise<Card> {
  const res = await fetch(`${API_URL}/api/teams/${teamId}/boards/${boardId}/cards/${cardId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update card');
  const result = await res.json();
  return result.card;
}

async function deleteCard(teamId: string, boardId: string, cardId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/teams/${teamId}/boards/${boardId}/cards/${cardId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete card');
}

async function moveCard(
  teamId: string,
  boardId: string,
  cardId: string,
  targetColumnId: string,
  position?: number
): Promise<void> {
  const res = await fetch(`${API_URL}/api/teams/${teamId}/boards/${boardId}/cards/${cardId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetColumnId, position }),
  });
  if (!res.ok) throw new Error('Failed to move card');
}

// Priority colors
const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
  low: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30' },
  medium: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  high: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  urgent: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
};

// Sortable card component
function SortableCard({
  card,
  onEdit,
  onDelete,
}: {
  card: Card;
  onEdit: (card: Card) => void;
  onDelete: (cardId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const priority = card.priority || 'medium';
  const colors = priorityColors[priority];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group bg-[#0f0f18] border ${colors.border} rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-indigo-500/50 transition-colors`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 text-[#2a2a4a] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#e0e0e8] mb-1">{card.title}</p>
          {card.description && (
            <p className="text-xs text-[#4a4a5e] line-clamp-2 mb-2">{card.description}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {card.priority && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                {card.priority}
              </span>
            )}
            {card.assigneeName && (
              <span className="flex items-center gap-1 text-[10px] text-[#4a4a5e]">
                <User className="w-3 h-3" />
                {card.assigneeName}
              </span>
            )}
            {card.dueDate && (
              <span className="flex items-center gap-1 text-[10px] text-[#4a4a5e]">
                <Clock className="w-3 h-3" />
                {new Date(card.dueDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(card); }}
            className="p-1 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded transition-colors"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
            className="p-1 text-[#4a4a5e] hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Card overlay for drag preview
function CardOverlay({ card }: { card: Card }) {
  const priority = card.priority || 'medium';
  const colors = priorityColors[priority];

  return (
    <div className={`bg-[#0f0f18] border ${colors.border} rounded-lg p-3 shadow-xl shadow-black/50`}>
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 text-[#2a2a4a] shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#e0e0e8] mb-1">{card.title}</p>
          {card.priority && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
              {card.priority}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Column component
function KanbanColumn({
  column,
  onAddCard,
  onEditCard,
  onDeleteCard,
}: {
  column: Column;
  onAddCard: (columnId: string) => void;
  onEditCard: (card: Card) => void;
  onDeleteCard: (cardId: string) => void;
}) {
  return (
    <div className="w-72 shrink-0 flex flex-col bg-[#0a0a0f] border border-[#1e1e3a] rounded-xl overflow-hidden">
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1e1e3a] bg-[#0f0f18]">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-[#e0e0e8]">{column.name}</h3>
          <span className="text-xs text-[#4a4a5e] bg-[#1a1a2e] px-1.5 py-0.5 rounded">
            {column.cards.length}
          </span>
        </div>
        <button
          onClick={() => onAddCard(column.id)}
          className="p-1 text-[#4a4a5e] hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-auto p-2 space-y-2">
        <SortableContext items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {column.cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              onEdit={onEditCard}
              onDelete={onDeleteCard}
            />
          ))}
        </SortableContext>
        {column.cards.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-[#2a2a4a]">No cards</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Create board modal
function CreateBoardModal({
  onClose,
  onCreate,
  isLoading,
}: {
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate(name.trim(), description.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f0f18] border border-[#1e1e3a] rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e3a]">
          <h3 className="text-base font-semibold text-[#e0e0e8]">Create Board</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-[#4a4a5e] mb-1.5">Board Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Sprint 1, Feature Development"
              className="w-full bg-[#0a0a0f] border border-[#1e1e3a] text-sm text-[#e0e0e8] rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-[#4a4a5e]"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-[#4a4a5e] mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this board for?"
              rows={3}
              className="w-full bg-[#0a0a0f] border border-[#1e1e3a] text-sm text-[#e0e0e8] rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-[#4a4a5e] resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isLoading}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating...' : 'Create Board'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Create/Edit card modal
function CardModal({
  card,
  columnId,
  onClose,
  onSave,
  isLoading,
}: {
  card: Card | null; // null = create, Card = edit
  columnId?: string;
  onClose: () => void;
  onSave: (data: { title: string; description?: string; priority?: string; columnId?: string }) => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState(card?.title || '');
  const [description, setDescription] = useState(card?.description || '');
  const [priority, setPriority] = useState(card?.priority || 'medium');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        columnId,
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f0f18] border border-[#1e1e3a] rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e3a]">
          <h3 className="text-base font-semibold text-[#e0e0e8]">
            {card ? 'Edit Card' : 'Create Card'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-[#4a4a5e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-[#4a4a5e] mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Card title"
              className="w-full bg-[#0a0a0f] border border-[#1e1e3a] text-sm text-[#e0e0e8] rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-[#4a4a5e]"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-[#4a4a5e] mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details..."
              rows={4}
              className="w-full bg-[#0a0a0f] border border-[#1e1e3a] text-sm text-[#e0e0e8] rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 placeholder-[#4a4a5e] resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-[#4a4a5e] mb-1.5">Priority</label>
            <div className="flex gap-2">
              {(['low', 'medium', 'high', 'urgent'] as const).map((p) => {
                const colors = priorityColors[p];
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex-1 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      priority === p
                        ? `${colors.bg} ${colors.text} ${colors.border}`
                        : 'border-[#1e1e3a] text-[#4a4a5e] hover:border-[#2a2a4a]'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isLoading}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Saving...' : card ? 'Save Changes' : 'Create Card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TeamKanbanTab({ teamId }: TeamKanbanTabProps) {
  const queryClient = useQueryClient();
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [showBoardDropdown, setShowBoardDropdown] = useState(false);
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [addToColumnId, setAddToColumnId] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<Card | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Fetch boards list
  const { data: boards = [], isLoading: boardsLoading } = useQuery<Board[]>({
    queryKey: ['boards', teamId],
    queryFn: () => getBoards(teamId),
    refetchInterval: 10000,
  });

  // Fetch selected board details
  const { data: board, isLoading: boardLoading } = useQuery<Board>({
    queryKey: ['board', teamId, selectedBoardId],
    queryFn: () => getBoard(teamId, selectedBoardId!),
    enabled: !!selectedBoardId,
    refetchInterval: 5000,
  });

  // Auto-select first board
  useEffect(() => {
    if (!selectedBoardId && boards.length > 0) {
      setSelectedBoardId(boards[0].id);
    }
  }, [boards, selectedBoardId]);

  // Create board mutation
  const createBoardMutation = useMutation({
    mutationFn: ({ name, description }: { name: string; description: string }) =>
      createBoard(teamId, name, description),
    onSuccess: (newBoard) => {
      queryClient.invalidateQueries({ queryKey: ['boards', teamId] });
      setSelectedBoardId(newBoard.id);
      setShowCreateBoard(false);
    },
  });

  // Delete board mutation
  const deleteBoardMutation = useMutation({
    mutationFn: (boardId: string) => deleteBoard(teamId, boardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards', teamId] });
      setSelectedBoardId(null);
    },
  });

  // Create card mutation
  const createCardMutation = useMutation({
    mutationFn: (data: { columnId: string; title: string; description?: string; priority?: string }) =>
      createCard(teamId, selectedBoardId!, data.columnId, data.title, {
        description: data.description,
        priority: data.priority,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', teamId, selectedBoardId] });
      setShowCardModal(false);
      setAddToColumnId(null);
    },
  });

  // Update card mutation
  const updateCardMutation = useMutation({
    mutationFn: ({ cardId, updates }: { cardId: string; updates: Partial<Card> }) =>
      updateCard(teamId, selectedBoardId!, cardId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', teamId, selectedBoardId] });
      setShowCardModal(false);
      setEditingCard(null);
    },
  });

  // Delete card mutation
  const deleteCardMutation = useMutation({
    mutationFn: (cardId: string) => deleteCard(teamId, selectedBoardId!, cardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', teamId, selectedBoardId] });
    },
  });

  // Move card mutation
  const moveCardMutation = useMutation({
    mutationFn: ({ cardId, targetColumnId, position }: { cardId: string; targetColumnId: string; position?: number }) =>
      moveCard(teamId, selectedBoardId!, cardId, targetColumnId, position),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', teamId, selectedBoardId] });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    const cardId = event.active.id as string;
    // Find the card in the board
    if (board) {
      for (const column of board.columns) {
        const card = column.cards.find((c) => c.id === cardId);
        if (card) {
          setActiveCard(card);
          break;
        }
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!over || !board) return;

    const cardId = active.id as string;
    const overId = over.id as string;

    // Find source column and card
    let sourceColumn: Column | undefined;
    let targetColumn: Column | undefined;

    for (const column of board.columns) {
      if (column.cards.find((c) => c.id === cardId)) {
        sourceColumn = column;
      }
      // Check if dropped over a card or column
      if (column.id === overId || column.cards.find((c) => c.id === overId)) {
        targetColumn = column;
      }
    }

    if (!sourceColumn || !targetColumn) return;

    // Find position
    let position = 0;
    if (overId !== targetColumn.id) {
      const overIndex = targetColumn.cards.findIndex((c) => c.id === overId);
      position = overIndex >= 0 ? overIndex : targetColumn.cards.length;
    }

    // Only move if actually changing position
    if (sourceColumn.id !== targetColumn.id || position !== sourceColumn.cards.findIndex((c) => c.id === cardId)) {
      moveCardMutation.mutate({ cardId, targetColumnId: targetColumn.id, position });
    }
  };

  const handleAddCard = (columnId: string) => {
    setAddToColumnId(columnId);
    setEditingCard(null);
    setShowCardModal(true);
  };

  const handleEditCard = (card: Card) => {
    setEditingCard(card);
    setAddToColumnId(null);
    setShowCardModal(true);
  };

  const handleDeleteCard = (cardId: string) => {
    if (confirm('Delete this card?')) {
      deleteCardMutation.mutate(cardId);
    }
  };

  const handleSaveCard = (data: { title: string; description?: string; priority?: string; columnId?: string }) => {
    if (editingCard) {
      updateCardMutation.mutate({
        cardId: editingCard.id,
        updates: { title: data.title, description: data.description, priority: data.priority as Card['priority'] },
      });
    } else if (addToColumnId) {
      createCardMutation.mutate({
        columnId: addToColumnId,
        title: data.title,
        description: data.description,
        priority: data.priority,
      });
    }
  };

  const selectedBoard = boards.find((b) => b.id === selectedBoardId);

  if (boardsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400 mx-auto mb-4" />
          <p className="text-[#4a4a5e] text-sm">Loading boards...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#1e1e3a] shrink-0">
        <div className="flex items-center gap-3">
          {/* Board selector */}
          <div className="relative">
            <button
              onClick={() => setShowBoardDropdown(!showBoardDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#e0e0e8] bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg hover:border-indigo-500/50 transition-colors"
            >
              <LayoutGrid className="w-4 h-4 text-indigo-400" />
              {selectedBoard?.name || 'Select Board'}
              <ChevronDown className="w-3 h-3 text-[#4a4a5e]" />
            </button>

            {showBoardDropdown && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-[#0f0f18] border border-[#1e1e3a] rounded-xl shadow-xl shadow-black/50 z-50 overflow-hidden">
                <div className="max-h-64 overflow-auto">
                  {boards.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        setSelectedBoardId(b.id);
                        setShowBoardDropdown(false);
                      }}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-[#1a1a2e] transition-colors ${
                        b.id === selectedBoardId ? 'text-indigo-400' : 'text-[#e0e0e8]'
                      }`}
                    >
                      <span className="truncate">{b.name}</span>
                      {b.id === selectedBoardId && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
                <div className="border-t border-[#1e1e3a]">
                  <button
                    onClick={() => {
                      setShowBoardDropdown(false);
                      setShowCreateBoard(true);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Create Board
                  </button>
                </div>
              </div>
            )}
          </div>

          {selectedBoard && (
            <span className="text-xs text-[#4a4a5e]">
              {board?.columns.reduce((sum, c) => sum + c.cards.length, 0) || 0} cards
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selectedBoard && (
            <button
              onClick={() => {
                if (confirm(`Delete board "${selectedBoard.name}"?`)) {
                  deleteBoardMutation.mutate(selectedBoard.id);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#7a7a8e] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Board
            </button>
          )}
        </div>
      </div>

      {/* Board content */}
      {!selectedBoard ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <LayoutGrid className="w-12 h-12 mx-auto mb-3 text-[#1e1e3a]" />
            <p className="text-[#7a7a8e] text-sm mb-4">No board selected</p>
            <button
              onClick={() => setShowCreateBoard(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors mx-auto"
            >
              <Plus className="w-4 h-4" />
              Create First Board
            </button>
          </div>
        </div>
      ) : boardLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400" />
        </div>
      ) : board ? (
        <div className="flex-1 overflow-auto p-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 h-full">
              {board.columns
                .sort((a, b) => a.position - b.position)
                .map((column) => (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    onAddCard={handleAddCard}
                    onEditCard={handleEditCard}
                    onDeleteCard={handleDeleteCard}
                  />
                ))}
            </div>

            <DragOverlay>
              {activeCard ? <CardOverlay card={activeCard} /> : null}
            </DragOverlay>
          </DndContext>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-400" />
            <p className="text-[#7a7a8e] text-sm">Failed to load board</p>
          </div>
        </div>
      )}

      {/* Click outside to close dropdown */}
      {showBoardDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowBoardDropdown(false)}
        />
      )}

      {/* Modals */}
      {showCreateBoard && (
        <CreateBoardModal
          onClose={() => setShowCreateBoard(false)}
          onCreate={(name, description) => createBoardMutation.mutate({ name, description })}
          isLoading={createBoardMutation.isPending}
        />
      )}

      {showCardModal && (
        <CardModal
          card={editingCard}
          columnId={addToColumnId || undefined}
          onClose={() => {
            setShowCardModal(false);
            setEditingCard(null);
            setAddToColumnId(null);
          }}
          onSave={handleSaveCard}
          isLoading={createCardMutation.isPending || updateCardMutation.isPending}
        />
      )}
    </div>
  );
}
