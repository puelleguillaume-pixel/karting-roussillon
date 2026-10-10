import { PageHeader } from '@/components/domain/blocks';
import { EventList } from '@/components/domain/events';
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

export default function EventsPage() {
  const bundle = useBundle();
  const catalog = useCatalog();
  const page = pageContent(bundle, 'evenements');
  const sections = page.data.sections ?? {};
  const today = todayInParis();
  const upcoming = usePublicCalendar(today, addDays(today, 180));
  const events = (upcoming.data ?? [])
    .filter((item) => item.item_type !== 'track_status')
    .sort((a, b) => (a.starts_at ?? a.day).localeCompare(b.starts_at ?? b.day));
  const trackNames = new Map(catalog.tracks.map((t) => [t.slug, t.short_name]));

  return (
    <>
      <Seo title={page.data.seo_title} description={page.data.seo_description} jsonLd={eventsJsonLd(events, bundle, env.siteUrl)} />
      <PageHeader eyebrow={page.data.eyebrow ?? 'Courses · Soirées · Privatisations'} title={page.title} intro={page.body} aside={<TrackIllustration shape="medium" className="w-full" />} />

      <Section labelledBy="evenements-liste">
        <div className="flex flex-col gap-10">
          <SectionHeader id="evenements-liste" eyebrow="Places en ligne" title={sections.events?.title ?? ''} intro={sections.events?.body || undefined} />
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
            <EmptyState title="Aucun événement programmé">Les prochaines dates seront publiées ici dès leur ouverture.</EmptyState>
          )}
        </div>
      </Section>
    </>
  );
}
