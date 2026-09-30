import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { TRACK_USAGE_LABELS } from '@/lib/catalog';
import { errorMessage } from '@/lib/data/errors';
import type { ProductKind, RequestType, TrackUsage } from '@/lib/data/types';
import { formatLength, formatPrice } from '@/lib/format';
import { useAdminCatalog, useUpsertProduct, useUpsertTrack, useUpsertVehicle } from '../api';
import { centsToEuros, eurosToCents, MONTHS_SHORT, REQUEST_TYPE } from '../labels';
import { useToast } from '../toast-context';
import type { AdminCatalog, AdminProduct, AdminTrack, AdminVehicleType } from '../types';
import { AdminPage, Check, DataTable, Input, Modal, Panel, Segmented, Select, SmallButton, Textarea, type Column } from '../ui';

type Tab = 'produits' | 'karts' | 'pistes';

const KIND_LABELS: Record<ProductKind, string> = {
  session: 'Session',
  pack: 'Pack',
  experience: 'Expérience',
  on_request: 'Sur demande',
};

const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value));

export default function CatalogPage() {
  const [tab, setTab] = useState<Tab>('produits');
  const catalog = useAdminCatalog();
  const [product, setProduct] = useState<Partial<AdminProduct> | null>(null);
  const [vehicle, setVehicle] = useState<Partial<AdminVehicleType> | null>(null);
  const [track, setTrack] = useState<Partial<AdminTrack> | null>(null);

  const newAction =
    tab === 'produits'
      ? () => setProduct({ kind: 'session', is_active: true, is_online_bookable: true, vat_rate_bp: 2000, track_ids: [], metadata: {} })
      : tab === 'karts'
        ? () => setVehicle({ seats: 1, min_age: 0, is_active: true, run_group: 'loisir', fleet_count: 0 })
        : () => setTrack({ usage: 'leisure', is_active: true, slot_interval_min: 15, session_min: 10, online_booking_enabled: true, display_on_circuits: true });

  return (
    <AdminPage
      title="Catalogue & tarifs"
      description="Prix, âges et tailles minimum, saisons, activation : les changements s’appliquent immédiatement au site et aux nouvelles réservations (les réservations existantes gardent leur prix)."
      actions={
        <SmallButton variant="primary" onClick={newAction}>
          <Plus aria-hidden />
          {tab === 'produits' ? 'Nouveau produit' : tab === 'karts' ? 'Nouveau kart' : 'Nouvelle piste'}
        </SmallButton>
      }
    >
      <Segmented
        label="Rubrique"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'produits', label: 'Produits & tarifs' },
          { value: 'karts', label: 'Karts' },
          { value: 'pistes', label: 'Pistes' },
        ]}
      />
      {catalog.isError ? (
        <ErrorPanel message={errorMessage(catalog.error)} />
      ) : !catalog.data ? (
        <Skeleton className="h-64" />
      ) : tab === 'produits' ? (
        <ProductsTable catalog={catalog.data} onEdit={setProduct} />
      ) : tab === 'karts' ? (
        <VehiclesTable catalog={catalog.data} onEdit={setVehicle} />
      ) : (
        <TracksTable catalog={catalog.data} onEdit={setTrack} />
      )}
      <Modal open={!!product} onClose={() => setProduct(null)} wide title={product?.id ? `Modifier · ${product.name}` : 'Nouveau produit'}>
        {product && catalog.data && <ProductForm initial={product} catalog={catalog.data} onClose={() => setProduct(null)} />}
      </Modal>
      <Modal open={!!vehicle} onClose={() => setVehicle(null)} wide title={vehicle?.id ? `Modifier · ${vehicle.name}` : 'Nouveau kart'}>
        {vehicle && <VehicleForm initial={vehicle} onClose={() => setVehicle(null)} />}
      </Modal>
      <Modal open={!!track} onClose={() => setTrack(null)} wide title={track?.id ? `Modifier · ${track.name}` : 'Nouvelle piste'}>
        {track && <TrackForm initial={track} onClose={() => setTrack(null)} />}
      </Modal>
    </AdminPage>
  );
}

function ActiveChip({ active }: { active: boolean }) {
  return active ? <Chip tone="green">Actif</Chip> : <Chip tone="neutral">Inactif</Chip>;
}

