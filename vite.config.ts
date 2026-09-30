import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // PGlite (mode démo) charge ses fichiers WASM lui-même : pas de pré-bundling
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
    // Chargé à la demande (page de réservation) : pré-optimisé pour éviter un
    // rechargement complet en développement à sa première utilisation
    include: ['qrcode', 'pdf-lib', 'jsqr'],
  },
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  build: {
    target: 'es2022',
    // Seul le worker du mode démo (PGlite + SQL, ~0,9 Mo) dépasse 500 Ko ;
    // il n'est jamais chargé quand le site est branché sur Supabase.
    chunkSizeWarningLimit: 1000,
  },
});
