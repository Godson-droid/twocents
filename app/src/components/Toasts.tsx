import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

export interface Toast {
  id: number;
  kind: 'ok' | 'err' | 'info';
  title: string;
  body?: string;
  link?: { href: string; label: string };
}

const ToastContext = createContext<{ push: (t: Omit<Toast, 'id'>) => void }>({
  push: () => {},
});

export const useToasts = () => useContext(ToastContext);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = nextId++;
    setToasts((current) => [...current.slice(-3), { ...toast, id }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 9000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            <div className="t">{toast.title}</div>
            {toast.body && <div className="muted">{toast.body}</div>}
            {toast.link && (
              <div>
                <a href={toast.link.href} target="_blank" rel="noreferrer">
                  {toast.link.label}
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