function ProductsTable({ catalog, onEdit }: { catalog: AdminCatalog; onEdit: (p: AdminProduct) => void }) {
  const columns: Column<AdminProduct>[] = [
    {
      key: 'name',
      header: 'Produit',
      cell: (p) => (
        <span className="flex flex-col">
          <span>{p.name}</span>
          <span className="text-xs font-normal text-asphalt-400">
            {KIND_LABELS[p.kind]}
            {p.pack && ` · ${p.pack.sessions_count} × ${p.pack.session_min} min`}
          </span>
        </span>
      ),
    },
    { key: 'price', header: 'Prix TTC', cell: (p) => <span className="tabular">{p.price_cents != null ? formatPrice(p.price_cents) : (p.price_label ?? 'Sur demande')}</span> },
    { key: 'age', header: 'Conditions', cell: (p) => <span className="text-asphalt-300">{p.age_label || (p.min_age ? `${p.min_age} ans` : '—')}</span> },
    {
      key: 'tracks',
      header: 'Pistes',
      cell: (p) => <span className="text-asphalt-300">{p.track_ids.map((id) => catalog.tracks.find((t) => t.id === id)?.short_name).filter(Boolean).join(', ') || '—'}</span>,
    },
    {
      key: 'flags',
      header: 'Statut',
      cell: (p) => (
        <span className="flex flex-wrap gap-1">
          <ActiveChip active={p.is_active} />
          {p.is_online_bookable && <Chip tone="blue">En ligne</Chip>}
          {p.active_months && <Chip tone="yellow">Saisonnier</Chip>}
        </span>
      ),
    },
  ];
  return (
    <Panel padded={false}>
      <DataTable caption="Produits" rows={catalog.products} columns={columns} rowKey={(p) => p.id} onRowClick={onEdit} />
    </Panel>
  );
}

function VehiclesTable({ catalog, onEdit }: { catalog: AdminCatalog; onEdit: (v: AdminVehicleType) => void }) {
  const columns: Column<AdminVehicleType>[] = [
    { key: 'name', header: 'Kart', cell: (v) => v.name },
    { key: 'engine', header: 'Moteur', cell: (v) => <span className="text-asphalt-300">{v.engine || '—'}</span> },
    {
      key: 'age',
      header: 'Âge / taille min.',
      cell: (v) => (
        <span className="text-asphalt-300">
          {v.min_age} ans{v.min_height_cm ? ` · ${v.min_height_cm} cm` : ''}
          {v.seats > 1 && ` · passager ${v.passenger_min_age ?? '?'} ans`}
        </span>
      ),
    },
    { key: 'fleet', header: 'Flotte', cell: (v) => <span className="tabular">{v.fleet_count}</span> },
    { key: 'status', header: 'Statut', cell: (v) => <ActiveChip active={v.is_active} /> },
  ];
  return (
    <Panel padded={false}>
      <DataTable caption="Karts" rows={catalog.vehicle_types} columns={columns} rowKey={(v) => v.id} onRowClick={onEdit} />
    </Panel>
  );
}

function TracksTable({ catalog, onEdit }: { catalog: AdminCatalog; onEdit: (t: AdminTrack) => void }) {
  const columns: Column<AdminTrack>[] = [
    { key: 'name', header: 'Piste', cell: (t) => t.name },
    { key: 'length', header: 'Longueur', cell: (t) => <span className="tabular">{t.length_m ? formatLength(t.length_m) : '—'}</span> },
    { key: 'usage', header: 'Usage', cell: (t) => <span className="text-asphalt-300">{TRACK_USAGE_LABELS[t.usage]}</span> },
    { key: 'slots', header: 'Créneaux', cell: (t) => <span className="text-asphalt-300">toutes les {t.slot_interval_min} min</span> },
    {
      key: 'status',
      header: 'Statut',
      cell: (t) => (
        <span className="flex flex-wrap gap-1">
          <ActiveChip active={t.is_active} />
          {t.online_booking_enabled && <Chip tone="blue">Réservable en ligne</Chip>}
        </span>
      ),
    },
  ];
  return (
    <Panel padded={false}>
      <DataTable caption="Pistes" rows={catalog.tracks} columns={columns} rowKey={(t) => t.id} onRowClick={onEdit} />
    </Panel>
  );
}

function FormActions({ busy, onClose }: { busy: boolean; onClose: () => void }) {
  return (
    <div className="flex justify-end gap-2 border-t border-asphalt-800 pt-4">
      <SmallButton variant="ghost" onClick={onClose}>
        Annuler
      </SmallButton>
      <SmallButton type="submit" variant="primary" busy={busy}>
        Enregistrer
      </SmallButton>
    </div>
  );
}

