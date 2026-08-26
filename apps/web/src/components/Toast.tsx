/**
 * Toast Notification System
 * Usage: const { toast } = useToast();
 *        toast.success('Saved!');
 *        toast.error('Something went wrong');
 *        toast.info('Campaign scheduled');
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, message, duration }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = {
    success: (msg: string, d?: number) => addToast('success', msg, d),
    error: (msg: string, d?: number) => addToast('error', msg, d),
    info: (msg: string, d?: number) => addToast('info', msg, d),
    warning: (msg: string, d?: number) => addToast('warning', msg, d),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => (
          <ToastCard key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const config = {
    success: { icon: CheckCircle, bg: 'bg-white border-l-4 border-apple-green', iconColor: 'text-apple-green', label: 'Success' },
    error: { icon: XCircle, bg: 'bg-white border-l-4 border-apple-red', iconColor: 'text-apple-red', label: 'Error' },
    info: { icon: Info, bg: 'bg-white border-l-4 border-wa-teal', iconColor: 'text-wa-teal', label: 'Info' },
    warning: { icon: AlertTriangle, bg: 'bg-white border-l-4 border-apple-orange', iconColor: 'text-apple-orange', label: 'Warning' },
  }[toast.type];

  const Icon = config.icon;

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 ${config.bg} rounded-apple-xl shadow-apple-lg px-4 py-3 min-w-[300px] max-w-sm animate-slide-in`}
      style={{ animation: 'slideIn 0.25s ease-out' }}
    >
      <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ios-dark">{config.label}</p>
        <p className="text-sm text-ios-secondary mt-0.5 break-words">{toast.message}</p>
      </div>
      <button
        onClick={onClose}
        className="flex-shrink-0 p-1 hover:bg-ios-gray rounded-lg transition-colors"
      >
        <X className="w-4 h-4 text-ios-muted" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
