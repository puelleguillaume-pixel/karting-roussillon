import { ChevronLeft, ChevronRight, Pencil, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { STATUS_SWATCH } from '@/lib/calendar';
import { cx } from '@/lib/cx';
import { errorMessage } from '@/lib/data/errors';
import type { TrackAccessStatus } from '@/lib/data/types';
import { addDays, capitalize, formatClock, formatDay, todayInParis } from '@/lib/format';
import { useAdminCatalog, useDeleteOpeningHours, useGenerateSlots, useSetTrackAccess, useSetTrackCapacity, useTrackAccess, useUpsertOpeningHours } from '../api';
import { daysBetween, monthRange, shiftMonth, startOfWeek } from '../dates';
import { ACCESS_STATUS_LABEL, WEEKDAYS, WEEKDAYS_SHORT } from '../labels';
import { useStaffMember } from '../role-context';
import { useToast } from '../toast-context';
import type { AdminCatalog, AdminOpeningHours } from '../types';
import { AdminPage, Check, ConfirmDialog, Input, Modal, Panel, Segmented, Select, SmallButton } from '../ui';

type Tab = 'statuts' | 'horaires' | 'capacites';

export default function AvailabilityPage() {
  const { isOwner } = useStaffMember();
  const [tab, setTab] = useState<Tab>('statuts');
  const catalog = useAdminCatalog();
  return (
    <AdminPage title="Disponibilités" description="Statuts publics des droits de piste, horaires d’ouverture et capacité des créneaux (part réservable en ligne).">
      <Segmented
        label="Rubrique"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'statuts', label: 'Droits de piste' },
          { value: 'horaires', label: 'Horaires' },
          { value: 'capacites', label: 'Capacités & quota en ligne' },
        ]}
      />
      {!isOwner && tab !== 'statuts' && <p className="text-sm text-flag-yellow">Consultation seule : les horaires et capacités sont modifiables par le dirigeant.</p>}
      {catalog.isError ? (
        <ErrorPanel message={errorMessage(catalog.error)} />
      ) : !catalog.data ? (
        <Skeleton className="h-64" />
      ) : tab === 'statuts' ? (
        <TrackAccessEditor catalog={catalog.data} />
      ) : tab === 'horaires' ? (
        <OpeningHoursEditor catalog={catalog.data} canEdit={isOwner} />
      ) : (
        <CapacityEditor catalog={catalog.data} canEdit={isOwner} />
      )}
    </AdminPage>
  );
}

