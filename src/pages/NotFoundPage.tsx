import { Seo } from '@/components/Seo';
import { ButtonLink } from '@/components/ui/Button';
import { Container, Eyebrow } from '@/components/ui/layout';

export default function NotFoundPage() {
  return (
    <>
      <Seo title="Page introuvable · Karting Roussillon" noIndex />
      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="checker absolute -right-10 top-10 -z-10 size-72 rotate-12 text-chalk/[0.05] [--checker:36px]" />
        <Container className="flex min-h-[60svh] flex-col justify-center gap-6 py-24">
          <Eyebrow>Erreur 404</Eyebrow>
          <h1 className="text-display-2xl font-extrabold uppercase">Hors piste</h1>
          <p className="max-w-lg text-lg text-asphalt-200">Cette page n'existe pas ou a changé d'adresse. Reprenez la piste depuis l'accueil.</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/" size="lg">
              Retour à l'accueil
            </ButtonLink>
            <ButtonLink to="/karts-tarifs" size="lg" variant="secondary">
              Karts & tarifs
            </ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}
