import { Save, UserPlus } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Chip } from '@/components/ui/Chip';
import { ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { errorMessage } from '@/lib/data/errors';
import { useAddStaff, useAudit, useSetSetting, useSetStaffRole, useSettings, useStaff } from '../api';
import { AUDIT_ACTION, centsToEuros, eurosToCents, formatDateTime } from '../labels';
import { useToast } from '../toast-context';
import type { AuditRow, SettingRow, StaffMember } from '../types';
import { AdminPage, Check, DataTable, Input, Modal, Pagination, Panel, SearchInput, Segmented, Select, SmallButton, type Column } from '../ui';

type Tab = 'parametres' | 'equipe' | 'journal';

const GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'Réservation en ligne', keys: ['default_online_quota_pct', 'max_karts_per_booking', 'booking_min_lead_minutes', 'booking_horizon_days', 'hold_minutes', 'slot_generation_horizon_days'] },
  { title: 'Annulation et report', keys: ['cancel_full_refund_hours', 'cancel_credit_hours', 'block_warning_hours'] },
  { title: 'Demi-journées (blocages)', keys: ['morning_start', 'morning_end', 'afternoon_start', 'afternoon_end'] },
  { title: 'Bons cadeaux', keys: ['gift_card_validity_months', 'gift_card_min_cents', 'gift_card_max_cents', 'gift_card_presets'] },
  { title: 'Emails', keys: ['notify_email', 'reminder_local_hour'] },
];

const READ_ONLY = new Set(['online_payment_enabled']);

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('parametres');
  return (
    <AdminPage title="Paramètres & équipe" description="Règles de réservation, politique d’annulation, bons cadeaux, comptes de l’équipe et journal des actions.">
      <Segmented
        label="Rubrique"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'parametres', label: 'Paramètres' },
          { value: 'equipe', label: 'Équipe' },
          { value: 'journal', label: 'Journal des actions' },
        ]}
      />
      {tab === 'parametres' ? <SettingsEditor /> : tab === 'equipe' ? <StaffEditor /> : <AuditLog />}
    </AdminPage>
  );
}

