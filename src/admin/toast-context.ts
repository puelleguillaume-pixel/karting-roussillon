import { createContext, useContext } from 'react';

export interface ToastApi {
  success(message: string): void;
  /** Accepte une erreur RPC : son message métier est affiché */
  error(error: unknown): void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast() doit être utilisé dans <ToastProvider>');
  return context;
}
