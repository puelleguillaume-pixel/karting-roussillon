import { PageHeader } from '@/components/domain/blocks';
import { Leaderboard } from '@/components/domain/Leaderboard';
import { Seo } from '@/components/Seo';
import { EmptyState, ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { Section } from '@/components/ui/layout';
import { pageContent } from '@/lib/catalog';
import { errorMessage } from '@/lib/data/errors';
import { useBundle, useLeaderboard } from '@/lib/queries';

export default function ChronosPage() {
  const bundle = useBundle();
  const page = pageContent(bundle, 'chronos');
  const leaderboard = useLeaderboard(10);

  return (
    <>
      <Seo title={page.data.seo_title} description={page.data.seo_description} />
      <PageHeader eyebrow={page.data.eyebrow ?? 'Classements'} title={page.title} intro={page.body} />
      <Section>
        {leaderboard.isPending ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        ) : leaderboard.isError ? (
          <ErrorPanel message={errorMessage(leaderboard.error)} onRetry={() => leaderboard.refetch()} />
        ) : leaderboard.data.length > 0 ? (
          <Leaderboard groups={leaderboard.data} />
        ) : (
          <EmptyState title="Classement à venir">Les meilleurs temps seront publiés ici par l'équipe du circuit.</EmptyState>
        )}
      </Section>
    </>
  );
}
