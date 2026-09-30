import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthContextValue } from './auth-context';
import { getDataSource, type AuthUser } from './data/source';

/** Session client (compte « Mon compte ») : Supabase Auth ou connexion simulée en démo. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    getDataSource()
      .then(async (source) => {
        const current = await source.auth.getUser();
        if (cancelled) return;
        setUser(current);
        setReady(true);
        unsubscribe = source.auth.onChange((next) => {
          setUser(next);
          void queryClient.invalidateQueries({ queryKey: ['me'] });
        });
      })
      .catch(() => setReady(true));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [queryClient]);

  const signIn = useCallback(async (email: string, redirectPath = '/mon-compte') => {
    const source = await getDataSource();
    return source.auth.signInWithEmail(email, `${window.location.origin}${redirectPath}`);
  }, []);

  const signOut = useCallback(async () => {
    const source = await getDataSource();
    await source.auth.signOut();
    queryClient.removeQueries({ queryKey: ['me'] });
    queryClient.removeQueries({ queryKey: ['admin'] });
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => ({ user, ready, signIn, signOut }), [user, ready, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
