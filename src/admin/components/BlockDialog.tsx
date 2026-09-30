import { AlertTriangle, ArrowLeft, Search } from 'lucide-react';
import { useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { Alert } from '@/components/ui/feedback';
import { RpcError } from '@/lib/data/errors';
import { formatDay, formatTime, isoToParisDay } from '@/lib/format';
import { previewBlock, useAdminCatalog, useCreateBlock, useUpdateBlock } from '../api';
import { isoWeekdayOf } from '../dates';
import { BLOCK_REASON, BLOCK_TYPE, BOOKING_STATUS, CONFLICT_ACTION, formatDateTime, parisClock, parisTimestamp, WEEKDAYS_SHORT } from '../labels';
import { useToast } from '../toast-context';
import { emptyDraft, type BlockDraft } from './block-draft';
import type { BlockConflict, BlockInput, BlockPreview, BlockReason, BlockRow, BlockType, ConflictAction, ConflictActions } from '../types';
import { Check, Input, Modal, Segmented, Select, SmallButton, Textarea } from '../ui';

const RRULE_DAYS = ['', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function draftFromBlock(block: BlockRow): BlockDraft {
  const day = isoToParisDay(block.starts_at);
  return emptyDraft(day, {
    block_type: block.block_type,
    start_clock: parisClock(block.starts_at),
    end_date: isoToParisDay(block.ends_at),
    end_clock: parisClock(block.ends_at),
    all_tracks: block.all_tracks,
    track_ids: block.track_ids,
    reason: block.reason,
    public_label: block.public_label ?? '',
    is_public: block.is_public,
    internal_note: block.internal_note,
    customer_id: block.customer?.id ?? null,
  });
}

function toInput(d: BlockDraft): BlockInput {
  const rrule =
    d.repeat === 'none' || !d.repeat_until
      ? ''
      : d.repeat === 'daily'
        ? `FREQ=DAILY;UNTIL=${d.repeat_until.replace(/-/g, '')}`
        : `FREQ=WEEKLY;BYDAY=${d.repeat_days.map((n) => RRULE_DAYS[n]).join(',')};UNTIL=${d.repeat_until.replace(/-/g, '')}`;
  return {
    block_type: d.block_type,
    ...(d.block_type === 'custom'
      ? { starts_at: parisTimestamp(d.date, d.start_clock), ends_at: parisTimestamp(d.end_date, d.end_clock) }
      : { date: d.date }),
    all_tracks: d.all_tracks,
    track_ids: d.all_tracks ? [] : d.track_ids,
    reason: d.reason as BlockReason,
    public_label: d.public_label.trim(),
    is_public: d.is_public,
    recurrence_rule: rrule,
    internal_note: d.internal_note,
    customer_id: d.customer_id,
    request_id: d.request_id,
  };
}

function validate(d: BlockDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.date) errors.date = 'Date obligatoire.';
  if (!d.reason) errors.reason = 'Choisissez un motif.';
  if (!d.all_tracks && d.track_ids.length === 0) errors.tracks = 'Choisissez au moins une piste, ou tout le site.';
  if (d.is_public && !d.public_label.trim()) errors.public_label = 'Libellé affiché sur le site obligatoire.';
  if (d.block_type === 'custom' && `${d.end_date}T${d.end_clock}` <= `${d.date}T${d.start_clock}`) errors.end = 'La fin doit être après le début.';
  if (d.repeat !== 'none') {
    if (!d.repeat_until) errors.repeat_until = 'Date de fin de la récurrence obligatoire.';
    else if (d.repeat_until < d.date) errors.repeat_until = 'Doit être après la première date.';
    if (d.repeat === 'weekly' && d.repeat_days.length === 0) errors.repeat_days = 'Choisissez au moins un jour.';
  }
  return errors;
}

/**
 * Création (ou modification) d'un blocage en deux temps : saisie, puis aperçu
 * des occurrences et des réservations impactées, avec une action par réservation.
 */
export function BlockDialog({
  open,
  onClose,
  initial,
  editing,
  onDone,
  title,
}: {
  open: boolean;
  onClose: () => void;
  initial?: BlockDraft;
  /** Modification d'un blocage existant (occurrence ou série) */
  editing?: BlockRow | null;
  onDone?: () => void;
  title?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} wide title={title ?? (editing ? 'Modifier le blocage' : 'Bloquer une plage')}>
      {open && <BlockForm key={editing?.id ?? 'new'} initial={editing ? draftFromBlock(editing) : (initial ?? emptyDraft(''))} editing={editing ?? null} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function BlockForm({ initial, editing, onClose, onDone }: { initial: BlockDraft; editing: BlockRow | null; onClose: () => void; onDone?: () => void }) {
  const toast = useToast();
  const catalog = useAdminCatalog();
  const create = useCreateBlock();
  const update = useUpdateBlock();
  const [draft, setDraft] = useState<BlockDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<BlockPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [scope, setScope] = useState<'occurrence' | 'series'>('occurrence');
  const [defaultAction, setDefaultAction] = useState<ConflictAction>('reschedule');
  const [overrides, setOverrides] = useState<Record<string, ConflictAction>>({});
  const [seriesConflicts, setSeriesConflicts] = useState<number | null>(null);

  const tracks = (catalog.data?.tracks ?? []).filter((t) => t.is_active);
  const set = <K extends keyof BlockDraft>(key: K, value: BlockDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setPreview(null);
    setSeriesConflicts(null);
  };
  const isSeries = editing ? editing.series_count > 1 : false;
  const busy = create.isPending || update.isPending;

  const actions = (): ConflictActions => ({ default: defaultAction, overrides });

  const check = async () => {
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    // Modification d'une série entière : les horaires ne changent pas, l'aperçu
    // n'est pas calculable côté client ; la base signale les conflits éventuels.
    if (editing && scope === 'series') {
      void submit(null);
      return;
    }
    setChecking(true);
    try {
      const result = await previewBlock(toInput(draft));
      setPreview(result);
      setOverrides({});
      setDefaultAction(result.conflicts.length > 0 ? 'reschedule' : 'keep');
    } catch (error) {
      toast.error(error);
    } finally {
      setChecking(false);
    }
  };

  const submit = async (conflictActions: ConflictActions | null) => {
    const input = toInput(draft);
    try {
      if (editing) {
        const { recurrence_rule: _ignored, ...patch } = input;
        void _ignored;
        const p = scope === 'series' ? { ...patch, block_type: undefined, date: undefined, starts_at: undefined, ends_at: undefined } : patch;
        await update.mutateAsync({ id: editing.id, p, scope, actions: conflictActions });
        toast.success(scope === 'series' ? 'Série de blocages modifiée.' : 'Blocage modifié.');
      } else {
        const result = await create.mutateAsync({ p: input, actions: conflictActions });
        toast.success(result.block_ids.length > 1 ? `${result.block_ids.length} blocages créés.` : 'Blocage créé : les créneaux sont fermés à la réservation.');
      }
      onDone?.();
      onClose();
    } catch (error) {
      const e = RpcError.from(error);
      if (e.code === 'KR_BLOCK_HAS_CONFLICTS' && !conflictActions) {
        setSeriesConflicts(Number(e.detail) || 1);
        return;
      }
      toast.error(e);
    }
  };

  if (preview) {
    return (
      <PreviewStep
        preview={preview}
        draft={draft}
        tracksLabel={draft.all_tracks ? 'Tout le site' : tracks.filter((t) => draft.track_ids.includes(t.id)).map((t) => t.short_name).join(', ')}
        defaultAction={defaultAction}
        onDefaultAction={setDefaultAction}
        overrides={overrides}
        onOverride={(id, action) => setOverrides((o) => ({ ...o, [id]: action }))}
        busy={busy}
        onBack={() => setPreview(null)}
        onConfirm={() => void submit(preview.conflicts.length > 0 ? actions() : null)}
        confirmLabel={editing ? 'Enregistrer' : 'Créer le blocage'}
      />
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void check();
      }}
    >
      {editing && isSeries && (
        <Segmented
          label="Portée de la modification"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'occurrence', label: 'Cette occurrence' },
            { value: 'series', label: `Toute la série (${editing.series_future_count} à venir)` },
          ]}
        />
      )}

      {!(editing && scope === 'series') && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-asphalt-300">Plage</legend>
          <Segmented
            label="Type de plage"
            value={draft.block_type}
            onChange={(v) => set('block_type', v)}
            options={(Object.keys(BLOCK_TYPE) as BlockType[]).map((t) => ({ value: t, label: BLOCK_TYPE[t] }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label={draft.block_type === 'custom' ? 'Début (date)' : 'Date'}
              type="date"
              value={draft.date}
              onChange={(e) => {
                const value = e.target.value;
                setDraft((d) => ({ ...d, date: value, end_date: d.end_date < value ? value : d.end_date, repeat_days: value ? [isoWeekdayOf(value)] : d.repeat_days }));
                setPreview(null);
              }}
              error={errors.date}
              required
            />
            {draft.block_type === 'custom' && (
              <Input label="Heure de début" type="time" step={900} value={draft.start_clock} onChange={(e) => set('start_clock', e.target.value)} required />
            )}
            {draft.block_type === 'custom' && (
              <>
                <Input label="Fin (date)" type="date" value={draft.end_date} min={draft.date} onChange={(e) => set('end_date', e.target.value)} required />
                <Input label="Heure de fin" type="time" step={900} value={draft.end_clock} onChange={(e) => set('end_clock', e.target.value)} error={errors.end} required />
              </>
            )}
          </div>
          {draft.block_type !== 'custom' && (
            <p className="text-xs text-asphalt-400">Les bornes du matin et de l’après-midi sont réglables dans les paramètres (9h–13h et 13h–19h par défaut).</p>
          )}
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-asphalt-300">Pistes concernées</legend>
        <Check label="Tout le site (privatisation complète)" checked={draft.all_tracks} onChange={(e) => set('all_tracks', e.target.checked)} />
        {!draft.all_tracks && (
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {tracks.map((t) => (
              <Check
                key={t.id}
                label={t.short_name}
                checked={draft.track_ids.includes(t.id)}
                onChange={(e) => set('track_ids', e.target.checked ? [...draft.track_ids, t.id] : draft.track_ids.filter((id) => id !== t.id))}
              />
            ))}
          </div>
        )}
        {errors.tracks && <p className="text-xs font-medium text-race-400">{errors.tracks}</p>}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Motif" value={draft.reason} onChange={(e) => set('reason', e.target.value as BlockReason)} error={errors.reason} required>
          <option value="">Choisir…</option>
          {(Object.keys(BLOCK_REASON) as BlockReason[]).map((r) => (
            <option key={r} value={r}>
              {BLOCK_REASON[r]}
            </option>
          ))}
        </Select>
        <div className="flex flex-col gap-2">
          <Check label="Afficher sur le site (calendrier public)" checked={draft.is_public} onChange={(e) => set('is_public', e.target.checked)} className="sm:mt-6" />
        </div>
        {draft.is_public && (
          <Input
            label="Libellé public"
            value={draft.public_label}
            onChange={(e) => set('public_label', e.target.value)}
            placeholder="Ex. Circuit privatisé, Trackday moto"
            maxLength={80}
            error={errors.public_label}
            className="sm:col-span-2"
          />
        )}
      </div>

      {!editing && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-asphalt-300">Répétition</legend>
          <Segmented
            label="Répétition"
            value={draft.repeat}
            onChange={(v) => set('repeat', v)}
            options={[
              { value: 'none', label: 'Aucune' },
              { value: 'weekly', label: 'Chaque semaine' },
              { value: 'daily', label: 'Chaque jour' },
            ]}
          />
          {draft.repeat === 'weekly' && (
            <div role="group" aria-label="Jours de la semaine" className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                const on = draft.repeat_days.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('repeat_days', on ? draft.repeat_days.filter((x) => x !== n) : [...draft.repeat_days, n].sort())}
                    className={on ? 'h-9 min-w-12 bg-race-600 px-2 text-sm font-semibold text-white' : 'h-9 min-w-12 bg-asphalt-800 px-2 text-sm text-asphalt-200 ring-1 ring-asphalt-600'}
                  >
                    {WEEKDAYS_SHORT[n]}
                  </button>
                );
              })}
            </div>
          )}
          {errors.repeat_days && <p className="text-xs font-medium text-race-400">{errors.repeat_days}</p>}
          {draft.repeat !== 'none' && (
            <Input label="Jusqu’au" type="date" min={draft.date} value={draft.repeat_until} onChange={(e) => set('repeat_until', e.target.value)} error={errors.repeat_until} className="sm:max-w-xs" />
          )}
        </fieldset>
      )}
      {editing?.recurrence_rule && <p className="text-xs text-asphalt-400">Série récurrente ({editing.series_count} occurrences). Pour changer la récurrence, supprimez la série et recréez-la.</p>}

      <Textarea label="Note interne" value={draft.internal_note} onChange={(e) => set('internal_note', e.target.value)} placeholder="Client, contact, détails…" maxLength={2000} />

      {seriesConflicts !== null && (
        <div className="flex flex-col gap-3">
          <Alert tone="error" title={`${seriesConflicts} réservation(s) concernée(s)`}>
            Choisissez ce qu’il advient des réservations sur ces plages.
          </Alert>
          <ConflictDefault value={defaultAction} onChange={setDefaultAction} />
          <SmallButton variant="primary" busy={busy} className="self-start" onClick={() => void submit({ default: defaultAction, overrides: {} })}>
            Appliquer et enregistrer
          </SmallButton>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-asphalt-800 pt-4">
        <SmallButton variant="ghost" onClick={onClose}>
          Annuler
        </SmallButton>
        <SmallButton type="submit" variant="primary" busy={checking || busy}>
          <Search aria-hidden />
          {editing && scope === 'series' ? 'Enregistrer' : 'Vérifier les réservations impactées'}
        </SmallButton>
      </div>
    </form>
  );
}

