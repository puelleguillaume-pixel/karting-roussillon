import { Check, LoaderCircle } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { Container } from '@/components/ui/layout';
import { cx } from '@/lib/cx';
import { DEMO_PROGRESS_CHANNEL, DEMO_STEP_LABELS, type DemoProgress, type DemoStep } from '@/lib/data/demo/progress';
import { errorMessage } from '@/lib/data/errors';
import { env } from '@/lib/env';
import { useSiteBundle } from '@/lib/queries';

function PageSkeleton() {
  return (
    // Hauteur d'un écran : le pied de page ne remonte pas puis redescend (CLS)
    <Container className="flex min-h-svh flex-col gap-6 py-24" aria-busy="true">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-16 w-full max-w-2xl" />
      <Skeleton className="h-6 w-full max-w-xl" />
      <div className="flex gap-3 pt-4">
        <Skeleton className="h-14 w-48" />
        <Skeleton className="h-14 w-48" />
      </div>
    </Container>
  );
}

const STEPS: DemoStep[] = ['open', 'schema', 'seed', 'maintenance'];

/** Premier démarrage du mode démo : création de la base dans le navigateur. */
function DemoBootScreen() {
  const [progress, setProgress] = useState<DemoProgress>({ step: 'open' });

  useEffect(() => {
    const channel = new BroadcastChannel(DEMO_PROGRESS_CHANNEL);
    channel.onmessage = (event: MessageEvent<DemoProgress>) => setProgress(event.data);
    return () => channel.close();
  }, []);

  const currentIndex = STEPS.indexOf(progress.step);
  return (
    <Container className="flex min-h-[60svh] flex-col justify-center gap-8 py-20">
      <div className="flex flex-col gap-3">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-flag-blue">Mode démonstration</p>
        <h1 className="text-display-lg font-extrabold uppercase">Préparation de la piste…</h1>
        <p className="max-w-xl text-asphalt-300">
          La base de données du site est créée dans votre navigateur (quelques secondes au premier chargement, instantané ensuite).
        </p>
      </div>
      <ol className="flex flex-col gap-3" aria-live="polite">
        {STEPS.map((step, index) => {
          const done = index < currentIndex || progress.step === 'ready';
          const active = index === currentIndex && progress.step !== 'ready';
          return (
            <li key={step} className={cx('flex items-center gap-3', !done && !active && 'text-asphalt-400')}>
              {done ? (
                <Check aria-hidden className="size-5 text-flag-green" />
              ) : active ? (
                <LoaderCircle aria-hidden className="size-5 animate-spin text-race-400" />
              ) : (
                <span aria-hidden className="size-5" />
              )}
              <span>
                {DEMO_STEP_LABELS[step]}
                {active && step === 'schema' && progress.total ? ` (${progress.done ?? 0}/${progress.total})` : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </Container>
  );
}

/** N'affiche les pages qu'une fois le catalogue et les contenus chargés. */
export function BundleGate({ children }: { children: ReactNode }) {
  const bundle = useSiteBundle();
  if (bundle.data) return <>{children}</>;
  if (bundle.isError) {
    return (
      <Container className="py-24">
        <ErrorPanel message={errorMessage(bundle.error)} onRetry={() => bundle.refetch()} />
      </Container>
    );
  }
  return env.dataSource === 'demo' ? <DemoBootScreen /> : <PageSkeleton />;
}
