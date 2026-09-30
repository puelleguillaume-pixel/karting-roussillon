import { Download, Pencil, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Chip } from '@/components/ui/Chip';
import { ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { RpcError, errorMessage } from '@/lib/data/errors';
import { capitalize, formatDay, formatPrice, formatTime, isoToParisDay, todayInParis } from '@/lib/format';
import { EVENT_KIND_LABELS } from '@/lib/catalog';
import { useAdminCatalog, useAdminEvents, useCreateBlock, useEventParticipants, useUpsertEvent } from '../api';
import { downloadCsv, euros } from '../files';
import { BOOKING_STATUS, centsToEuros, EVENT_CATEGORY, eurosToCents, parisClock, parisTimestamp } from '../labels';
import { useToast } from '../toast-context';
import type { AdminEvent, EventCategory, EventKind } from '../types';
import { AdminPage, Check, Input, Modal, Panel, Segmented, Select, SmallButton, Textarea } from '../ui';

export default function EventsPage() {
  const [past, setPast] = useState(false);
  const events = useAdminEvents(past);
  const [editing, setEditing] = useState<AdminEvent | 'new' | null>(null);
  const [participantsOf, setParticipantsOf] = useState<AdminEvent | null>(null);
  const today = todayInParis();
  const rows = past ? (events.data ?? []).filter((e) => isoToParisDay(e.ends_at) < today) : (events.data ?? []);

  return (
    <AdminPage
      title="Événements & trackdays"
      description="Événements à places (trackdays, courses…) réservables en ligne et réglés sur place. Un événement créé ici peut bloquer automatiquement les pistes concernées."
      actions={
        <SmallButton variant="primary" onClick={() => setEditing('new')}>
          <Plus aria-hidden />
          Nouvel événement
        </SmallButton>
      }
    >
      <Segmented
        label="Période"
        value={past ? 'past' : 'future'}
        onChange={(v) => setPast(v === 'past')}
        options={[
          { value: 'future', label: 'À venir' },
          { value: 'past', label: 'Passés' },
        ]}
      />
      {events.isError ? (
        <ErrorPanel message={errorMessage(events.error)} onRetry={() => void events.refetch()} />
      ) : events.isPending ? (
        <Skeleton className="h-40" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-asphalt-400">Aucun événement.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((e) => {
            const booked = e.booked ?? 0;
            const pct = e.capacity > 0 ? Math.round((booked / e.capacity) * 100) : 0;
            return (
              <article key={e.id} className="flex flex-col gap-3 bg-asphalt-900 p-4 ring-1 ring-asphalt-800">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-xl font-bold uppercase leading-tight">{e.title}</h2>
                    <p className="text-sm text-asphalt-300">
                      {capitalize(formatDay(isoToParisDay(e.starts_at), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))} ·{' '}
                      {formatTime(e.starts_at)}–{formatTime(e.ends_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Chip tone="outline">{EVENT_KIND_LABELS[e.kind]}</Chip>
                    <Chip tone="outline">{EVENT_CATEGORY[e.category]}</Chip>
                    {e.is_published ? <Chip tone="green">Publié</Chip> : <Chip tone="neutral">Brouillon</Chip>}
                    {e.is_published && !e.is_bookable && <Chip tone="yellow">Réservation fermée</Chip>}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span aria-hidden className="h-2 flex-1 bg-asphalt-700">
                    <span className="block h-full bg-race-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </span>
                  <span className="tabular">
                    {booked} / {e.capacity} places
                  </span>
                  <span className="text-asphalt-300">{e.price_cents != null ? formatPrice(e.price_cents) : 'Prix non défini'}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <SmallButton variant="ghost" onClick={() => setEditing(e)}>
                    <Pencil aria-hidden />
                    Modifier
                  </SmallButton>
                  <SmallButton variant="ghost" onClick={() => setParticipantsOf(e)}>
                    <Users aria-hidden />
                    Participants ({e.bookings_count ?? 0} inscription(s))
                  </SmallButton>
                  {e.is_published && (
                    <Link to={`/reserver/evenement/${e.slug}`} target="_blank" className="inline-flex h-9 items-center px-3 text-sm text-asphalt-300 hover:text-chalk">
                      Page publique ↗
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'Nouvel événement' : 'Modifier l’événement'}>
        {editing !== null && <EventForm event={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      </Modal>
      <Modal open={!!participantsOf} onClose={() => setParticipantsOf(null)} side title={participantsOf ? `Participants · ${participantsOf.title}` : 'Participants'}>
        {participantsOf && <ParticipantsList event={participantsOf} />}
      </Modal>
    </AdminPage>
  );
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function EventForm({ event, onClose }: { event: AdminEvent | null; onClose: () => void }) {
  const toast = useToast();
  const catalog = useAdminCatalog();
  const upsert = useUpsertEvent();
  const createBlock = useCreateBlock();
  const tracks = (catalog.data?.tracks ?? []).filter((t) => t.is_active);
  const [form, setForm] = useState({
    title: event?.title ?? '',
    kind: (event?.kind ?? 'trackday') as EventKind,
    category: (event?.category ?? 'mixed') as EventCategory,
    description: event?.description ?? '',
    day: event ? isoToParisDay(event.starts_at) : '',
    start: event ? parisClock(event.starts_at) : '09:00',
    end: event ? parisClock(event.ends_at) : '18:00',
    track_ids: event?.track_ids ?? tracks.filter((t) => t.usage === 'events').map((t) => t.id),
    capacity: String(event?.capacity ?? 20),
    price: centsToEuros(event?.price_cents),
    own_vehicle: event?.requires_own_vehicle ?? true,
    published: event?.is_published ?? false,
    bookable: event?.is_bookable ?? false,
    block: !event,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    const found: Record<string, string> = {};
    const price = eurosToCents(form.price);
    if (!form.title.trim()) found.title = 'Titre obligatoire.';
    if (!form.day) found.day = 'Date obligatoire.';
    if (form.end <= form.start) found.end = 'La fin doit être après le début.';
    if (!(Number(form.capacity) >= 0)) found.capacity = 'Nombre invalide.';
    if (form.bookable && (price == null || price < 0)) found.price = 'Prix obligatoire pour ouvrir la réservation.';
    if (form.track_ids.length === 0) found.tracks = 'Choisissez au moins une piste.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const startsAt = parisTimestamp(form.day, form.start);
    const endsAt = parisTimestamp(form.day, form.end);
    const payload = {
      id: event?.id,
      slug: event?.slug ?? `${slugify(form.title)}-${form.day}`,
      title: form.title.trim(),
      kind: form.kind,
      category: form.category,
      description: form.description,
      starts_at: startsAt,
      ends_at: endsAt,
      capacity: Number(form.capacity),
      price_cents: price,
      requires_own_vehicle: form.own_vehicle,
      is_published: form.published,
      is_bookable: form.published && form.bookable,
      track_ids: form.track_ids,
    };
    try {
      const id = await upsert.mutateAsync(payload);
      if (!event && form.block) {
        try {
          await createBlock.mutateAsync({
            p: {
              block_type: 'custom',
              starts_at: startsAt,
              ends_at: endsAt,
              all_tracks: false,
              track_ids: form.track_ids,
              reason: form.kind === 'competition' ? 'competition' : form.kind === 'trackday' ? 'trackday' : 'private_event',
              public_label: form.title.trim(),
              is_public: form.published,
              recurrence_rule: '',
              internal_note: 'Créé avec l’événement',
              event_id: id,
            },
            actions: null,
          });
        } catch (e) {
          const error = RpcError.from(e);
          toast.error(
            error.code === 'KR_BLOCK_HAS_CONFLICTS'
              ? 'Événement créé, mais des réservations existent sur cette plage : créez le blocage depuis « Blocages » pour choisir quoi en faire.'
              : error,
          );
          onClose();
          return;
        }
      }
      toast.success(event ? 'Événement mis à jour.' : 'Événement créé.');
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Titre" value={form.title} onChange={(e) => set('title', e.target.value)} error={errors.title} className="sm:col-span-3" required />
        <Select label="Type" value={form.kind} onChange={(e) => set('kind', e.target.value as EventKind)}>
          {Object.entries(EVENT_KIND_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
        <Select label="Catégorie" value={form.category} onChange={(e) => set('category', e.target.value as EventCategory)}>
          {(Object.keys(EVENT_CATEGORY) as EventCategory[]).map((c) => (
            <option key={c} value={c}>
              {EVENT_CATEGORY[c]}
            </option>
          ))}
        </Select>
        <Input label="Date" type="date" value={form.day} onChange={(e) => set('day', e.target.value)} error={errors.day} required />
        <Input label="Début" type="time" step={900} value={form.start} onChange={(e) => set('start', e.target.value)} />
        <Input label="Fin" type="time" step={900} value={form.end} onChange={(e) => set('end', e.target.value)} error={errors.end} />
        <Input label="Places" type="number" min={0} value={form.capacity} onChange={(e) => set('capacity', e.target.value)} error={errors.capacity} hint={event?.booked ? `${event.booked} déjà réservée(s)` : undefined} />
        <Input label="Prix par place" inputMode="decimal" suffix="€" value={form.price} onChange={(e) => set('price', e.target.value)} error={errors.price} />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-asphalt-300">Pistes</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {tracks.map((t) => (
            <Check
              key={t.id}
              label={t.short_name}
              checked={form.track_ids.includes(t.id)}
              onChange={(e) => set('track_ids', e.target.checked ? [...form.track_ids, t.id] : form.track_ids.filter((id) => id !== t.id))}
            />
          ))}
        </div>
        {errors.tracks && <p className="text-xs font-medium text-race-400">{errors.tracks}</p>}
      </fieldset>
      <Textarea label="Description (affichée sur le site)" value={form.description} onChange={(e) => set('description', e.target.value)} rows={4} />
      <div className="flex flex-col gap-2">
        <Check label="Les participants viennent avec leur véhicule" checked={form.own_vehicle} onChange={(e) => set('own_vehicle', e.target.checked)} />
        <Check label="Publier sur le site (calendrier et page Trackday)" checked={form.published} onChange={(e) => set('published', e.target.checked)} />
        <Check label="Ouvrir la réservation en ligne" checked={form.published && form.bookable} disabled={!form.published} onChange={(e) => set('bookable', e.target.checked)} />
        {!event && <Check label="Bloquer les pistes sur cette plage (créneaux fermés à la réservation loisir)" checked={form.block} onChange={(e) => set('block', e.target.checked)} />}
      </div>
      <div className="flex justify-end gap-2 border-t border-asphalt-800 pt-4">
        <SmallButton variant="ghost" onClick={onClose}>
          Annuler
        </SmallButton>
        <SmallButton type="submit" variant="primary" busy={upsert.isPending || createBlock.isPending}>
          {event ? 'Enregistrer' : 'Créer l’événement'}
        </SmallButton>
      </div>
    </form>
  );
}

function ParticipantsList({ event }: { event: AdminEvent }) {
  const participants = useEventParticipants(event.id);
  const rows = participants.data ?? [];
  const exportCsv = () =>
    downloadCsv(`participants-${event.slug}.csv`, rows, [
      { header: 'Réservation', value: (r) => r.booking_reference },
      { header: 'Statut', value: (r) => BOOKING_STATUS[r.booking_status].label },
      { header: 'Prénom', value: (r) => r.first_name },
      { header: 'Nom', value: (r) => r.last_name },
      { header: 'Date de naissance', value: (r) => r.birth_date },
      { header: 'Véhicule / licence', value: (r) => Object.values(r.extra ?? {}).join(' · ') },
      { header: 'Décharge signée', value: (r) => r.waiver_signed },
      { header: 'Client', value: (r) => r.customer_name },
      { header: 'Téléphone', value: (r) => r.customer_phone },
      { header: 'Email', value: (r) => r.customer_email },
      { header: 'Reste dû (€)', value: (r) => euros(r.amount_due_cents) },
    ]);
  if (participants.isPending) return <Skeleton className="h-40" />;
  if (participants.isError) return <ErrorPanel message={errorMessage(participants.error)} />;
  return (
    <div className="flex flex-col gap-4">
      <SmallButton className="self-start" onClick={exportCsv} disabled={rows.length === 0}>
        <Download aria-hidden />
        Export CSV
      </SmallButton>
      {rows.length === 0 ? (
        <p className="text-sm text-asphalt-400">Aucun inscrit pour l’instant.</p>
      ) : (
        <Panel padded={false}>
          <ul className="divide-y divide-asphalt-800">
            {rows.map((r, i) => (
              <li key={`${r.booking_reference}-${i}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span>
                  <span className="font-semibold text-chalk">
                    {r.first_name} {r.last_name}
                  </span>
                  <span className="block text-xs text-asphalt-400">
                    {r.booking_reference} · {r.customer_phone || r.customer_email}
                    {Object.values(r.extra ?? {}).length > 0 && ` · ${Object.values(r.extra).join(' · ')}`}
                  </span>
                </span>
                <span className="flex gap-1">
                  {r.waiver_signed ? <Chip tone="green">Décharge</Chip> : <Chip tone="yellow">Décharge à signer</Chip>}
                  {r.amount_due_cents > 0 && <Chip tone="outline">{formatPrice(r.amount_due_cents)} dû</Chip>}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
