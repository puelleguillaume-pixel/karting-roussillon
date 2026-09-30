// Pré-rendu au build (scripts/prerender.mjs) : chaque page publique est rendue
// en HTML avec les vraies données du site, pour un affichage immédiat et pour
// les robots. Le navigateur reprend ensuite ce HTML (hydratation, main.tsx).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion, MotionConfig } from 'framer-motion';
import { renderToString } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';
import { routes } from './app/routes';
import { AuthProvider } from './lib/AuthProvider';
import { ConsentProvider } from './lib/ConsentProvider';
import type { SiteBundle } from './lib/data/types';
import { queryKeys } from './lib/queries';

const loadMotionFeatures = () => import('./app/motion-features').then((module) => module.default);

export async function render(path: string, bundle: SiteBundle): Promise<string> {
  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(`http://prerender.local${path}`));
  if (context instanceof Response) throw new Error(`Redirection inattendue au pré-rendu de ${path}`);
  const router = createStaticRouter(handler.dataRoutes, context);

  // Seules les données communes sont fournies : les autres requêtes (calendrier,
  // chronos…) s'affichent en chargement et sont faites par le navigateur.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  queryClient.setQueryData(queryKeys.bundle, bundle);

  return renderToString(
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={loadMotionFeatures} strict>
          <ConsentProvider>
            <AuthProvider>
              <StaticRouterProvider router={router} context={context} hydrate={false} />
            </AuthProvider>
          </ConsentProvider>
        </LazyMotion>
      </MotionConfig>
    </QueryClientProvider>,
  );
}
