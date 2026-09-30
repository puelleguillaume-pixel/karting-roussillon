import { createBrowserRouter, matchRoutes, type RouteObject } from 'react-router';
import { routes } from './routes';

/**
 * Charge les modules (pages chargées à la demande) de l'URL courante avant le
 * premier rendu : indispensable pour hydrater le HTML pré-rendu sans écart.
 */
async function preloadCurrentRoute(list: RouteObject[]) {
  const matches = matchRoutes(list, window.location) ?? [];
  await Promise.all(
    matches.map(async ({ route }) => {
      if (typeof route.lazy !== 'function') return;
      const loaded = await route.lazy();
      Object.assign(route, loaded, { lazy: undefined });
    }),
  );
}

export async function createRouter() {
  await preloadCurrentRoute(routes);
  return createBrowserRouter(routes);
}
