import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './app/App';
import { createRouter } from './app/router';

const container = document.getElementById('root');
if (!container) throw new Error('#root introuvable');

const router = await createRouter();
const app = (
  <StrictMode>
    <App router={router} />
  </StrictMode>
);

// Pages publiques pré-rendues au build (scripts/prerender.mjs) : React reprend le
// HTML existant (hydratation). Un écart (données changées depuis le build,
// préférences du visiteur) est corrigé par un rendu client, sans erreur visible.
if (container.firstElementChild) {
  hydrateRoot(container, app, {
    onRecoverableError: (error, info) => {
      // Relevé consulté par les tests de bout en bout
      const w = window as Window & { __krHydrationMismatches?: number; __krHydrationErrors?: string[] };
      w.__krHydrationMismatches = (w.__krHydrationMismatches ?? 0) + 1;
      (w.__krHydrationErrors ??= []).push(`${String(error)}${info.componentStack ?? ''}`.slice(0, 2000));
      if (import.meta.env.DEV) console.warn('[hydratation]', error);
    },
  });
} else {
  // Page sans pré-rendu (réservation, compte, espace dirigeant) : les balises
  // génériques de la coquille laissent la place à celles de la page (le titre
  // générique reste affiché pendant le chargement)
  document.querySelectorAll('[data-prerender]:not(title)').forEach((node) => node.remove());
  createRoot(container).render(app);
}