// -----------------------------------------------------------------------------
// Paramètres
// -----------------------------------------------------------------------------
function SettingsEditor() {
  const settings = useSettings();
  if (settings.isPending) return <Skeleton className="h-64" />;
  if (settings.isError) return <ErrorPanel message={errorMessage(settings.error)} />;
  const byKey = new Map(settings.data.map((s) => [s.key, s]));
  const grouped = new Set(GROUPS.flatMap((g) => g.keys));
  const others = settings.data.filter((s) => !grouped.has(s.key));
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {GROUPS.map((group) => (
        <Panel key={group.title} title={group.title}>
          <div className="flex flex-col gap-4">
            {group.keys.map((key) => byKey.get(key)).filter((s): s is SettingRow => !!s).map((s) => <SettingField key={s.key} setting={s} />)}
          </div>
        </Panel>
      ))}
      {others.length > 0 && (
        <Panel title="Autres">
          <div className="flex flex-col gap-4">
            {others.map((s) => (
              <SettingField key={s.key} setting={s} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

type Kind = 'boolean' | 'integer' | 'time' | 'cents' | 'cents_list' | 'text';

function kindOf(s: SettingRow): Kind {
  if (typeof s.value === 'boolean') return 'boolean';
  if (s.key.endsWith('_presets')) return 'cents_list';
  if (s.key.endsWith('_cents')) return 'cents';
  if (typeof s.value === 'number') return 'integer';
  if (typeof s.value === 'string' && /^\d{2}:\d{2}$/.test(s.value)) return 'time';
  return 'text';
}

function toInput(s: SettingRow, kind: Kind): string {
  if (kind === 'cents') return centsToEuros(Number(s.value));
  if (kind === 'cents_list') return Array.isArray(s.value) ? s.value.map((c) => centsToEuros(Number(c))).join(' ; ') : '';
  if (kind === 'boolean') return s.value ? 'true' : 'false';
  return String(s.value ?? '');
}

function fromInput(value: string, kind: Kind): unknown {
  switch (kind) {
    case 'boolean':
      return value === 'true';
    case 'integer':
      return Number(value);
    case 'cents':
      return eurosToCents(value);
    case 'cents_list':
      return value
        .split(/[;\s]+/)
        .map((v) => eurosToCents(v))
        .filter((v): v is number => v != null && v > 0);
    default:
      return value.trim();
  }
}

function SettingField({ setting }: { setting: SettingRow }) {
  const toast = useToast();
  const save = useSetSetting();
  const kind = kindOf(setting);
  const initial = toInput(setting, kind);
  const [value, setValue] = useState(initial);
  const dirty = value !== initial;
  const label = setting.description.replace(/^\[PROVISOIRE\]\s*/, '');
  const provisional = setting.description.startsWith('[PROVISOIRE]');
  const readOnly = READ_ONLY.has(setting.key);

  const submit = () => {
    const parsed = fromInput(value, kind);
    if (kind === 'integer' && !Number.isFinite(parsed as number)) return toast.error('Nombre invalide.');
    if (kind === 'cents' && parsed == null) return toast.error('Montant invalide.');
    save.mutate({ key: setting.key, value: parsed }, { onSuccess: () => toast.success('Paramètre enregistré.'), onError: toast.error });
  };

  return (
    <div className="flex items-end gap-2">
      {kind === 'boolean' ? (
        <Check label={label} checked={value === 'true'} disabled={readOnly} onChange={(e) => setValue(e.target.checked ? 'true' : 'false')} className="flex-1" />
      ) : (
        <Input
          label={
            <>
              {label} {provisional && <Chip tone="yellow">à confirmer</Chip>}
            </>
          }
          type={kind === 'integer' ? 'number' : kind === 'time' ? 'time' : kind === 'text' && setting.key.includes('email') ? 'email' : 'text'}
          inputMode={kind === 'cents' || kind === 'cents_list' ? 'decimal' : undefined}
          suffix={kind === 'cents' ? '€' : kind === 'cents_list' ? '€ (séparés par ;)' : undefined}
          value={value}
          disabled={readOnly}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1"
          hint={readOnly ? 'Paiement en ligne non activé : règlement sur place.' : undefined}
        />
      )}
      {dirty && !readOnly && (
        <SmallButton variant="primary" className="h-10" busy={save.isPending} onClick={submit} aria-label={`Enregistrer ${label}`}>
          <Save />
        </SmallButton>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Équipe
// -----------------------------------------------------------------------------
function StaffEditor() {
  const staff = useStaff();
  const toast = useToast();
  const setRole = useSetStaffRole();
  const [adding, setAdding] = useState(false);
  const columns: Column<StaffMember>[] = [
    {
      key: 'name',
      header: 'Membre',
      cell: (m) => (
        <span className="flex flex-col">
          <span className="font-semibold">
            {m.display_name}
            {m.is_me && <span className="font-normal text-asphalt-400"> (vous)</span>}
          </span>
          <span className="text-xs text-asphalt-400">{m.email}</span>
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Rôle',
      cell: (m) => (
        <select
          aria-label={`Rôle de ${m.display_name}`}
          value={m.role}
          disabled={m.is_me}
          onChange={(e) => setRole.mutate({ userId: m.user_id, role: e.target.value, name: m.display_name, active: m.is_active }, { onSuccess: () => toast.success('Rôle modifié.'), onError: toast.error })}
          className="h-9 border border-asphalt-600 bg-asphalt-950 px-2 text-sm text-chalk disabled:opacity-60"
        >
          <option value="owner">Dirigeant (tous les accès)</option>
          <option value="staff">Équipe (exploitation)</option>
        </select>
      ),
    },
    { key: 'since', header: 'Depuis', cell: (m) => <span className="text-asphalt-300">{formatDateTime(m.created_at)}</span> },
    {
      key: 'active',
      header: 'Accès',
      cell: (m) =>
        m.is_me ? (
          <Chip tone="green">Actif</Chip>
        ) : (
          <SmallButton
            variant={m.is_active ? 'danger' : 'default'}
            onClick={() =>
              setRole.mutate(
                { userId: m.user_id, role: m.role, name: m.display_name, active: !m.is_active },
                { onSuccess: () => toast.success(m.is_active ? 'Accès retiré.' : 'Accès rétabli.'), onError: toast.error },
              )
            }
          >
            {m.is_active ? 'Retirer l’accès' : 'Rétablir'}
          </SmallButton>
        ),
    },
  ];
  return (
    <Panel
      title="Équipe"
      padded={false}
      actions={
        <SmallButton variant="primary" onClick={() => setAdding(true)}>
          <UserPlus aria-hidden />
          Ajouter un membre
        </SmallButton>
      }
    >
      <p className="px-4 pt-3 text-xs text-asphalt-400">
        Le rôle « Équipe » donne accès au planning, au check-in, aux réservations, blocages, demandes, bons, clients, chronos et contenus, sans chiffre d’affaires, paramètres ni catalogue.
      </p>
      {staff.isError ? (
        <div className="p-4">
          <ErrorPanel message={errorMessage(staff.error)} />
        </div>
      ) : (
        <DataTable caption="Équipe" rows={staff.data} columns={columns} rowKey={(m) => m.user_id} loading={staff.isPending} />
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Ajouter un membre">
        {adding && <AddStaff onClose={() => setAdding(false)} />}
      </Modal>
    </Panel>
  );
}

function AddStaff({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const add = useAddStaff();
  const [form, setForm] = useState({ email: '', name: '', role: 'staff' });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate(form, { onSuccess: () => (toast.success(`${form.name} a désormais accès à l’espace dirigeant.`), onClose()), onError: toast.error });
      }}
    >
      <p className="text-sm text-asphalt-300">La personne demande d’abord un lien de connexion sur la page /admin (son compte est alors créé), puis vous l’ajoutez ici avec le même email.</p>
      <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      <Input label="Nom affiché" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <Select label="Rôle" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
        <option value="staff">Équipe (exploitation)</option>
        <option value="owner">Dirigeant (tous les accès)</option>
      </Select>
      <div className="flex justify-end gap-2 pt-2">
        <SmallButton variant="ghost" onClick={onClose}>
          Annuler
        </SmallButton>
        <SmallButton type="submit" variant="primary" busy={add.isPending}>
          Ajouter
        </SmallButton>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Journal d'audit
// -----------------------------------------------------------------------------
const ENTITIES: Record<string, string> = {
  bookings: 'Réservations',
  schedule_blocks: 'Blocages',
  payments: 'Encaissements',
  gift_cards: 'Bons cadeaux',
  customers: 'Clients',
  requests: 'Demandes',
  events: 'Événements',
  products: 'Produits',
  settings: 'Paramètres',
  site_content: 'Contenus',
  staff_roles: 'Équipe',
};

function AuditLog() {
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q.trim());
  const [entity, setEntity] = useState('');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<AuditRow | null>(null);
  const audit = useAudit({ q: deferred || undefined, entity: entity || undefined, limit: 50, offset });
  const columns: Column<AuditRow>[] = [
    { key: 'date', header: 'Date', cell: (a) => formatDateTime(a.created_at) },
    { key: 'actor', header: 'Par', cell: (a) => <span className="text-asphalt-200">{a.actor ?? 'Client / système'}</span> },
    { key: 'action', header: 'Action', cell: (a) => AUDIT_ACTION[a.action] ?? a.action },
    { key: 'entity', header: 'Objet', cell: (a) => <span className="text-xs text-asphalt-400">{ENTITIES[a.entity] ?? a.entity}</span> },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setOffset(0);
          }}
          placeholder="Rechercher (référence, action…)"
        />
        <Select
          label="Objet"
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value);
            setOffset(0);
          }}
          className="w-56"
        >
          <option value="">Tous</option>
          {Object.entries(ENTITIES).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <Panel padded={false}>
        {audit.isError ? (
          <div className="p-4">
            <ErrorPanel message={errorMessage(audit.error)} />
          </div>
        ) : (
          <>
            <DataTable caption="Journal des actions" rows={audit.data?.rows} columns={columns} rowKey={(a) => String(a.id)} onRowClick={setOpen} loading={audit.isPending} empty="Aucune action enregistrée." />
            {audit.data && <Pagination total={audit.data.total} limit={50} offset={offset} onChange={setOffset} />}
          </>
        )}
      </Panel>
      <Modal open={!!open} onClose={() => setOpen(null)} wide title={open ? (AUDIT_ACTION[open.action] ?? open.action) : ''}>
        {open && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-asphalt-300">
              {formatDateTime(open.created_at)} · {open.actor ?? 'Client / système'} · {ENTITIES[open.entity] ?? open.entity} {open.entity_id}
            </p>
            {open.before != null && (
              <details>
                <summary className="cursor-pointer font-semibold">Avant</summary>
                <pre className="mt-2 max-h-64 overflow-auto bg-asphalt-950 p-3 text-xs text-asphalt-200">{JSON.stringify(open.before, null, 2)}</pre>
              </details>
            )}
            {open.after != null && (
              <details open>
                <summary className="cursor-pointer font-semibold">Après</summary>
                <pre className="mt-2 max-h-64 overflow-auto bg-asphalt-950 p-3 text-xs text-asphalt-200">{JSON.stringify(open.after, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
