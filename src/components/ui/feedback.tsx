import { CircleAlert, CircleCheck, Info, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('animate-pulse rounded-sm bg-asphalt-800', className)} />;
}

type AlertTone = 'info' | 'success' | 'error';

const ALERT_STYLES: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: { box: 'border-flag-blue/40 bg-flag-blue/10', icon: <Info className="text-flag-blue" /> },
  success: { box: 'border-flag-green/40 bg-flag-green/10', icon: <CircleCheck className="text-flag-green" /> },
  error: { box: 'border-race-400/50 bg-race-600/10', icon: <CircleAlert className="text-race-400" /> },
};

export function Alert({ tone = 'info', title, children, className }: { tone?: AlertTone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const style = ALERT_STYLES[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 border-l-4 p-4', style.box, className)}>
      <span aria-hidden className="mt-0.5 shrink-0 [&>svg]:size-5">
        {style.icon}
      </span>
      <div className="flex flex-col gap-1 text-sm">
        {title && <p className="font-semibold text-chalk">{title}</p>}
        {children && <div className="text-asphalt-200">{children}</div>}
      </div>
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <Alert tone="error" title="Chargement impossible">
        {message}
      </Alert>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCcw aria-hidden className="size-4" />
          Réessayer
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 border border-dashed border-asphalt-600 p-6">
      <p className="font-display text-display-sm font-bold uppercase text-chalk">{title}</p>
      {children && <div className="text-asphalt-300">{children}</div>}
    </div>
  );
}
