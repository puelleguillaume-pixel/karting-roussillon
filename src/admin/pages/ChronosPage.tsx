import { Eye, EyeOff, Plus, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { errorMessage } from '@/lib/data/errors';
import { formatLapTime, todayInParis } from '@/lib/format';
import { useAdminCatalog, useDeleteLapRecord, useImportLapRecords, useLapRecords, useUpsertLapRecord } from '../api';
import { parseCsv } from '../files';
import { parseLapTime } from '../laps';
import { useToast } from '../toast-context';
import type { AdminLapRecord } from '../types';
import { AdminPage, Check, ConfirmDialog, Input, Modal, Panel, Select, SmallButton } from '../ui';

export default function ChronosPage() {
  const laps = useLapRecords();
  const catalog = useAdminCatalog();
  const toast = useToast();
  const upsert = useUpsertLapRecord();
  const importLaps = useImportLapRecords();
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AdminLapRecord | null>(null);
  const remove = useDeleteLapRecord();
  const fileRef = useRef<HTMLInputElement>(null);

  const tracks = catalog.data?.tracks ?? [];
  const groups = new Map<string, AdminLapRecord[]>();
  for (const lap of laps.data ?? []) {
    const key = `${lap.track} · ${lap.category_label}`;
    groups.set(key, [...(groups.get(key) ?? []), lap]);
  }

  const onImport = async (file: File) => {
    const rows = parseCsv(await file.text());
    const [header, ...data] = rows;
    if (!header) return;
    const col = (name: RegExp) => header.findIndex((h) => name.test(h.toLowerCase()));
    const iTrack = col(/piste|circuit/);
    const iCat = col(/cat/);
    const iDriver = col(/pilote|nom/);
    const iTime = col(/temps|chrono/);
    const iDate = col(/date/);
    if ([iTrack, iCat, iDriver, iTime].some((i) => i < 0)) {
      toast.error('Colonnes attendues : piste ; catégorie ; pilote ; temps ; date (facultative).');
      return;
    }
    const errors: number[] = [];
    const payload = data.flatMap((r, index) => {
      const track = tracks.find((t) => [t.short_name, t.name, t.slug].some((n) => n.toLowerCase() === (r[iTrack] ?? '').toLowerCase()));
      const ms = parseLapTime(r[iTime] ?? '');
      if (!track || !ms || !r[iDriver] || !r[iCat]) {
        errors.push(index + 2);
        return [];
      }
      const date = iDate >= 0 ? (r[iDate] ?? '') : '';
      const iso = /^\d{2}\/\d{2}\/\d{4}$/.test(date) ? date.split('/').reverse().join('-') : /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayInParis();
      return [{ track_id: track.id, category_label: r[iCat], driver_name: r[iDriver], lap_time_ms: ms, recorded_on: iso, is_published: true }];
    });
    if (errors.length) {
      toast.error(`Lignes ignorées (piste, pilote ou temps invalide) : ${errors.slice(0, 8).join(', ')}${errors.length > 8 ? '…' : ''}`);
    }
    if (payload.length) importLaps.mutate(payload, { onSuccess: (n) => toast.success(`${n} chrono(s) importé(s).`), onError: toast.error });
  };

  return (
    <AdminPage
      title="Chronos"
      description={
        <>
          Meilleurs temps publiés sur la page{' '}
          <Link to="/chronos" target="_blank" className="underline underline-offset-2">
            Chronos
          </Link>{' '}
          (un classement par piste et catégorie, meilleur tour de chaque pilote).
        </>
      }
      actions={
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Fichier CSV des chronos"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImport(file);
              e.target.value = '';
            }}
          />
          <SmallButton onClick={() => fileRef.current?.click()} busy={importLaps.isPending}>
            <Upload aria-hidden />
            Importer un CSV
          </SmallButton>
          <SmallButton variant="primary" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Ajouter un temps
          </SmallButton>
        </>
      }
    >
      <p className="text-xs text-asphalt-400">Import : fichier CSV (Excel « CSV UTF-8 ») avec les colonnes piste ; catégorie ; pilote ; temps (44.210 ou 1:02.345) ; date (JJ/MM/AAAA, facultative).</p>
      {laps.isError ? (
        <ErrorPanel message={errorMessage(laps.error)} onRetry={() => void laps.refetch()} />
      ) : laps.isPending ? (
        <Skeleton className="h-64" />
      ) : groups.size === 0 ? (
        <p className="text-sm text-asphalt-400">Aucun chrono saisi.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...groups.entries()].map(([title, rows]) => (
            <Panel key={title} title={title} padded={false}>
              <ol className="divide-y divide-asphalt-800">
                {rows.map((lap, index) => (
                  <li key={lap.id} className={`flex items-center gap-3 px-4 py-2 text-sm ${lap.is_published ? '' : 'text-asphalt-400'}`}>
                    <span className="w-6 text-right tabular text-asphalt-400">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-chalk">{lap.driver_name}</span>
                      <span className="block text-xs text-asphalt-400">
                        {lap.recorded_on.split('-').reverse().join('/')}
                        {lap.customer_name && ` · fiche ${lap.customer_name}`}
                        {!lap.is_published && ' · masqué'}
                      </span>
                    </span>
                    <span className="font-mono tabular">{formatLapTime(lap.lap_time_ms)}</span>
                    <SmallButton
                      variant="ghost"
                      aria-label={lap.is_published ? `Masquer le temps de ${lap.driver_name}` : `Publier le temps de ${lap.driver_name}`}
                      onClick={() => upsert.mutate({ id: lap.id, is_published: !lap.is_published }, { onError: toast.error })}
                    >
                      {lap.is_published ? <Eye /> : <EyeOff />}
                    </SmallButton>
                    <SmallButton variant="ghost" aria-label={`Supprimer le temps de ${lap.driver_name}`} onClick={() => setDeleting(lap)}>
                      <Trash2 />
                    </SmallButton>
                  </li>
                ))}
              </ol>
            </Panel>
          ))}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Ajouter un temps">
        {adding && <LapForm onClose={() => setAdding(false)} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        title="Supprimer ce temps ?"
        confirmLabel="Supprimer"
        danger
        busy={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success('Temps supprimé.');
              setDeleting(null);
            },
            onError: toast.error,
          })
        }
      >
        {deleting && `${deleting.driver_name} · ${formatLapTime(deleting.lap_time_ms)} (${deleting.category_label}).`}
      </ConfirmDialog>
    </AdminPage>
  );
}

