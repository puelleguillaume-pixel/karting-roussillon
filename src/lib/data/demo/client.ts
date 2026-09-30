import { PGliteWorker } from '@electric-sql/pglite/worker';
import type { AuthUser, DataSource, RpcArgs } from '../source';
import type { ActivatedGiftCard, OutboxEmail } from '../types';
import { DEMO_FLUSH_CHANNEL } from './progress';

interface FunctionMeta {
  argNames: string[];
  argTypes: string[];
  returnsSet: boolean;
  returnType: string;
  /** Fonction qui écrit (volatile) : la base est recopiée dans IndexedDB avant de répondre */
  writes: boolean;
}

interface CallResult<T> {
  ok: boolean;
  result?: T;
  error?: { message: string; hint: string | null; detail: string | null; code: string };
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Attend que la base soit recopiée dans IndexedDB (worker PGlite, voir
 * worker.ts). Délai de garde : la démo reste utilisable même sans réponse.
 */
function flushToIndexedDb(): Promise<void> {
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const channel = new BroadcastChannel(DEMO_FLUSH_CHANNEL);
    const done = () => {
      clearTimeout(timer);
      channel.close();
      resolve();
    };
    const timer = setTimeout(done, 5000);
    channel.onmessage = (event: MessageEvent<{ id?: string }>) => {
      if (event.data?.id === id) done();
    };
    channel.postMessage({ id });
  });
}
const AUTH_STORAGE_KEY = 'kr-demo-auth';
/** Compte dirigeant de démonstration (créé par supabase/seed_demo.sql). */
const DEMO_OWNER_ID = '00000000-0000-4000-8000-00000000d0e0';

/** Expression SQL qui lit l'argument `name` dans le JSON $1, au bon type. */
function castArgument(name: string, type: string): string {
  if (type === 'jsonb') return `nullif($1->'${name}', 'null'::jsonb)`;
  if (type === 'json') return `nullif($1->'${name}', 'null'::jsonb)::json`;
  if (type.endsWith('[]')) {
    return `(case when jsonb_typeof($1->'${name}') = 'array'
              then array(select jsonb_array_elements_text($1->'${name}')) end)::${type}`;
  }
  return `($1->>'${name}')::${type}`;
}

function buildCall(fn: string, meta: FunctionMeta, args: RpcArgs): string {
  const unknown = Object.keys(args).filter((name) => !meta.argNames.includes(name));
  if (unknown.length > 0) throw new Error(`Argument(s) inconnu(s) pour ${fn} : ${unknown.join(', ')}`);

  const named = meta.argNames
    .map((name, index) => (name in args ? `${name} => ${castArgument(name, meta.argTypes[index]!)}` : null))
    .filter((part): part is string => part !== null);
  const call = `public.${fn}(${named.join(', ')})`;

  if (meta.returnsSet) return `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from ${call} t`;
  if (meta.returnType === 'void') return `with c as (select ${call}) select null::jsonb from c`;
  return `select to_jsonb(${call})`;
}

function readStoredUser(): AuthUser | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function storeUser(user: AuthUser | null) {
  try {
    if (user) window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // stockage indisponible : la connexion simulée ne dure que le temps de la page
  }
}

