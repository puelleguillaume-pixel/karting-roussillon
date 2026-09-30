export type DataSourceKind = 'supabase' | 'demo';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || undefined;

function resolveDataSource(): DataSourceKind {
  const explicit = import.meta.env.VITE_DATA_SOURCE?.trim();
  if (explicit === 'supabase' || explicit === 'demo') return explicit;
  return supabaseUrl ? 'supabase' : 'demo';
}

export const env = {
  dataSource: resolveDataSource(),
  supabaseUrl,
  supabaseAnonKey,
  siteUrl: (import.meta.env.VITE_SITE_URL?.trim() || 'https://www.kartingroussillon.com').replace(/\/$/, ''),
} as const;