function ConflictDefault({ value, onChange }: { value: ConflictAction; onChange: (v: ConflictAction) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Segmented
        label="Action pour les réservations impactées"
        value={value}
        onChange={onChange}
        options={(Object.keys(CONFLICT_ACTION) as ConflictAction[]).map((a) => ({ value: a, label: CONFLICT_ACTION[a].label }))}
      />
      <p className="text-xs text-asphalt-400">{CONFLICT_ACTION[value].hint}</p>
    </div>
  );
}

function PreviewStep({
  preview,
  draft,
  tracksLabel,
  defaultAction,
  onDefaultAction,
  overrides,
  onOverride,
  busy,
  onBack,
  onConfirm,
  confirmLabel,
}: {
  preview: BlockPreview;
  draft: BlockDraft;
  tracksLabel: string;
  defaultAction: ConflictAction;
  onDefaultAction: (a: ConflictAction) => void;
  overrides: Record<string, ConflictAction>;
  onOverride: (bookingId: string, action: ConflictAction) => void;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
  confirmLabel: string;
}) {
  const { occurrences, conflicts } = preview;
  const urgent = conflicts.filter((c) => c.within_warning_window);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 text-sm">
        <p>
          <span className="font-semibold">{BLOCK_REASON[draft.reason as BlockReason]}</span> · {tracksLabel}
          {draft.is_public && <Chip tone="blue" className="ml-2">Public : {draft.public_label}</Chip>}
        </p>
        <p className="text-asphalt-300">
          {occurrences.length} occurrence{occurrences.length > 1 ? 's' : ''} :
        </p>
        <ul className="flex max-h-36 flex-col gap-0.5 overflow-y-auto text-asphalt-200">
          {occurrences.slice(0, 60).map((o) => (
            <li key={o.starts_at}>
              {formatDay(isoToParisDay(o.starts_at), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} ·{' '}
              {draft.block_type === 'full_day'
                ? 'journée entière'
                : `${formatTime(o.starts_at)} → ${isoToParisDay(o.ends_at) !== isoToParisDay(o.starts_at) ? formatDateTime(o.ends_at) : formatTime(o.ends_at)}`}
            </li>
          ))}
          {occurrences.length > 60 && <li>…</li>}
        </ul>
      </div>

      {conflicts.length === 0 ? (
        <Alert tone="success" title="Aucune réservation sur cette plage">
          Les créneaux seront immédiatement fermés à la réservation en ligne.
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <Alert tone="error" title={`${conflicts.length} réservation${conflicts.length > 1 ? 's' : ''} sur cette plage`}>
            Choisissez une action : les clients concernés sont prévenus par email automatiquement.
            {urgent.length > 0 && ` ${urgent.length} réservation(s) ont lieu dans moins de ${preview.warning_hours} h.`}
          </Alert>
          <ConflictDefault value={defaultAction} onChange={onDefaultAction} />
          <ul className="flex flex-col divide-y divide-asphalt-800 ring-1 ring-asphalt-800">
            {conflicts.map((c) => (
              <ConflictRow key={c.booking_id} conflict={c} value={overrides[c.booking_id] ?? defaultAction} onChange={(a) => onOverride(c.booking_id, a)} />
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-between gap-2 border-t border-asphalt-800 pt-4">
        <SmallButton variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden />
          Modifier
        </SmallButton>
        <SmallButton variant="primary" busy={busy} onClick={onConfirm}>
          {confirmLabel}
        </SmallButton>
      </div>
    </div>
  );
}

function ConflictRow({ conflict: c, value, onChange }: { conflict: BlockConflict; value: ConflictAction; onChange: (a: ConflictAction) => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="font-semibold text-chalk">
          {c.customer_name} · {c.reference}
          {c.within_warning_window && <AlertTriangle aria-label="Moins de 72 h" className="ml-1.5 inline size-4 text-flag-yellow" />}
        </p>
        <p className="text-xs text-asphalt-400">
          {formatDateTime(c.starts_at)} · {c.product_name ?? 'Réservation'} · {c.karts} kart(s) · {BOOKING_STATUS[c.status].label}
          {c.customer_phone ? ` · ${c.customer_phone}` : ''}
        </p>
      </div>
      <select
        aria-label={`Action pour ${c.reference}`}
        value={value}
        onChange={(e) => onChange(e.target.value as ConflictAction)}
        className="h-9 border border-asphalt-600 bg-asphalt-950 px-2 text-sm text-chalk"
      >
        {(Object.keys(CONFLICT_ACTION) as ConflictAction[]).map((a) => (
          <option key={a} value={a}>
            {CONFLICT_ACTION[a].label}
          </option>
        ))}
      </select>
    </li>
  );
}