// -----------------------------------------------------------------------------
// Statuts des droits de piste (calendrier public)
// -----------------------------------------------------------------------------
function TrackAccessEditor({ catalog }: { catalog: AdminCatalog }) {
  const toast = useToast();
  const tracks = catalog.tracks.filter((t) => t.is_active && (t.usage === 'track_access' || t.usage === 'events'));
  const [trackId, setTrackId] = useState(tracks[0]?.id ?? '');
  const [month, setMonth] = useState(monthRange(todayInParis()).first);
  const { first, last } = monthRange(month);
  const access = useTrackAccess(first, last);
  const set = useSetTrackAccess();
  const [range, setRange] = useState({ from: todayInParis(), to: todayInParis(), status: 'open' as TrackAccessStatus | '', label: '' });
  const byDay = new Map((access.data ?? []).filter((a) => a.track_id === trackId).map((a) => [a.day, a]));
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(last), 6);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Panel
        title={capitalize(formatDay(first, { month: 'long', year: 'numeric' }))}
        actions={
          <div className="flex items-center gap-1">
            <select aria-label="Piste" value={trackId} onChange={(e) => setTrackId(e.target.value)} className="h-9 border border-asphalt-600 bg-asphalt-950 px-2 text-sm text-chalk">
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.short_name}
                </option>
              ))}
            </select>
            <SmallButton variant="ghost" aria-label="Mois précédent" onClick={() => setMonth(shiftMonth(month, -1))}>
              <ChevronLeft />
            </SmallButton>
            <SmallButton variant="ghost" aria-label="Mois suivant" onClick={() => setMonth(shiftMonth(month, 1))}>
              <ChevronRight />
            </SmallButton>
          </div>
        }
      >
        {access.isPending ? (
          <Skeleton className="h-64" />
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <div key={n} className="text-center text-xs text-asphalt-400">
                {WEEKDAYS_SHORT[n]}
              </div>
            ))}
            {daysBetween(gridStart, gridEnd).map((d) => {
              const entry = byDay.get(d);
              const outside = d < first || d > last;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={outside}
                  onClick={() => setRange((r) => ({ ...r, from: d, to: d, status: entry?.status ?? r.status, label: entry?.public_label ?? '' }))}
                  className={cx('flex min-h-16 flex-col items-start gap-1 p-1.5 text-left text-xs ring-1 ring-asphalt-800 hover:ring-race-400', outside && 'invisible')}
                  title={entry ? `${ACCESS_STATUS_LABEL[entry.status]}${entry.public_label ? ` · ${entry.public_label}` : ''}` : 'Aucun statut'}
                >
                  <span className="font-semibold">{Number(d.slice(8))}</span>
                  {entry && (
                    <span className="flex items-center gap-1">
                      <span aria-hidden className={cx('size-2.5 shrink-0', STATUS_SWATCH[entry.status])} />
                      <span className="line-clamp-2 text-asphalt-300">{entry.public_label || ACCESS_STATUS_LABEL[entry.status]}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Définir un statut">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (range.to < range.from) return toast.error('La fin doit être après le début.');
            set.mutate(
              { trackIds: [trackId], from: range.from, to: range.to, status: range.status || null, label: range.label },
              { onSuccess: (n) => toast.success(range.status ? `${n} jour(s) mis à jour.` : `${n} statut(s) effacé(s).`), onError: toast.error },
            );
          }}
        >
          <p className="text-xs text-asphalt-400">Cliquez un jour du calendrier ou saisissez une période. Le statut est affiché sur la page Trackday.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Du" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value, to: range.to < e.target.value ? e.target.value : range.to })} />
            <Input label="Au" type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </div>
          <Select label="Statut" value={range.status} onChange={(e) => setRange({ ...range, status: e.target.value as TrackAccessStatus | '' })}>
            {(Object.keys(ACCESS_STATUS_LABEL) as TrackAccessStatus[]).map((s) => (
              <option key={s} value={s}>
                {ACCESS_STATUS_LABEL[s]}
              </option>
            ))}
            <option value="">Aucun (effacer)</option>
          </Select>
          <Input label="Libellé public" value={range.label} onChange={(e) => setRange({ ...range, label: e.target.value })} placeholder="Ex. Accès motos uniquement" maxLength={80} />
          <SmallButton type="submit" variant="primary" busy={set.isPending}>
            <Save aria-hidden />
            Appliquer
          </SmallButton>
        </form>
      </Panel>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Horaires d'ouverture
// -----------------------------------------------------------------------------
function OpeningHoursEditor({ catalog, canEdit }: { catalog: AdminCatalog; canEdit: boolean }) {
  const toast = useToast();
  const generate = useGenerateSlots();
  const remove = useDeleteOpeningHours();
  const [editing, setEditing] = useState<Partial<AdminOpeningHours> | null>(null);
  const [deleting, setDeleting] = useState<AdminOpeningHours | null>(null);
  const trackName = (id: string | null) => (id ? (catalog.tracks.find((t) => t.id === id)?.short_name ?? '?') : 'Toutes les pistes');

  return (
    <Panel
      title="Horaires d’ouverture"
      padded={false}
      actions={
        canEdit && (
          <>
            <SmallButton
              busy={generate.isPending}
              onClick={() =>
                generate.mutate(
                  { from: todayInParis(), to: addDays(todayInParis(), 120) },
                  { onSuccess: (n) => toast.success(`${n} créneau(x) générés ou mis à jour sur 120 jours.`), onError: toast.error },
                )
              }
            >
              <RefreshCw aria-hidden />
              Régénérer les créneaux
            </SmallButton>
            <SmallButton variant="primary" onClick={() => setEditing({ track_id: null, weekday: 1, opens_at: '09:00', closes_at: '19:00', is_closed: false, priority: 0, label: '' })}>
              <Plus aria-hidden />
              Ajouter une règle
            </SmallButton>
          </>
        )
      }
    >
      <p className="px-4 pt-3 text-xs text-asphalt-400">
        Une règle datée (vacances, fermeture annuelle…) avec une priorité plus élevée remplace la règle générale. Après modification, régénérez les créneaux : les créneaux déjà réservés ne sont
        jamais supprimés.
      </p>
      <table className="mt-2 w-full text-left text-sm">
        <caption className="sr-only">Horaires d’ouverture</caption>
        <thead className="text-xs uppercase text-asphalt-400">
          <tr className="border-b border-asphalt-700">
            <th className="px-4 py-2">Jour</th>
            <th className="px-2 py-2">Horaires</th>
            <th className="px-2 py-2">Piste</th>
            <th className="px-2 py-2">Période</th>
            <th className="px-2 py-2">Priorité</th>
            {canEdit && <th className="px-2 py-2"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {catalog.opening_hours.map((o) => (
            <tr key={o.id} className="border-b border-asphalt-800">
              <td className="px-4 py-2 font-semibold">{WEEKDAYS[o.weekday]}</td>
              <td className="px-2 py-2">{o.is_closed ? <Chip tone="red">Fermé</Chip> : `${formatClock(o.opens_at)} – ${formatClock(o.closes_at)}`}</td>
              <td className="px-2 py-2 text-asphalt-300">{trackName(o.track_id)}</td>
              <td className="px-2 py-2 text-asphalt-300">
                {o.valid_from || o.valid_to ? `${o.valid_from ? formatDay(o.valid_from, { day: 'numeric', month: 'short' }) : '…'} → ${o.valid_to ? formatDay(o.valid_to, { day: 'numeric', month: 'short', year: 'numeric' }) : '…'}` : 'Toute l’année'}
                {o.label && <span className="block text-xs">{o.label}</span>}
              </td>
              <td className="px-2 py-2 tabular">{o.priority}</td>
              {canEdit && (
                <td className="px-2 py-2 text-right">
                  <SmallButton variant="ghost" aria-label={`Modifier ${WEEKDAYS[o.weekday]}`} onClick={() => setEditing(o)}>
                    <Pencil />
                  </SmallButton>
                  <SmallButton variant="ghost" aria-label={`Supprimer ${WEEKDAYS[o.weekday]}`} onClick={() => setDeleting(o)}>
                    <Trash2 />
                  </SmallButton>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Modifier la règle' : 'Nouvelle règle'}>
        {editing && <OpeningForm initial={editing} catalog={catalog} onClose={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        title="Supprimer cette règle ?"
        confirmLabel="Supprimer"
        danger
        busy={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => (toast.success('Règle supprimée.'), setDeleting(null)), onError: toast.error })}
      >
        {deleting && `${WEEKDAYS[deleting.weekday]} · ${trackName(deleting.track_id)}`}
      </ConfirmDialog>
    </Panel>
  );
}

function OpeningForm({ initial, catalog, onClose }: { initial: Partial<AdminOpeningHours>; catalog: AdminCatalog; onClose: () => void }) {
  const toast = useToast();
  const upsert = useUpsertOpeningHours();
  const [form, setForm] = useState({
    id: initial.id,
    track_id: initial.track_id ?? '',
    weekday: initial.weekday ?? 1,
    opens_at: (initial.opens_at ?? '09:00').slice(0, 5),
    closes_at: (initial.closes_at ?? '19:00').slice(0, 5),
    is_closed: initial.is_closed ?? false,
    valid_from: initial.valid_from ?? '',
    valid_to: initial.valid_to ?? '',
    priority: initial.priority ?? 0,
    label: initial.label ?? '',
  });
  const [allWeek, setAllWeek] = useState(false);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const days = allWeek && !form.id ? [1, 2, 3, 4, 5, 6, 7] : [form.weekday];
        try {
          for (const weekday of days) {
            await upsert.mutateAsync({ ...form, weekday, track_id: form.track_id || null, valid_from: form.valid_from || null, valid_to: form.valid_to || null });
          }
          toast.success('Horaires enregistrés. Pensez à régénérer les créneaux.');
          onClose();
        } catch (error) {
          toast.error(error);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Jour" value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })} disabled={allWeek}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>
              {WEEKDAYS[n]}
            </option>
          ))}
        </Select>
        <Select label="Piste" value={form.track_id} onChange={(e) => setForm({ ...form, track_id: e.target.value })}>
          <option value="">Toutes les pistes</option>
          {catalog.tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.short_name}
            </option>
          ))}
        </Select>
        {!form.id && <Check label="Appliquer aux 7 jours" checked={allWeek} onChange={(e) => setAllWeek(e.target.checked)} className="sm:col-span-2" />}
        <Check label="Fermé ce jour-là" checked={form.is_closed} onChange={(e) => setForm({ ...form, is_closed: e.target.checked })} className="sm:col-span-2" />
        {!form.is_closed && (
          <>
            <Input label="Ouverture" type="time" step={900} value={form.opens_at} onChange={(e) => setForm({ ...form, opens_at: e.target.value })} />
            <Input label="Fermeture" type="time" step={900} value={form.closes_at} onChange={(e) => setForm({ ...form, closes_at: e.target.value })} />
          </>
        )}
        <Input label="Valable du" type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} hint="Vide = sans limite" />
        <Input label="Au" type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
        <Input label="Priorité" type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} hint="Plus élevée = prioritaire" />
        <Input label="Libellé" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Ex. Horaires d’été" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <SmallButton variant="ghost" onClick={onClose}>
          Annuler
        </SmallButton>
        <SmallButton type="submit" variant="primary" busy={upsert.isPending}>
          Enregistrer
        </SmallButton>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Capacités par piste et part réservable en ligne
// -----------------------------------------------------------------------------
function CapacityEditor({ catalog, canEdit }: { catalog: AdminCatalog; canEdit: boolean }) {
  const toast = useToast();
  const setCapacity = useSetTrackCapacity();
  const tracks = catalog.tracks.filter((t) => t.is_active && t.usage !== 'events');
  const vehicles = catalog.vehicle_types.filter((v) => v.is_active);
  const [draft, setDraft] = useState<Record<string, { capacity: string; quota: string }>>({});
  const key = (t: string, v: string) => `${t}|${v}`;
  const current = (t: string, v: string) => catalog.capacities.find((c) => c.track_id === t && c.vehicle_type_id === v);

  const save = async (trackId: string, vehicleId: string) => {
    const d = draft[key(trackId, vehicleId)];
    if (!d) return;
    const capacity = Number(d.capacity) || 0;
    const quota = d.quota === '' ? null : Math.min(100, Math.max(0, Number(d.quota)));
    try {
      await setCapacity.mutateAsync({ trackId, vehicleTypeId: vehicleId, capacity, quota });
      setDraft((current) => {
        const next = { ...current };
        delete next[key(trackId, vehicleId)];
        return next;
      });
      toast.success('Capacité enregistrée, créneaux à venir mis à jour.');
    } catch (error) {
      toast.error(error);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-asphalt-300">
        Nombre de karts de chaque catégorie par créneau et par piste, et part réservable en ligne (le reste est gardé pour la clientèle sans réservation). Quota vide = valeur par défaut des paramètres.
      </p>
      {tracks.map((t) => (
        <Panel key={t.id} title={t.short_name} padded={false}>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Capacités {t.short_name}</caption>
            <thead className="text-xs uppercase text-asphalt-400">
              <tr className="border-b border-asphalt-700">
                <th className="px-4 py-2">Kart</th>
                <th className="px-2 py-2">Flotte</th>
                <th className="px-2 py-2">Karts par créneau</th>
                <th className="px-2 py-2">En ligne (%)</th>
                {canEdit && <th className="px-2 py-2"><span className="sr-only">Enregistrer</span></th>}
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const c = current(t.id, v.id);
                const d = draft[key(t.id, v.id)];
                const capacity = d?.capacity ?? String(c?.capacity ?? '');
                const quota = d?.quota ?? (c?.online_quota_pct != null ? String(c.online_quota_pct) : '');
                if (!c && !canEdit) return null;
                return (
                  <tr key={v.id} className={cx('border-b border-asphalt-800', !c && !d && 'text-asphalt-300')}>
                    <td className="px-4 py-2">{v.name}</td>
                    <td className="px-2 py-2 tabular text-asphalt-300">{v.fleet_count}</td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        aria-label={`Karts ${v.name} par créneau sur ${t.short_name}`}
                        disabled={!canEdit}
                        value={capacity}
                        placeholder="0"
                        onChange={(e) => setDraft((s) => ({ ...s, [key(t.id, v.id)]: { capacity: e.target.value, quota } }))}
                        className="h-9 w-24 border border-asphalt-600 bg-asphalt-950 px-2 text-chalk disabled:opacity-60"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        aria-label={`Part en ligne ${v.name} sur ${t.short_name}`}
                        disabled={!canEdit}
                        value={quota}
                        placeholder="défaut"
                        onChange={(e) => setDraft((s) => ({ ...s, [key(t.id, v.id)]: { capacity, quota: e.target.value } }))}
                        className="h-9 w-24 border border-asphalt-600 bg-asphalt-950 px-2 text-chalk disabled:opacity-60"
                      />
                    </td>
                    {canEdit && (
                      <td className="px-2 py-2 text-right">
                        {d && (
                          <SmallButton variant="primary" busy={setCapacity.isPending} onClick={() => void save(t.id, v.id)}>
                            <Save aria-hidden />
                            Enregistrer
                          </SmallButton>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      ))}
    </div>
  );
}
