#!/usr/bin/env bash
# Version de production (Supabase) servie en local contre le faux Supabase
# (scripts/mock-supabase.mjs) : mesures Lighthouse et tests du chemin Supabase.
set -e
export VITE_DATA_SOURCE=supabase VITE_SUPABASE_URL=http://localhost:4174 VITE_SUPABASE_ANON_KEY=cle-locale
npx vite build --outDir dist-prod
npx vite build --ssr src/entry-server.tsx --outDir dist-ssr-prod
KR_DIST_DIR=dist-prod KR_SSR_DIR=dist-ssr-prod node scripts/prerender.mjs
