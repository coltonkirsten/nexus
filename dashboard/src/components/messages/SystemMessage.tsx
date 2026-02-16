import type { ConversationTurn } from '../../types/agent';

interface SystemMessageProps {
  turn: ConversationTurn;
}

export function SystemMessage({ turn }: SystemMessageProps) {
  return (
    <div className="flex justify-center my-2">
      <div className="text-xs text-[#4a4a5e] bg-[#12121a] px-4 py-2 rounded-full border border-[#1e1e3a]/50">
        {turn.textContent}
      </div>
    </div>
  );
}
