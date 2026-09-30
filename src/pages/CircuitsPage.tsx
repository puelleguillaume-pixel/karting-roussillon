import { ArrowRight, CalendarDays } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/domain/blocks';
import { Seo } from '@/components/Seo';
import { ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Container, Eyebrow, Kerb } from '@/components/ui/layout';
import { Reveal } from '@/components/ui/Reveal';
import { trackShapeFor } from '@/components/trackShapes';
import { MediaImage, TrackIllustration } from '@/components/visuals';
import { pageContent, TRACK_USAGE_LABELS, vehiclesOnTrack } from '@/lib/catalog';
import { cx } from '@/lib/cx';
import type { Track } from '@/lib/data/types';
import { formatInteger } from '@/lib/format';
import { useBundle, useCatalog } from '@/lib/queries';

function TrackActions({ track }: { track: Track }) {
  if (track.usage === 'events') {
    return (
      <ButtonLink to="/trackday">
        <CalendarDays aria-hidden className="size-4" />
        Trackdays & événements
      </ButtonLink>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      {track.online_booking_enabled && <ButtonLink to="/reserver">Réserver une session</ButtonLink>}
      {track.usage === 'track_access' && (
        <ButtonLink to="/trackday" variant="secondary">
          <CalendarDays aria-hidden className="size-4" />
          Calendrier des droits de piste
        </ButtonLink>
      )}
    </div>
  );
}

export default function CircuitsPage() {
  const bundle = useBundle();
  const catalog = useCatalog();
  const page = pageContent(bundle, 'circuits');
  const extraTracks = catalog.tracks.filter((t) => !t.display_on_circuits);

  return (
    <>
      <Seo title={page.data.seo_title} description={page.data.seo_description} />
      <PageHeader eyebrow={page.data.eyebrow ?? `${catalog.circuits.length} tracés`} title={page.title} intro={page.body} />

      <nav aria-label="Circuits" className="sticky top-16 z-20 border-b border-asphalt-800 bg-asphalt-950/90 backdrop-blur-md lg:top-[4.5rem]">
        <Container className="flex gap-1 overflow-x-auto py-2">
          {catalog.circuits.map((track) => (
            <a
              key={track.slug}
              href={`#${track.slug}`}
              className="shrink-0 px-3 py-2 font-display text-sm font-semibold uppercase tracking-wide text-asphalt-300 hover:text-chalk"
            >
              {track.short_name}
              {track.length_m && <span className="ml-1.5 text-asphalt-400">{formatInteger(track.length_m)} m</span>}
            </a>
          ))}
        </Container>
      </nav>

      {catalog.circuits.map((track, index) => {
        const vehicles = vehiclesOnTrack(track.id, catalog);
        return (
          <section
            key={track.id}
            id={track.slug}
            aria-labelledby={`${track.slug}-title`}
            className={cx('scroll-mt-32 py-16 sm:py-24', index % 2 === 1 && 'bg-asphalt-900')}
          >
            <Container className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <Reveal className={cx('relative', index % 2 === 1 && 'lg:order-2')}>
                <div className="relative aspect-[4/3] overflow-hidden bg-asphalt-850 ring-1 ring-asphalt-800">
                  {track.image_path ? (
                    <MediaImage path={track.image_path} alt={track.name} />
                  ) : (
                    <>
                      <div aria-hidden className="speed-lines absolute inset-0" />
                      <TrackIllustration shape={trackShapeFor(track.slug)} className="absolute inset-0 h-full w-full p-6 sm:p-10" title={`Illustration du ${track.name}`} />
                    </>
                  )}
                  <Kerb className="absolute inset-x-0 bottom-0" />
                </div>
              </Reveal>
              <div className="flex flex-col gap-6">
                <Eyebrow>{TRACK_USAGE_LABELS[track.usage]}</Eyebrow>
                {track.length_m && (
                  <p aria-hidden className="font-display text-[clamp(4.5rem,14vw,9rem)] font-extrabold leading-[0.8] tabular">
                    {formatInteger(track.length_m)}
                    <span className="ml-2 text-[0.35em] text-asphalt-400">m</span>
                  </p>
                )}
                <h2 id={`${track.slug}-title`} className="text-display-lg font-bold uppercase">
                  {track.name}
                  {track.length_m && <span className="sr-only"> — {formatInteger(track.length_m)} mètres</span>}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {track.min_age !== null && <Chip>Dès {track.min_age} ans</Chip>}
                  {track.requires_booking ? <Chip tone="yellow">Réservation obligatoire</Chip> : <Chip tone="green">Accès sans réservation</Chip>}
                </div>
                <p className="max-w-[60ch] text-lg text-asphalt-200">{track.description}</p>
                {vehicles.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-asphalt-400">Karts sur ce circuit</p>
                    <ul className="flex flex-wrap gap-2">
                      {vehicles.map((vehicle) => (
                        <li key={vehicle.id}>
                          <Link
                            to={`/karts-tarifs#${vehicle.slug}`}
                            className="inline-flex items-center gap-1.5 bg-asphalt-800 px-3 py-2 text-sm font-medium text-chalk ring-1 ring-asphalt-700 transition-colors hover:ring-race-400"
                          >
                            {vehicle.name}
                            <ArrowRight aria-hidden className="size-3.5 text-race-400" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <TrackActions track={track} />
              </div>
            </Container>
          </section>
        );
      })}

      {extraTracks.length > 0 && (
        <section aria-label="Autres pistes" className="border-t border-asphalt-800 py-14">
          <Container className="grid gap-4 md:grid-cols-2">
            {extraTracks.map((track) => (
              <div key={track.id} className="flex items-center gap-5 bg-asphalt-900 p-5 ring-1 ring-asphalt-800">
                <TrackIllustration shape={trackShapeFor(track.slug)} animated={false} className="h-20 w-28 shrink-0" />
                <div className="flex flex-col gap-1.5">
                  <h2 className="font-display text-xl font-bold uppercase">{track.name}</h2>
                  <p className="text-sm text-asphalt-300">{track.description}</p>
                </div>
              </div>
            ))}
          </Container>
        </section>
      )}
    </>
  );
}
