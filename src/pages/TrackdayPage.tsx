import { PageHeader } from '@/components/domain/blocks';
import { EventList, TrackCalendar } from '@/components/domain/events';
import { Seo } from '@/components/Seo';
import { EmptyState, ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { Section, SectionHeader } from '@/components/ui/layout';
import { TrackIllustration } from '@/components/visuals';
import { pageContent } from '@/lib/catalog';
import { errorMessage } from '@/lib/data/errors';
import { addDays, todayInParis } from '@/lib/format';
import { env } from '@/lib/env';
import { useBundle, useCatalog, usePublicCalendar } from '@/lib/queries';
import { eventsJsonLd } from '@/lib/seo/structured-data';

export default function TrackdayPage() {
  const bundle = useBundle();
  const catalog = useCatalog();
  const page = pageContent(bundle, 'trackday');
  const sections = page.data.sections ?? {};
  const today = todayInParis();
  const upcoming = usePublicCalendar(today, addDays(today, 180));
  const calendarTracks = catalog.tracks.filter((t) => t.usage === 'track_access' || t.usage === 'events');
  const events = (upcoming.data ?? [])
    .filter((item) => item.item_type === 'event')
    .sort((a, b) => (a.starts_at ?? a.day).localeCompare(b.starts_at ?? b.day));
  const trackNames = new Map(catalog.tracks.map((t) => [t.slug, t.short_name]));

  return (
    <>
      <Seo title={page.data.seo_title} description={page.data.seo_description} jsonLd={eventsJsonLd(events, bundle, env.siteUrl)} />
      <PageHeader eyebrow={page.data.eyebrow ?? 'Auto · Moto · Kart'} title={page.title} intro={page.body} aside={<TrackIllustration shape="long" className="w-full" />} />

      <Section labelledBy="trackday-calendar">
        <div className="flex flex-col gap-10">
          <SectionHeader id="trackday-calendar" eyebrow="Statut de la piste" title={sections.calendar?.title ?? ''} intro={sections.calendar?.body} />
          <TrackCalendar tracks={calendarTracks} />
        </div>
      </Section>

      <Section tone="raised" labelledBy="trackday-events">
        <div className="flex flex-col gap-10">
          <SectionHeader id="trackday-events" eyebrow="Places en ligne" title={sections.events?.title ?? ''} intro={sections.events?.body || undefined} />
          {upcoming.isPending ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : upcoming.isError ? (
            <ErrorPanel message={errorMessage(upcoming.error)} onRetry={() => upcoming.refetch()} />
          ) : events.length > 0 ? (
            <EventList items={events} trackNames={trackNames} />
          ) : (
            <EmptyState title="Aucun trackday programmé">Les prochaines dates seront publiées ici dès leur ouverture.</EmptyState>
          )}
        </div>
      </Section>
    </>
  );
}
