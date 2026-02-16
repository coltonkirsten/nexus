import { AlertTriangle, Trash2, HelpCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}

const variantConfig = {
  danger: {
    icon: Trash2,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/10',
    buttonColor: 'bg-red-600 hover:bg-red-500',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-yellow-400',
    iconBg: 'bg-yellow-500/10',
    buttonColor: 'bg-yellow-600 hover:bg-yellow-500',
  },
  default: {
    icon: HelpCircle,
    iconColor: 'text-indigo-400',
    iconBg: 'bg-indigo-500/10',
    buttonColor: 'bg-indigo-600 hover:bg-indigo-500',
  },
};

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm bg-[#12121a] rounded-2xl shadow-2xl border border-[#1e1e3a] p-6">
        <div className="flex flex-col items-center text-center">
          <div className={`w-12 h-12 rounded-full ${config.iconBg} flex items-center justify-center mb-4`}>
            <Icon className={`w-6 h-6 ${config.iconColor}`} />
          </div>
          <h3 className="text-sm font-semibold text-[#e0e0e8] mb-2">{title}</h3>
          <p className="text-xs text-[#7a7a8e] mb-6 leading-relaxed">{message}</p>
          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-[#7a7a8e] hover:text-[#e0e0e8] hover:bg-[#1a1a2e] rounded-xl text-sm transition-all duration-200"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 px-4 py-2 text-white text-sm rounded-xl transition-all duration-200 ${config.buttonColor}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
