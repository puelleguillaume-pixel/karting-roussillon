import { createContext, useContext } from 'react';
import type { AuthUser } from '@/lib/data/source';

export interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  /** redirectPath : page ouverte par le lien magique (Mon compte par défaut) */
  signIn: (email: string, redirectPath?: string) => Promise<{ mode: 'magic_link' | 'demo' }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth() doit être utilisé dans <AuthProvider>');
  return context;
}