export async function createDemoSource(): Promise<DataSource> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'kr-demo-db' });
  const pg = await PGliteWorker.create(worker);

  const { rows } = await pg.query<{ name: string; arg_names: string[] | null; arg_types: string[]; returns_set: boolean; return_type: string; writes: boolean }>(`
    select p.proname as name,
           (p.proargnames)[1:p.pronargs] as arg_names,
           array(select format_type(t, null) from unnest(p.proargtypes::oid[]) with ordinality as a(t, i) order by i) as arg_types,
           p.proretset as returns_set,
           format_type(p.prorettype, null) as return_type,
           p.provolatile = 'v' as writes
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
  `);
  const functions = new Map<string, FunctionMeta>(
    rows.map((row) => [
      row.name,
      { argNames: row.arg_names ?? [], argTypes: row.arg_types, returnsSet: row.returns_set, returnType: row.return_type, writes: row.writes },
    ]),
  );

  // Connexion simulée : un utilisateur auth.users local, sans vérification d'email.
  // Une session mémorisée d'une base de démo précédente (réinitialisée ou mise
  // à jour depuis) est oubliée : son utilisateur n'existe plus.
  let currentUser = readStoredUser();
  if (currentUser) {
    const { rows: known } = await pg.query(`select 1 from auth.users where id = $1`, [currentUser.id]);
    if (known.length === 0) {
      currentUser = null;
      storeUser(null);
    }
  }
  const listeners = new Set<(user: AuthUser | null) => void>();
  const setUser = (user: AuthUser | null) => {
    currentUser = user;
    storeUser(user);
    listeners.forEach((listener) => listener(user));
  };

  // Exécute une RPC « comme PostgREST » : sous un rôle et un utilisateur donnés.
  async function callAs<T>(role: 'anon' | 'authenticated', uid: string | null, fn: string, args: RpcArgs): Promise<T> {
    const meta = functions.get(fn);
    if (!IDENTIFIER.test(fn) || !meta) throw new Error(`RPC inconnue : ${fn}`);
    const sql = buildCall(fn, meta, args);
    const { rows: result } = await pg.query<{ r: CallResult<T> }>(`select demo.call_as($1, $2, $3, $4::jsonb) as r`, [
      role,
      uid,
      sql,
      JSON.stringify(args),
    ]);
    const outcome = result[0]?.r;
    if (!outcome) throw new Error(`Réponse vide pour ${fn}`);
    // Écriture : attendre la copie vers IndexedDB (sinon un rechargement
    // immédiat de la page pourrait perdre la réservation qui vient d'être faite)
    if (meta.writes && outcome.ok) await flushToIndexedDb();
    if (!outcome.ok) throw outcome.error;
    return outcome.result as T;
  }

  return {
    kind: 'demo',

    // Rôle anon, ou authenticated si un client est connecté (connexion simulée)
    rpc<T>(fn: string, args: RpcArgs = {}): Promise<T> {
      return callAs<T>(currentUser ? 'authenticated' : 'anon', currentUser?.id ?? null, fn, args);
    },

    auth: {
      async getUser() {
        return currentUser;
      },
      async signInWithEmail(email) {
        const normalized = email.trim().toLowerCase();
        const { rows: found } = await pg.query<{ id: string }>(
          `with existing as (select id from auth.users where lower(email) = $1 limit 1),
                created as (insert into auth.users (email, email_confirmed_at)
                            select $1, now() where not exists (select 1 from existing) returning id)
           select id from existing union all select id from created`,
          [normalized],
        );
        const id = found[0]?.id;
        if (!id) throw new Error('Connexion de démonstration impossible');
        await flushToIndexedDb();
        setUser({ id, email: normalized });
        return { mode: 'demo' };
      },
      async signOut() {
        setUser(null);
      },
      onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },

    demo: {
      async activateGiftCard(orderReference: string) {
        const { rows: cards } = await pg.query<{ id: string }>(`select id from public.gift_cards where order_reference = $1`, [orderReference]);
        const id = cards[0]?.id;
        if (!id) throw new Error('Commande introuvable');
        return callAs<ActivatedGiftCard>('authenticated', DEMO_OWNER_ID, 'admin_activate_gift_card', { p_gift_card_id: id, p_method: 'card' });
      },
      async listOutbox() {
        const { rows: emails } = await pg.query<OutboxEmail>(
          `select id, template, to_email, payload, status,
                  to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
           from public.email_outbox order by created_at desc limit 200`,
        );
        return emails;
      },
      async reset() {
        storeUser(null);
        await pg.close().catch(() => undefined);
        worker.terminate();
        if (typeof indexedDB.databases === 'function') {
          const databases = await indexedDB.databases();
          await Promise.all(
            databases
              .map((db) => db.name)
              .filter((name): name is string => !!name && name.includes('kr-demo-'))
              .map(
                (name) =>
                  new Promise<void>((resolve) => {
                    const request = indexedDB.deleteDatabase(name);
                    request.onsuccess = request.onerror = request.onblocked = () => resolve();
                  }),
              ),
          );
        }
        window.location.reload();
      },
    },
  };
}
