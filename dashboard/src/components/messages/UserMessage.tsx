import type { ConversationTurn } from '../../types/agent';

interface UserMessageProps {
  turn: ConversationTurn;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function UserMessage({ turn }: UserMessageProps) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%]">
        <div className="bg-indigo-600/20 border border-indigo-500/30 rounded-2xl px-5 py-3.5">
          <div className="whitespace-pre-wrap break-words text-[#e0e0e8] leading-relaxed">
            {turn.textContent}
          </div>
        </div>
        <div className="text-[10px] text-[#4a4a5e] mt-1.5 text-right px-2">
          {formatTime(turn.timestamp)}
        </div>
      </div>
    </div>
  );
}
