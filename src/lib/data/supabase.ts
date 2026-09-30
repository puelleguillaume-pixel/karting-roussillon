import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AuthUser, DataSource, RpcArgs } from './source';

function toUser(session: Session | null): AuthUser | null {
  const user = session?.user;
  return user?.email ? { id: user.id, email: user.email } : null;
}

/**
 * Source Supabase. Les visiteurs (la grande majorité) n'ont pas de session :
 * leurs appels RPC passent par un simple fetch vers PostgREST, sans charger
 * supabase-js (~60 Ko compressés). La bibliothèque n'est chargée que pour
 * l'authentification : session enregistrée, retour de lien magique, connexion.
 */
export function createSupabaseSource(url: string, anonKey: string): DataSource {
  // Clé de stockage de session de supabase-js : sb-<référence du projet>-auth-token
  const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  const listeners = new Set<(user: AuthUser | null) => void>();
  let clientPromise: Promise<SupabaseClient> | null = null;

  const mayHaveSession = () => {
    try {
      if (window.localStorage.getItem(storageKey)) return true;
    } catch {
      // stockage indisponible : pas de session persistée
    }
    // Retour d'un lien magique : uniquement sur les pages de connexion (redirectTo)
    const { pathname, searchParams, hash } = new URL(window.location.href);
    const authPage = pathname.startsWith('/mon-compte') || pathname.startsWith('/admin');
    return authPage && (searchParams.has('code') || hash.includes('access_token'));
  };

  const loadClient = () =>
    (clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => {
      const client = createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      });
      client.auth.onAuthStateChange((_event, session) => {
        const user = toUser(session);
        listeners.forEach((listener) => listener(user));
      });
      return client;
    }));

  async function anonRpc<T>(fn: string, args: RpcArgs): Promise<T> {
    const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const text = await response.text();
    const body: unknown = text ? JSON.parse(text) : null;
    // Erreur PostgREST { code, message, hint, details } : normalisée par RpcError.from
    if (!response.ok) throw body ?? new Error(`HTTP ${response.status}`);
    return body as T;
  }

  return {
    kind: 'supabase',

    async rpc<T>(fn: string, args?: RpcArgs) {
      if (!clientPromise && !mayHaveSession()) return anonRpc<T>(fn, args ?? {});
      const client = await loadClient();
      const { data, error } = await client.rpc(fn, args ?? {});
      if (error) throw error;
      return data as T;
    },

    auth: {
      async getUser() {
        if (!clientPromise && !mayHaveSession()) return null;
        const { data } = await (await loadClient()).auth.getSession();
        return toUser(data.session);
      },
      async signInWithEmail(email, redirectTo) {
        const { error } = await (await loadClient()).auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
        });
        if (error) throw error;
        return { mode: 'magic_link' };
      },
      async signOut() {
        if (clientPromise) await (await clientPromise).auth.signOut();
      },
      onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
}
