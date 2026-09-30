import { env, type DataSourceKind } from '@/lib/env';
import { RpcError } from './errors';
import type { ActivatedGiftCard, OutboxEmail } from './types';

export type RpcArgs = Record<string, unknown>;

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthApi {
  getUser(): Promise<AuthUser | null>;
  /** Supabase : envoie un lien magique. Démo : connexion simulée immédiate. */
  signInWithEmail(email: string, redirectTo: string): Promise<{ mode: 'magic_link' | 'demo' }>;
  signOut(): Promise<void>;
  onChange(listener: (user: AuthUser | null) => void): () => void;
}

/**
 * Accès aux données : exclusivement par RPC (fonctions Postgres exposées).
 * Deux implémentations au contrat identique :
 *   - supabase : PostgREST via supabase-js ;
 *   - demo     : la même base (migrations + seed) dans le navigateur via PGlite.
 */
export interface DataSource {
  readonly kind: DataSourceKind;
  rpc<T>(fn: string, args?: RpcArgs): Promise<T>;
  auth: AuthApi;
  /** Mode démo uniquement */
  demo?: {
    reset(): Promise<void>;
    listOutbox(): Promise<OutboxEmail[]>;
    /** Simule l'encaissement à l'accueil d'une commande de bon (compte dirigeant de démo). */
    activateGiftCard(orderReference: string): Promise<ActivatedGiftCard>;
  };
}

let sourcePromise: Promise<DataSource> | null = null;

export function getDataSource(): Promise<DataSource> {
  sourcePromise ??= (async () => {
    if (env.dataSource === 'supabase') {
      if (!env.supabaseUrl || !env.supabaseAnonKey) {
        throw new RpcError('CONFIG', 'Configuration Supabase incomplète (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
      }
      const { createSupabaseSource } = await import('./supabase');
      return createSupabaseSource(env.supabaseUrl, env.supabaseAnonKey);
    }
    const { createDemoSource } = await import('./demo/client');
    return createDemoSource();
  })();
  sourcePromise.catch(() => {
    sourcePromise = null; // nouvel essai possible
  });
  return sourcePromise;
}

export async function rpc<T>(fn: string, args?: RpcArgs): Promise<T> {
  const source = await getDataSource();
  try {
    return await source.rpc<T>(fn, args);
  } catch (error) {
    throw RpcError.from(error);
  }
}