function ProductForm({ initial, catalog, onClose }: { initial: Partial<AdminProduct>; catalog: AdminCatalog; onClose: () => void }) {
  const toast = useToast();
  const upsert = useUpsertProduct();
  const [p, setP] = useState(initial);
  const [price, setPrice] = useState(centsToEuros(initial.price_cents));
  const [pack, setPack] = useState({
    sessions_count: String(initial.pack?.sessions_count ?? 3),
    session_min: String(initial.pack?.session_min ?? 10),
    min_gap_min: String(initial.pack?.min_gap_min ?? 0),
  });
  const set = <K extends keyof AdminProduct>(key: K, value: AdminProduct[K]) => setP((x) => ({ ...x, [key]: value }));
  const months = p.active_months ?? null;
  const bookable = p.kind === 'session' || p.kind === 'pack';

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const payload = {
          ...p,
          price_cents: eurosToCents(price),
          slug:
            p.slug ||
            (p.name ?? '')
              .normalize('NFD')
              .replace(/[̀-ͯ]/g, '')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, ''),
          pack: p.kind === 'pack' ? { sessions_count: Number(pack.sessions_count), session_min: Number(pack.session_min), min_gap_min: Number(pack.min_gap_min), same_day: true } : undefined,
        };
        upsert.mutate(payload, { onSuccess: () => (toast.success('Produit enregistré.'), onClose()), onError: toast.error });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Nom" value={p.name ?? ''} onChange={(e) => set('name', e.target.value)} required className="sm:col-span-2" />
        <Select label="Type" value={p.kind} onChange={(e) => set('kind', e.target.value as ProductKind)} disabled={!!p.id}>
          {(Object.keys(KIND_LABELS) as ProductKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        <Input label="Prix TTC" inputMode="decimal" suffix="€" value={price} onChange={(e) => setPrice(e.target.value)} hint="Vide = sur demande" />
        <Input label="Libellé si pas de prix" value={p.price_label ?? ''} onChange={(e) => set('price_label', e.target.value || null)} placeholder="Sur devis" />
        <Select label="TVA" value={p.vat_rate_bp ?? 2000} onChange={(e) => set('vat_rate_bp', Number(e.target.value))}>
          <option value={2000}>20 %</option>
          <option value={1000}>10 %</option>
          <option value={550}>5,5 %</option>
          <option value={0}>0 %</option>
        </Select>
        {bookable && (
          <Select label="Kart" value={p.vehicle_type_id ?? ''} onChange={(e) => set('vehicle_type_id', e.target.value || null)} required>
            <option value="">Choisir…</option>
            {catalog.vehicle_types.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        )}
        {p.kind === 'on_request' && (
          <Select label="Type de demande" value={p.request_type ?? ''} onChange={(e) => set('request_type', (e.target.value || null) as RequestType | null)}>
            <option value="">—</option>
            {(Object.keys(REQUEST_TYPE) as RequestType[]).map((r) => (
              <option key={r} value={r}>
                {REQUEST_TYPE[r]}
              </option>
            ))}
          </Select>
        )}
        <Input label="Durée (min)" type="number" min={1} value={p.duration_min ?? ''} onChange={(e) => set('duration_min', numberOrNull(e.target.value))} />
        <Input label="Âge minimum" type="number" min={0} value={p.min_age ?? ''} onChange={(e) => set('min_age', numberOrNull(e.target.value))} hint="Vide = celui du kart" />
        <Input label="Taille minimum (cm)" type="number" min={0} value={p.min_height_cm ?? ''} onChange={(e) => set('min_height_cm', numberOrNull(e.target.value))} />
        <Input label="Conditions affichées" value={p.age_label ?? ''} onChange={(e) => set('age_label', e.target.value)} placeholder="Dès 7 ans (1,30 m)" className="sm:col-span-2" />
        <Input label="Ordre d’affichage" type="number" value={p.sort_order ?? 0} onChange={(e) => set('sort_order', Number(e.target.value))} />
      </div>
      {p.kind === 'pack' && (
        <div className="grid gap-3 bg-asphalt-950 p-3 ring-1 ring-asphalt-800 sm:grid-cols-3">
          <Input label="Sessions" type="number" min={2} value={pack.sessions_count} onChange={(e) => setPack({ ...pack, sessions_count: e.target.value })} />
          <Input label="Durée d’une session (min)" type="number" min={1} value={pack.session_min} onChange={(e) => setPack({ ...pack, session_min: e.target.value })} />
          <Input label="Pause minimale (min)" type="number" min={0} value={pack.min_gap_min} onChange={(e) => setPack({ ...pack, min_gap_min: e.target.value })} />
        </div>
      )}
      <Input label="Accroche" value={p.short_description ?? ''} onChange={(e) => set('short_description', e.target.value)} maxLength={160} />
      <Textarea label="Description" value={p.description ?? ''} onChange={(e) => set('description', e.target.value)} rows={3} />
      {bookable && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-asphalt-300">Pistes</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {catalog.tracks.map((t) => (
              <Check
                key={t.id}
                label={t.short_name}
                checked={(p.track_ids ?? []).includes(t.id)}
                onChange={(e) => set('track_ids', e.target.checked ? [...(p.track_ids ?? []), t.id] : (p.track_ids ?? []).filter((id) => id !== t.id))}
              />
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-asphalt-300">Saison</legend>
        <Check label="Proposé toute l’année" checked={months === null} onChange={(e) => set('active_months', e.target.checked ? null : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])} />
        {months && (
          <div role="group" aria-label="Mois d’ouverture" className="flex flex-wrap gap-1.5">
            {MONTHS_SHORT.map((label, index) => {
              const m = index + 1;
              const on = months.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set('active_months', on ? months.filter((x) => x !== m) : [...months, m].sort((a, b) => a - b))}
                  className={on ? 'h-8 min-w-12 bg-race-600 px-2 text-xs font-semibold text-white' : 'h-8 min-w-12 bg-asphalt-800 px-2 text-xs text-asphalt-300 ring-1 ring-asphalt-600'}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>
      <div className="flex flex-col gap-2">
        <Check label="Actif (visible sur le site)" checked={p.is_active ?? true} onChange={(e) => set('is_active', e.target.checked)} />
        {bookable && <Check label="Réservable en ligne" checked={p.is_online_bookable ?? false} onChange={(e) => set('is_online_bookable', e.target.checked)} />}
        {bookable && <Check label="Validation chrono requise (pilotes validés uniquement)" checked={p.requires_chrono_validation ?? false} onChange={(e) => set('requires_chrono_validation', e.target.checked)} />}
        <Check label="Mis en avant sur l’accueil" checked={p.is_featured ?? false} onChange={(e) => set('is_featured', e.target.checked)} />
      </div>
      <Input label="Image (chemin dans /public/images)" value={p.image_path ?? ''} onChange={(e) => set('image_path', e.target.value || null)} placeholder="karts/sodikart-390.webp" />
      <FormActions busy={upsert.isPending} onClose={onClose} />
    </form>
  );
}

function VehicleForm({ initial, onClose }: { initial: Partial<AdminVehicleType>; onClose: () => void }) {
  const toast = useToast();
  const upsert = useUpsertVehicle();
  const [v, setV] = useState(initial);
  const set = <K extends keyof AdminVehicleType>(key: K, value: AdminVehicleType[K]) => setV((x) => ({ ...x, [key]: value }));
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const slug = v.slug || (v.name ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        upsert.mutate({ ...v, slug }, { onSuccess: () => (toast.success('Kart enregistré.'), onClose()), onError: toast.error });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Nom" value={v.name ?? ''} onChange={(e) => set('name', e.target.value)} required className="sm:col-span-2" />
        <Input label="Libellé court" value={v.short_label ?? ''} onChange={(e) => set('short_label', e.target.value)} placeholder="390" />
        <Input label="Moteur" value={v.engine ?? ''} onChange={(e) => set('engine', e.target.value)} />
        <Input label="Âge minimum" type="number" min={0} value={v.min_age ?? 0} onChange={(e) => set('min_age', Number(e.target.value))} />
        <Input label="Taille minimum (cm)" type="number" min={0} value={v.min_height_cm ?? ''} onChange={(e) => set('min_height_cm', numberOrNull(e.target.value))} />
        <Input label="Places" type="number" min={1} max={2} value={v.seats ?? 1} onChange={(e) => set('seats', Number(e.target.value))} />
        {(v.seats ?? 1) > 1 && (
          <>
            <Input label="Âge min. passager" type="number" min={0} value={v.passenger_min_age ?? ''} onChange={(e) => set('passenger_min_age', numberOrNull(e.target.value))} />
            <Input label="Taille min. passager (cm)" type="number" min={0} value={v.passenger_min_height_cm ?? ''} onChange={(e) => set('passenger_min_height_cm', numberOrNull(e.target.value))} />
          </>
        )}
        <Input label="Karts dans la flotte" type="number" min={0} value={v.fleet_count ?? 0} onChange={(e) => set('fleet_count', Number(e.target.value))} />
        <Input label="Groupe de roulage" value={v.run_group ?? ''} onChange={(e) => set('run_group', e.target.value)} hint="Catégories qui roulent ensemble" />
        <Input label="Ordre" type="number" value={v.sort_order ?? 0} onChange={(e) => set('sort_order', Number(e.target.value))} />
      </div>
      <Textarea label="Description" value={v.description ?? ''} onChange={(e) => set('description', e.target.value)} rows={2} />
      <Input label="Image (chemin dans /public/images)" value={v.image_path ?? ''} onChange={(e) => set('image_path', e.target.value || null)} />
      <div className="flex flex-col gap-2">
        <Check label="Kart adapté (handikart)" checked={v.is_adapted ?? false} onChange={(e) => set('is_adapted', e.target.checked)} />
        <Check label="Actif" checked={v.is_active ?? true} onChange={(e) => set('is_active', e.target.checked)} />
      </div>
      <FormActions busy={upsert.isPending} onClose={onClose} />
    </form>
  );
}

function TrackForm({ initial, onClose }: { initial: Partial<AdminTrack>; onClose: () => void }) {
  const toast = useToast();
  const upsert = useUpsertTrack();
  const [t, setT] = useState(initial);
  const set = <K extends keyof AdminTrack>(key: K, value: AdminTrack[K]) => setT((x) => ({ ...x, [key]: value }));
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const slug = t.slug || (t.short_name ?? t.name ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        upsert.mutate({ ...t, slug }, { onSuccess: () => (toast.success('Piste enregistrée.'), onClose()), onError: toast.error });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Nom" value={t.name ?? ''} onChange={(e) => set('name', e.target.value)} required className="sm:col-span-2" />
        <Input label="Nom court" value={t.short_name ?? ''} onChange={(e) => set('short_name', e.target.value)} />
        <Select label="Usage" value={t.usage} onChange={(e) => set('usage', e.target.value as TrackUsage)} disabled={!!t.id}>
          {(Object.keys(TRACK_USAGE_LABELS) as TrackUsage[]).map((u) => (
            <option key={u} value={u}>
              {TRACK_USAGE_LABELS[u]}
            </option>
          ))}
        </Select>
        <Input label="Longueur (m)" type="number" min={0} value={t.length_m ?? ''} onChange={(e) => set('length_m', numberOrNull(e.target.value))} />
        <Input label="Âge minimum" type="number" min={0} value={t.min_age ?? ''} onChange={(e) => set('min_age', numberOrNull(e.target.value))} />
        <Input label="Créneau toutes les (min)" type="number" min={5} step={5} value={t.slot_interval_min ?? 15} onChange={(e) => set('slot_interval_min', Number(e.target.value))} />
        <Input label="Durée d’une session (min)" type="number" min={1} value={t.session_min ?? 10} onChange={(e) => set('session_min', Number(e.target.value))} />
        <Input label="Karts max en piste" type="number" min={1} value={t.max_karts_on_track ?? ''} onChange={(e) => set('max_karts_on_track', numberOrNull(e.target.value))} hint="Vide = somme des capacités" />
      </div>
      <Textarea label="Description" value={t.description ?? ''} onChange={(e) => set('description', e.target.value)} rows={3} />
      <Input label="Image (chemin dans /public/images)" value={t.image_path ?? ''} onChange={(e) => set('image_path', e.target.value || null)} />
      <div className="flex flex-col gap-2">
        <Check label="Réservable en ligne" checked={t.online_booking_enabled ?? true} onChange={(e) => set('online_booking_enabled', e.target.checked)} />
        <Check label="Réservation obligatoire (pas d’accès sans réservation)" checked={t.requires_booking ?? false} onChange={(e) => set('requires_booking', e.target.checked)} />
        <Check label="Séparer les groupes de roulage (loisir, performance, enfant)" checked={t.enforce_run_groups ?? true} onChange={(e) => set('enforce_run_groups', e.target.checked)} />
        <Check label="Affichée sur la page Circuits" checked={t.display_on_circuits ?? true} onChange={(e) => set('display_on_circuits', e.target.checked)} />
        <Check label="Active" checked={t.is_active ?? true} onChange={(e) => set('is_active', e.target.checked)} />
      </div>
      <FormActions busy={upsert.isPending} onClose={onClose} />
    </form>
  );
}
