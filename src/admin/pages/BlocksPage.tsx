import { Copy, Flag, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Chip } from '@/components/ui/Chip';
import { ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { cx } from '@/lib/cx';
import { RpcError, errorMessage } from '@/lib/data/errors';
import { addDays, capitalize, formatDay, formatTime, isoToParisDay, todayInParis } from '@/lib/format';
import { useAdminCatalog, useBlocks, useConvertBlock, useDeleteBlock, useDuplicateBlock } from '../api';
import { emptyDraft } from '../components/block-draft';
import { BlockDialog } from '../components/BlockDialog';
import { BLOCK_REASON, BLOCK_TYPE, CONFLICT_ACTION, EVENT_CATEGORY, eurosToCents, formatDateTime } from '../labels';
import { useToast } from '../toast-context';
import type { BlockRow, ConflictAction, EventCategory } from '../types';
import { AdminPage, Check, ConfirmDialog, Input, Panel, Segmented, Select, SmallButton } from '../ui';

export default function BlocksPage() {
  const today = todayInParis();
  const [range, setRange] = useState<'avenir' | 'passes'>('avenir');
  const from = range === 'avenir' ? today : addDays(today, -60);
  const to = range === 'avenir' ? addDays(today, 365) : addDays(today, -1);
  const blocks = useBlocks(from, to);
  const catalog = useAdminCatalog();
  const trackNames = new Map((catalog.data?.tracks ?? []).map((t) => [t.id, t.short_name]));

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BlockRow | null>(null);
  const [duplicating, setDuplicating] = useState<BlockRow | null>(null);
  const [converting, setConverting] = useState<BlockRow | null>(null);
  const [deleting, setDeleting] = useState<BlockRow | null>(null);

  const rows = range === 'passes' ? [...(blocks.data ?? [])].reverse() : (blocks.data ?? []);

  return (
    <AdminPage
      title="Blocages & privatisations"
      description="Une plage bloquée ferme immédiatement les créneaux concernés à la réservation en ligne, sur les pistes choisies. Les réservations déjà présentes sont listées avant validation."
      actions={
        <SmallButton variant="primary" onClick={() => setCreating(true)}>
          <Plus aria-hidden />
          Nouveau blocage
        </SmallButton>
      }
    >
      <Segmented
        label="Période"
        value={range}
        onChange={setRange}
        options={[
          { value: 'avenir', label: 'À venir (12 mois)' },
          { value: 'passes', label: 'Passés (60 jours)' },
        ]}
      />
      <Panel padded={false}>
        {blocks.isError ? (
          <div className="p-4">
            <ErrorPanel message={errorMessage(blocks.error)} onRetry={() => void blocks.refetch()} />
          </div>
        ) : blocks.isPending ? (
          <Skeleton className="m-4 h-40" />
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-asphalt-400">Aucun blocage sur cette période.</p>
        ) : (
          <ul className="divide-y divide-asphalt-800">
            {rows.map((b) => {
              const sameDay = isoToParisDay(b.starts_at) === isoToParisDay(b.ends_at) || b.block_type === 'full_day';
              return (
                <li key={b.id} className="flex flex-wrap items-start gap-4 px-4 py-3">
                  <div className="w-40 shrink-0">
                    <p className="font-semibold">{capitalize(formatDay(isoToParisDay(b.starts_at), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</p>
                    <p className="text-xs text-asphalt-400">
                      {b.block_type === 'full_day'
                        ? 'Journée entière'
                        : sameDay
                          ? `${BLOCK_TYPE[b.block_type]} · ${formatTime(b.starts_at)}–${formatTime(b.ends_at)}`
                          : `jusqu’au ${formatDateTime(b.ends_at)}`}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-chalk">{b.public_label || BLOCK_REASON[b.reason]}</span>
                      <Chip tone="outline">{BLOCK_REASON[b.reason]}</Chip>
                      {b.is_public ? <Chip tone="blue">Affiché sur le site</Chip> : <Chip tone="neutral">Invisible</Chip>}
                      {b.series_count > 1 && (
                        <Chip tone="outline" icon={<Repeat />}>
                          Série · {b.series_future_count} à venir
                        </Chip>
                      )}
                      {b.kept_bookings > 0 && <Chip tone="yellow">{b.kept_bookings} réservation(s) conservée(s)</Chip>}
                    </p>
                    <p className="text-xs text-asphalt-400">
                      {b.all_tracks ? 'Tout le site' : b.track_ids.map((id) => trackNames.get(id) ?? '?').join(', ')}
                      {b.customer && ` · ${b.customer.company || b.customer.name}`}
                      {b.request && (
                        <>
                          {' · demande '}
                          <Link to="/admin/demandes" className="underline underline-offset-2">
                            {b.request.reference}
                          </Link>
                        </>
                      )}
                      {b.event && (
                        <>
                          {' · événement '}
                          <Link to="/admin/evenements" className="underline underline-offset-2">
                            {b.event.title}
                          </Link>
                        </>
                      )}
                      {b.created_by && ` · créé par ${b.created_by}`}
                    </p>
                    {b.internal_note && <p className="mt-1 whitespace-pre-wrap text-xs text-asphalt-300">{b.internal_note}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <SmallButton variant="ghost" onClick={() => setEditing(b)} aria-label={`Modifier ${b.public_label || BLOCK_REASON[b.reason]}`}>
                      <Pencil aria-hidden />
                      Modifier
                    </SmallButton>
                    <SmallButton variant="ghost" onClick={() => setDuplicating(b)}>
                      <Copy aria-hidden />
                      Dupliquer
                    </SmallButton>
                    {!b.event && (
                      <SmallButton variant="ghost" onClick={() => setConverting(b)}>
                        <Flag aria-hidden />
                        Vendre des places
                      </SmallButton>
                    )}
                    <SmallButton variant="ghost" className="hover:text-race-400" onClick={() => setDeleting(b)}>
                      <Trash2 aria-hidden />
                      Supprimer
                    </SmallButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <BlockDialog open={creating} initial={emptyDraft(today)} onClose={() => setCreating(false)} />
      <BlockDialog open={!!editing} editing={editing} onClose={() => setEditing(null)} />
      <DuplicateDialog block={duplicating} onClose={() => setDuplicating(null)} />
      <ConvertDialog block={converting} onClose={() => setConverting(null)} />
      <DeleteDialog block={deleting} onClose={() => setDeleting(null)} />
    </AdminPage>
  );
}

function DuplicateDialog({ block, onClose }: { block: BlockRow | null; onClose: () => void }) {
  const toast = useToast();
  const duplicate = useDuplicateBlock();
  const [date, setDate] = useState('');
  const [conflicts, setConflicts] = useState<number | null>(null);
  const [action, setAction] = useState<ConflictAction>('reschedule');
  const close = () => {
    setDate('');
    setConflicts(null);
    onClose();
  };
  const run = (withActions: boolean) =>
    block &&
    duplicate.mutate(
      { id: block.id, date, actions: withActions ? { default: action, overrides: {} } : null },
      {
        onSuccess: () => {
          toast.success(`Blocage dupliqué au ${formatDay(date)}.`);
          close();
        },
        onError: (e) => {
          const error = RpcError.from(e);
          if (error.code === 'KR_BLOCK_HAS_CONFLICTS') setConflicts(Number(error.detail) || 1);
          else toast.error(error);
        },
      },
    );
  return (
    <ConfirmDialog open={!!block} title="Dupliquer le blocage" confirmLabel={conflicts ? 'Appliquer et dupliquer' : 'Dupliquer'} busy={duplicate.isPending} onClose={close} onConfirm={() => date && run(conflicts !== null)}>
      <p>Mêmes horaires, mêmes pistes, même motif, à une autre date.</p>
      <Input label="Nouvelle date" type="date" value={date} min={todayInParis()} onChange={(e) => setDate(e.target.value)} required />
      {conflicts !== null && (
        <>
          <p className="text-race-400">{conflicts} réservation(s) sur cette plage.</p>
          <Segmented
            label="Action"
            value={action}
            onChange={setAction}
            options={(Object.keys(CONFLICT_ACTION) as ConflictAction[]).map((a) => ({ value: a, label: CONFLICT_ACTION[a].label }))}
          />
          <p className="text-xs text-asphalt-400">{CONFLICT_ACTION[action].hint}</p>
        </>
      )}
    </ConfirmDialog>
  );
}

function ConvertDialog({ block, onClose }: { block: BlockRow | null; onClose: () => void }) {
  const toast = useToast();
  const convert = useConvertBlock();
  const [form, setForm] = useState({ title: '', capacity: '20', price: '', category: 'mixed' as EventCategory, publish: true });
  const title = form.title || block?.public_label || 'Trackday';
  const price = eurosToCents(form.price);
  const capacity = Number(form.capacity);
  const invalid = !price || price <= 0 || !Number.isInteger(capacity) || capacity < 1;
  return (
    <ConfirmDialog
      open={!!block}
      title="Vendre des places sur ce créneau"
      confirmLabel="Créer l’événement"
      busy={convert.isPending}
      onClose={onClose}
      onConfirm={() =>
        block &&
        !invalid &&
        convert.mutate(
          {
            id: block.id,
            p: { title, capacity, price_cents: price, category: form.category, is_published: form.publish, is_bookable: form.publish },
          },
          {
            onSuccess: () => {
              toast.success(`Événement « ${title} » créé${form.publish ? ' et ouvert à la réservation' : ''}.`);
              onClose();
            },
            onError: toast.error,
          },
        )
      }
    >
      <p>Le blocage devient un événement à places payantes (trackday, course…), réservable en ligne et réglé sur place.</p>
      <Input label="Titre" value={form.title} placeholder={block?.public_label || 'Trackday'} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Places" type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
        <Input label="Prix par place" inputMode="decimal" suffix="€" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} error={form.price && invalid ? 'Invalide' : undefined} />
        <Select label="Catégorie" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as EventCategory })}>
          {(Object.keys(EVENT_CATEGORY) as EventCategory[]).map((c) => (
            <option key={c} value={c}>
              {EVENT_CATEGORY[c]}
            </option>
          ))}
        </Select>
      </div>
      <Check label="Publier et ouvrir la réservation en ligne" checked={form.publish} onChange={(e) => setForm({ ...form, publish: e.target.checked })} />
    </ConfirmDialog>
  );
}

function DeleteDialog({ block, onClose }: { block: BlockRow | null; onClose: () => void }) {
  const toast = useToast();
  const remove = useDeleteBlock();
  const [scope, setScope] = useState<'occurrence' | 'series'>('occurrence');
  return (
    <ConfirmDialog
      open={!!block}
      title="Supprimer le blocage ?"
      confirmLabel="Supprimer"
      danger
      busy={remove.isPending}
      onClose={onClose}
      onConfirm={() =>
        block &&
        remove.mutate(
          { id: block.id, scope },
          {
            onSuccess: (n) => {
              toast.success(n > 1 ? `${n} blocages supprimés : créneaux rouverts.` : 'Blocage supprimé : créneaux rouverts.');
              onClose();
            },
            onError: toast.error,
          },
        )
      }
    >
      <p>Les créneaux se rouvrent immédiatement à la réservation en ligne.{block?.event && ' L’événement lié est conservé.'}</p>
      {block && block.series_future_count > 1 && (
        <Segmented
          label="Portée"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'occurrence', label: 'Cette occurrence' },
            { value: 'series', label: `Toute la série (${block.series_future_count} à venir)` },
          ]}
        />
      )}
      <p className={cx('text-xs text-asphalt-400')}>Les réservations annulées ou reportées lors de la création ne sont pas rétablies.</p>
    </ConfirmDialog>
  );
}
