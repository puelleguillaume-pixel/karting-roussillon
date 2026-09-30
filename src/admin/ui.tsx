import { ChevronLeft, ChevronRight, LoaderCircle, Search, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Skeleton } from '@/components/ui/feedback';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/data/errors';
import { formatInteger } from '@/lib/format';
import type { Tone } from './labels';
import { ToastContext } from './toast-context';

// -----------------------------------------------------------------------------
// Mise en page
// -----------------------------------------------------------------------------
export function AdminPage({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <title>{`${title} · Espace dirigeant`}</title>
      <meta name="robots" content="noindex, nofollow" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-3xl font-extrabold uppercase leading-none sm:text-4xl">{title}</h1>
          {description && <p className="max-w-3xl text-sm text-asphalt-300">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cx('flex min-w-0 flex-col bg-asphalt-900 ring-1 ring-asphalt-800', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-asphalt-800 px-4 py-3">
          {title && <h2 className="font-display text-lg font-bold uppercase leading-tight">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('min-w-0', padded && 'p-4')}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'red' | 'green' | 'yellow' }) {
  return (
    <div className="flex flex-col gap-1 bg-asphalt-900 p-4 ring-1 ring-asphalt-800">
      <p className="text-xs font-semibold uppercase tracking-wider text-asphalt-400">{label}</p>
      <p
        className={cx(
          'font-display text-3xl font-extrabold leading-none tabular',
          tone === 'red' && 'text-race-400',
          tone === 'green' && 'text-flag-green',
          tone === 'yellow' && 'text-flag-yellow',
        )}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-asphalt-400">{hint}</p>}
    </div>
  );
}

export function StatusChip({ status }: { status: { label: string; tone: Tone } }) {
  return <Chip tone={status.tone}>{status.label}</Chip>;
}

export function DefinitionList({ items }: { items: Array<[ReactNode, ReactNode] | null | false | '' | 0 | undefined> }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">
      {items.filter(Boolean).map((item, index) => {
        const [term, value] = item as [ReactNode, ReactNode];
        return (
          <div key={index} className="contents">
            <dt className="text-asphalt-400">{term}</dt>
            <dd className="min-w-0 break-words text-chalk">{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

// -----------------------------------------------------------------------------
// Boutons compacts (le bouton biseauté du site reste utilisé pour les actions principales)
// -----------------------------------------------------------------------------
type SmallVariant = 'default' | 'primary' | 'danger' | 'ghost';

export function SmallButton({
  variant = 'default',
  busy,
  className,
  children,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: SmallVariant; busy?: boolean }) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        variant === 'default' && 'bg-asphalt-800 text-chalk ring-1 ring-asphalt-600 hover:bg-asphalt-700',
        variant === 'primary' && 'bg-race-600 text-white hover:bg-race-500',
        variant === 'danger' && 'bg-race-600/15 text-race-400 ring-1 ring-race-400/50 hover:bg-race-600/25',
        variant === 'ghost' && 'text-asphalt-200 hover:bg-asphalt-800 hover:text-chalk',
        className,
      )}
      disabled={busy || props.disabled}
      {...props}
    >
      {busy && <LoaderCircle aria-hidden className="animate-spin" />}
      {children}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Champs compacts
// -----------------------------------------------------------------------------
const INPUT =
  'h-10 w-full min-w-0 border border-asphalt-600 bg-asphalt-950 px-3 text-sm text-chalk placeholder:text-asphalt-500 focus:border-race-400 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-race-400 aria-invalid:border-race-400 disabled:opacity-60';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-asphalt-300">
        {label}
      </label>
      {children(id, describedBy)}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-asphalt-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-race-400">
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'children'> & { label: ReactNode; hint?: ReactNode; error?: string; suffix?: ReactNode };

export function Input({ label, hint, error, className, suffix, ...props }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, describedBy) =>
        suffix ? (
          <div className="flex">
            <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={cx(INPUT, 'border-r-0')} {...props} />
            <span className="flex h-10 items-center border border-asphalt-600 bg-asphalt-800 px-3 text-sm text-asphalt-300">{suffix}</span>
          </div>
        ) : (
          <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={INPUT} {...props} />
        )
      }
    </Field>
  );
}

export function Select({
  label,
  hint,
  error,
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; hint?: ReactNode; error?: string }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, describedBy) => (
        <select id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={cx(INPUT, 'pr-8')} {...props}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function Textarea({
  label,
  hint,
  error,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; hint?: ReactNode; error?: string }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(id, describedBy) => (
        <textarea
          id={id}
          rows={3}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(INPUT, 'h-auto min-h-20 resize-y py-2 leading-relaxed')}
          {...props}
        />
      )}
    </Field>
  );
}

export function Check({ label, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  const id = useId();
  return (
    <div className={cx('flex items-start gap-2.5', className)}>
      <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-race-600" {...props} />
      <label htmlFor={id} className="text-sm text-asphalt-200">
        {label}
      </label>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, label = 'Rechercher' }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return (
    <div className="relative w-full sm:max-w-sm">
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-asphalt-400" />
      <input type="search" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(INPUT, 'pl-9')} />
    </div>
  );
}

/** Groupe de boutons à choix unique (vue, filtre…) */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap bg-asphalt-950 p-0.5 ring-1 ring-asphalt-700">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            'h-8 px-3 text-sm font-semibold transition-colors',
            value === option.value ? 'bg-race-600 text-white' : 'text-asphalt-300 hover:text-chalk',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Tableaux
// -----------------------------------------------------------------------------
export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  loading,
  empty = 'Aucun résultat.',
  caption,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  caption: string;
}) {
  if (loading && !rows) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (!rows?.length) return <p className="p-4 text-sm text-asphalt-400">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-asphalt-700 text-xs uppercase tracking-wide text-asphalt-400">
            {columns.map((column) => (
              <th key={column.key} scope="col" className={cx('px-3 py-2 font-semibold', column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cx('border-b border-asphalt-800 align-top', onRowClick && 'cursor-pointer hover:bg-asphalt-850')}
            >
              {columns.map((column, index) => (
                <td key={column.key} className={cx('px-3 py-2.5', column.className)}>
                  {index === 0 && onRowClick ? (
                    // Cible clavier : le premier contenu de ligne est un bouton
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRowClick(row);
                      }}
                      className="text-left font-semibold text-chalk underline-offset-2 hover:underline"
                    >
                      {column.cell(row)}
                    </button>
                  ) : (
                    column.cell(row)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return total > 0 ? <p className="px-4 py-3 text-xs text-asphalt-400">{formatInteger(total)} résultat(s)</p> : null;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2 px-4 py-3 text-xs text-asphalt-400">
      <span>
        {formatInteger(offset + 1)}–{formatInteger(Math.min(offset + limit, total))} sur {formatInteger(total)}
      </span>
      <span className="flex items-center gap-1">
        <SmallButton variant="ghost" aria-label="Page précédente" disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))}>
          <ChevronLeft />
        </SmallButton>
        <span className="tabular">
          {page} / {pages}
        </span>
        <SmallButton variant="ghost" aria-label="Page suivante" disabled={page >= pages} onClick={() => onChange(offset + limit)}>
          <ChevronRight />
        </SmallButton>
      </span>
    </nav>
  );
}

// -----------------------------------------------------------------------------
// Dialogues (élément <dialog> natif : focus piégé, Échap, fond inerte)
// -----------------------------------------------------------------------------
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  side = false,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Panneau latéral (fiche détaillée) plutôt que fenêtre centrée */
  side?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx(
        'm-0 max-h-none max-w-none bg-transparent p-0 text-chalk backdrop:bg-black/70 open:flex',
        side ? 'ml-auto h-dvh w-full sm:w-[min(40rem,100vw)]' : 'm-auto w-[min(calc(100vw-2rem),36rem)]',
        !side && wide && 'w-[min(calc(100vw-2rem),56rem)]',
      )}
    >
      {open && (
        <div className={cx('flex w-full flex-col bg-asphalt-900 ring-1 ring-asphalt-700', side ? 'h-full' : 'max-h-[calc(100dvh-2rem)]')}>
          <header className="flex items-start justify-between gap-3 border-b border-asphalt-800 px-5 py-4">
            <h2 id={titleId} className="font-display text-xl font-bold uppercase leading-tight">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Fermer" className="-mr-2 -mt-1 p-2 text-asphalt-300 hover:text-chalk">
              <X aria-hidden className="size-5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-asphalt-800 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/** Confirmation d'une action sensible */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <SmallButton variant="ghost" onClick={onClose}>
            Annuler
          </SmallButton>
          <SmallButton variant={danger ? 'danger' : 'primary'} busy={busy} onClick={onConfirm}>
            {confirmLabel}
          </SmallButton>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-asphalt-200">{children}</div>
    </Modal>
  );
}

// -----------------------------------------------------------------------------
// Notifications
// -----------------------------------------------------------------------------
interface ToastItem {
  id: number;
  tone: 'success' | 'error';
  message: string;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tone: ToastItem['tone'], message: string) => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-3), { id, tone, message }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), tone === 'error' ? 8000 : 4000);
  }, []);

  const api = useMemo(
    () => ({
      success: (message: string) => push('success', message),
      error: (error: unknown) => push('error', typeof error === 'string' ? error : errorMessage(error)),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[80] flex flex-col items-end gap-2 sm:left-auto">
        {items.map((item) => (
          <p
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto max-w-md border-l-4 px-4 py-3 text-sm shadow-lg',
              item.tone === 'success' ? 'border-flag-green bg-asphalt-800 text-chalk' : 'border-race-400 bg-asphalt-800 text-chalk',
            )}
          >
            {item.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
