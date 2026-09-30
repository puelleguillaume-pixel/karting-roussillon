import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ButtonLink } from '@/components/ui/Button';
import { Container, Eyebrow } from '@/components/ui/layout';
import NotFoundPage from '@/pages/NotFoundPage';

/** Erreur de rendu ou de chargement d'une page. */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  if (import.meta.env.DEV) console.error(error);
  return (
    <Container className="flex min-h-[60svh] flex-col justify-center gap-6 py-24">
      <Eyebrow>Incident</Eyebrow>
      <h1 className="text-display-xl font-extrabold uppercase">Drapeau rouge</h1>
      <p className="max-w-lg text-lg text-asphalt-200">
        Cette page a rencontré un problème. Rechargez-la ou revenez à l'accueil.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-12 bg-race-600 px-6 font-display font-bold uppercase tracking-wide text-white hover:bg-race-500"
        >
          Recharger
        </button>
        <ButtonLink to="/" variant="secondary">
          Accueil
        </ButtonLink>
      </div>
    </Container>
  );
}
