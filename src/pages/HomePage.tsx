import { ArrowRight, Gift } from 'lucide-react';
import { AccessPanel, CtaBand, ReviewList } from '@/components/domain/blocks';
import { FormulaCards, TrackCard, VehicleTeaser } from '@/components/domain/cards';
import { EventList } from '@/components/domain/events';
import { Seo } from '@/components/Seo';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Container, Eyebrow, Kerb, Section, SectionHeader } from '@/components/ui/layout';
import { Reveal } from '@/components/ui/Reveal';
import { HeroBackdrop } from '@/components/visuals';
import { contactContent, pageContent } from '@/lib/catalog';
import { addDays, formatInteger, todayInParis } from '@/lib/format';
import { summarizeOpening } from '@/lib/opening';
import { env } from '@/lib/env';
import { useBundle, useCatalog, usePublicCalendar } from '@/lib/queries';
import { businessJsonLd, websiteJsonLd } from '@/lib/seo/structured-data';

export default function HomePage() {
  const bundle = useBundle();
  const catalog = useCatalog();
  const page = pageContent(bundle, 'home');
  const sections = page.data.sections ?? {};
  const contact = contactContent(bundle);
  const today = todayInParis();
  const calendar = usePublicCalendar(today, addDays(today, 90));

  const upcoming = (calendar.data ?? [])
    .filter((item) => item.item_type !== 'track_status')
    .sort((a, b) => (a.starts_at ?? a.day).localeCompare(b.starts_at ?? b.day))
    .slice(0, 4);
  const trackNames = new Map(catalog.tracks.map((t) => [t.slug, t.short_name]));
  const featuredFleet = catalog.vehicles.filter((v) => catalog.sessionByVehicleId.get(v.id)?.is_featured).slice(0, 4);
  const lengths = catalog.circuits.map((t) => t.length_m).filter((l): l is number => l !== null);
  const youngest = [...catalog.vehicles].sort((a, b) => a.min_age - b.min_age)[0];
  const minAge = youngest?.min_age ?? 0;
  const opening = summarizeOpening(bundle.opening_hours);
  const everyDay = opening.length === 1 && opening[0]!.days === 'Tous les jours';

  const facts = [
    { label: 'Circuits', value: String(catalog.circuits.length), detail: lengths.map((l) => formatInteger(l)).join(' · ') + ' m' },
    everyDay
      ? { label: 'Ouvert', value: '7j/7', detail: opening[0]!.hours }
      : { label: 'Horaires', value: opening[0]?.hours ?? '', detail: opening[0]?.days ?? '' },
    { label: 'Dès', value: `${minAge} ans`, detail: youngest?.name ?? '' },
    { label: 'Karts', value: String(catalog.vehicles.length), detail: 'catégories' },
  ];

  return (
    <>
      <Seo title={page.data.seo_title} description={page.data.seo_description} jsonLd={[businessJsonLd(bundle, env.siteUrl), websiteJsonLd(bundle, env.siteUrl)]} />

      <section className="relative isolate overflow-hidden" aria-labelledby="hero-title">
        <HeroBackdrop image={page.data.hero_image} video={page.data.hero_video} poster={page.data.hero_poster} alt="Le circuit de Karting Roussillon" />
        <Container className="flex min-h-[min(760px,calc(100svh-4rem))] flex-col justify-end gap-7 pb-14 pt-24 sm:pb-20">
          {page.data.eyebrow && <Eyebrow>{page.data.eyebrow}</Eyebrow>}
          <h1 id="hero-title" className="max-w-5xl text-display-2xl font-extrabold uppercase">
            {page.title}
          </h1>
          <p className="max-w-xl text-lg text-asphalt-200 sm:text-xl">{page.body}</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/reserver" size="lg">
              {page.data.cta_primary ?? 'Réserver'}
            </ButtonLink>
            <ButtonLink to="/bon-cadeau" size="lg" variant="secondary">
              <Gift aria-hidden className="size-5" />
              {page.data.cta_secondary ?? 'Bon cadeau'}
            </ButtonLink>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-px border-t border-asphalt-700 pt-6 sm:grid-cols-4">
            {facts.map((fact) => (
              <div key={fact.label} className="flex flex-col gap-1 py-2 sm:pr-6">
                <dt className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-asphalt-400">{fact.label}</dt>
                <dd className="flex flex-col">
                  <span className="font-display text-4xl font-extrabold leading-none tabular">{fact.value}</span>
                  <span className="text-sm text-asphalt-400">{fact.detail}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Container>
        <Kerb className="absolute inset-x-0 bottom-0" />
      </section>

      <Section labelledBy="home-circuits">
        <div className="flex flex-col gap-10">
          <SectionHeader
            id="home-circuits"
            eyebrow="Les pistes"
            title={sections.circuits?.title ?? ''}
            intro={sections.circuits?.body}
            actions={
              <ButtonLink to="/circuits" variant="ghost">
                Tous les circuits <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            }
          />
          <ul className="grid gap-4 md:grid-cols-3">
            {catalog.circuits.map((track, i) => (
              <li key={track.id}>
                <Reveal delay={i * 0.08} className="h-full">
                  <TrackCard track={track} />
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section tone="raised" labelledBy="home-fleet">
        <div className="flex flex-col gap-10">
          <SectionHeader
            id="home-fleet"
            eyebrow="Karts & tarifs"
            title={sections.fleet?.title ?? ''}
            intro={sections.fleet?.body}
            actions={
              <ButtonLink to="/karts-tarifs" variant="ghost">
                Toute la flotte et les packs <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            }
          />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featuredFleet.map((vehicle, i) => (
              <li key={vehicle.id}>
                <Reveal delay={i * 0.06} className="h-full">
                  <VehicleTeaser vehicle={vehicle} catalog={catalog} />
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section labelledBy="home-formulas">
        <div className="flex flex-col gap-10">
          <SectionHeader id="home-formulas" eyebrow="Groupes & expériences" title={sections.formulas?.title ?? ''} intro={sections.formulas?.body} />
          <FormulaCards bundle={bundle} />
        </div>
      </Section>

      <Section tone="raised" labelledBy="home-events">
        <div className="flex flex-col gap-10">
          <SectionHeader
            id="home-events"
            eyebrow="Calendrier"
            title={sections.events?.title ?? ''}
            intro={sections.events?.body}
            actions={
              <ButtonLink to="/trackday" variant="ghost">
                Calendrier de la piste <ArrowRight aria-hidden className="size-4" />
              </ButtonLink>
            }
          />
          {calendar.isPending ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : upcoming.length > 0 ? (
            <EventList items={upcoming} trackNames={trackNames} />
          ) : (
            <EmptyState title="Aucun événement programmé">Les trackdays et privatisations à venir apparaîtront ici.</EmptyState>
          )}
        </div>
      </Section>

      {bundle.reviews.length > 0 && (
        <Section labelledBy="home-reviews">
          <div className="flex flex-col gap-10">
            <SectionHeader id="home-reviews" eyebrow="Avis" title={sections.reviews?.title ?? 'Avis'} intro={sections.reviews?.body || undefined} />
            <ReviewList reviews={bundle.reviews.slice(0, 3)} />
          </div>
        </Section>
      )}

      {contact && (
        <Section tone={bundle.reviews.length > 0 ? 'raised' : 'base'} labelledBy="home-access">
          <div className="flex flex-col gap-10">
            <SectionHeader id="home-access" eyebrow="Venir au circuit" title={sections.access?.title ?? ''} intro={sections.access?.body} />
            <AccessPanel contact={contact} openingHours={bundle.opening_hours} />
          </div>
        </Section>
      )}

      <CtaBand text={sections.cta} />
    </>
  );
}