function LapForm({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const catalog = useAdminCatalog();
  const upsert = useUpsertLapRecord();
  const tracks = (catalog.data?.tracks ?? []).filter((t) => t.is_active && t.usage !== 'baby');
  const vehicles = (catalog.data?.vehicle_types ?? []).filter((v) => v.is_active);
  const [form, setForm] = useState({ track_id: '', vehicle_type_id: '', category_label: '', driver_name: '', time: '', recorded_on: todayInParis(), is_published: true });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const ms = parseLapTime(form.time);
  const invalid = !form.track_id || !form.driver_name.trim() || !ms || !(form.category_label || form.vehicle_type_id);
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        const vehicle = vehicles.find((v) => v.id === form.vehicle_type_id);
        upsert.mutate(
          {
            track_id: form.track_id,
            vehicle_type_id: form.vehicle_type_id || null,
            category_label: form.category_label.trim() || vehicle?.name,
            driver_name: form.driver_name.trim(),
            lap_time_ms: ms,
            recorded_on: form.recorded_on,
            is_published: form.is_published,
          },
          { onSuccess: () => (toast.success('Temps enregistré.'), onClose()), onError: toast.error },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Piste" value={form.track_id} onChange={(e) => set('track_id', e.target.value)} required>
          <option value="">Choisir…</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.short_name}
            </option>
          ))}
        </Select>
        <Select label="Kart" value={form.vehicle_type_id} onChange={(e) => set('vehicle_type_id', e.target.value)}>
          <option value="">Autre (préciser la catégorie)</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
        <Input label="Catégorie affichée" value={form.category_label} onChange={(e) => set('category_label', e.target.value)} placeholder="Par défaut : nom du kart" />
        <Input label="Pilote (nom public)" value={form.driver_name} onChange={(e) => set('driver_name', e.target.value)} required />
        <Input label="Temps" value={form.time} onChange={(e) => set('time', e.target.value)} placeholder="44.210 ou 1:02.345" error={form.time && !ms ? 'Format : 44.210 ou 1:02.345' : undefined} required />
        <Input label="Date" type="date" value={form.recorded_on} onChange={(e) => set('recorded_on', e.target.value)} />
      </div>
      <Check label="Publier sur le site" checked={form.is_published} onChange={(e) => set('is_published', e.target.checked)} />
      <div className="flex justify-end gap-2 pt-2">
        <SmallButton variant="ghost" onClick={onClose}>
          Annuler
        </SmallButton>
        <SmallButton type="submit" variant="primary" busy={upsert.isPending} disabled={invalid}>
          Enregistrer
        </SmallButton>
      </div>
    </form>
  );
}
