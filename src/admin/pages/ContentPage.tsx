import { ExternalLink, Pencil, Plus, Save, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Chip } from '@/components/ui/Chip';
import { ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { errorMessage } from '@/lib/data/errors';
import type { SectionText } from '@/lib/data/types';
import { useContent, useDeleteReview, useReviews, useUpsertContent, useUpsertReview } from '../api';
import { formatDateTime } from '../labels';
import { useToast } from '../toast-context';
import type { AdminReview, ContentRow } from '../types';
import { AdminPage, Check, ConfirmDialog, Input, Modal, Panel, Segmented, Select, SmallButton, Textarea } from '../ui';

type Tab = 'banner' | 'pages' | 'contact' | 'reviews';

// Clé de contenu → page du site (aperçu)
const PAGE_PATHS: Record<string, { label: string; path: string }> = {
  'page.home': { label: 'Accueil', path: '/' },
  'page.karts-tarifs': { label: 'Karts & tarifs', path: '/karts-tarifs' },
  'page.circuits': { label: 'Circuits', path: '/circuits' },
  'page.trackday': { label: 'Trackday', path: '/trackday' },
  'page.formules': { label: 'Formules', path: '/formules' },
  'page.anniversaire': { label: 'Anniversaires', path: '/formules/anniversaire' },
  'page.evg-evjf': { label: 'EVG / EVJF', path: '/formules/evg-evjf' },
  'page.team-building': { label: 'Team building', path: '/formules/team-building' },
  'page.ecole-de-pilotage': { label: 'École de pilotage', path: '/ecole-de-pilotage' },
  'page.alpine-a110s': { label: 'Alpine A110S', path: '/alpine-a110s' },
  'page.bon-cadeau': { label: 'Bon cadeau', path: '/bon-cadeau' },
  'page.chronos': { label: 'Chronos', path: '/chronos' },
  'page.contact': { label: 'Contact', path: '/contact' },
  'page.reserver': { label: 'Réservation', path: '/reserver' },
  'legal.mentions': { label: 'Mentions légales', path: '/mentions-legales' },
  'legal.cgv': { label: 'CGV', path: '/cgv' },
  'legal.privacy': { label: 'Confidentialité', path: '/confidentialite' },
  'legal.cookies': { label: 'Cookies', path: '/cookies' },
};

const FIELD_LABELS: Record<string, string> = {
  eyebrow: 'Surtitre',
  seo_title: 'Titre pour Google (60 caractères)',
  seo_description: 'Description pour Google (155 caractères)',
  cta_primary: 'Bouton principal',
  cta_secondary: 'Bouton secondaire',
  form_title: 'Titre du formulaire',
};

export default function ContentPage() {
  const [tab, setTab] = useState<Tab>('banner');
  const content = useContent();
  return (
    <AdminPage title="Contenu du site" description="Textes, bannière d’information, coordonnées et avis clients : les modifications sont en ligne immédiatement.">
      <Segmented
        label="Rubrique"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'banner', label: 'Bannière' },
          { value: 'pages', label: 'Textes des pages' },
          { value: 'contact', label: 'Coordonnées' },
          { value: 'reviews', label: 'Avis clients' },
        ]}
      />
      {tab === 'reviews' ? (
        <ReviewsEditor />
      ) : content.isError ? (
        <ErrorPanel message={errorMessage(content.error)} onRetry={() => void content.refetch()} />
      ) : content.isPending ? (
        <Skeleton className="h-64" />
      ) : tab === 'banner' ? (
        <BannerEditor row={content.data.find((r) => r.key === 'banner')} />
      ) : tab === 'contact' ? (
        <ContactEditor row={content.data.find((r) => r.key === 'contact')} />
      ) : (
        <PagesEditor rows={content.data.filter((r) => r.key.startsWith('page.') || r.key.startsWith('legal.'))} />
      )}
    </AdminPage>
  );
}

function BannerEditor({ row }: { row: ContentRow | undefined }) {
  const toast = useToast();
  const save = useUpsertContent();
  const [title, setTitle] = useState(row?.title ?? '');
  const [body, setBody] = useState(row?.body ?? '');
  const [level, setLevel] = useState<string>((row?.data.level as string) ?? 'info');
  const [published, setPublished] = useState(row?.is_published ?? false);
  const presets = [
    { label: 'Pluie', title: 'Météo', body: 'Circuit fermé ce matin pour cause de pluie. Réouverture prévue cet après-midi, appelez-nous avant de venir.', level: 'warning' },
    { label: 'Fermeture', title: 'Fermeture exceptionnelle', body: 'Le circuit est exceptionnellement fermé aujourd’hui.', level: 'alert' },
    { label: 'Horaires', title: 'Horaires', body: 'Ouverture exceptionnelle jusqu’à 21h ce samedi.', level: 'info' },
  ];
  return (
    <Panel title="Bannière d’information" actions={row && <span className="text-xs text-asphalt-400">Modifiée le {formatDateTime(row.updated_at)}</span>}>
      <form
        className="flex max-w-2xl flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(
            { key: 'banner', p: { title, body, data: { ...(row?.data ?? {}), level }, is_published: published && !!body.trim() } },
            { onSuccess: () => toast.success(published && body.trim() ? 'Bannière publiée.' : 'Bannière enregistrée (masquée).'), onError: toast.error },
          );
        }}
      >
        <p className="text-sm text-asphalt-300">Affichée en haut de toutes les pages du site. Idéal pour une fermeture météo ou des horaires exceptionnels.</p>
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-asphalt-400">Modèles :</span>
          {presets.map((p) => (
            <SmallButton
              key={p.label}
              variant="ghost"
              onClick={() => {
                setTitle(p.title);
                setBody(p.body);
                setLevel(p.level);
                setPublished(true);
              }}
            >
              {p.label}
            </SmallButton>
          ))}
        </div>
        <Input label="Titre (en gras)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
        <Textarea label="Message" value={body} onChange={(e) => setBody(e.target.value)} maxLength={280} rows={3} />
        <Select label="Importance" value={level} onChange={(e) => setLevel(e.target.value)} className="sm:max-w-xs">
          <option value="info">Information</option>
          <option value="warning">Avertissement (jaune)</option>
          <option value="alert">Alerte (rouge)</option>
        </Select>
        <Check label="Afficher la bannière sur le site" checked={published} onChange={(e) => setPublished(e.target.checked)} />
        <SmallButton type="submit" variant="primary" className="self-start" busy={save.isPending}>
          <Save aria-hidden />
          Enregistrer
        </SmallButton>
      </form>
    </Panel>
  );
}

function ContactEditor({ row }: { row: ContentRow | undefined }) {
  const toast = useToast();
  const save = useUpsertContent();
  const data = (row?.data ?? {}) as Record<string, unknown> & { socials?: Record<string, string> };
  const [form, setForm] = useState({
    address: String(data.address ?? ''),
    postal_code: String(data.postal_code ?? ''),
    city: String(data.city ?? ''),
    phone: String(data.phone ?? ''),
    opening: String(data.opening ?? ''),
    facebook: data.socials?.facebook ?? '',
    instagram: data.socials?.instagram ?? '',
    youtube: data.socials?.youtube ?? '',
    tiktok: data.socials?.tiktok ?? '',
  });
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const e164 = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    return digits.startsWith('0') && digits.length === 10 ? `+33${digits.slice(1)}` : phone;
  };
  return (
    <Panel title="Coordonnées et réseaux sociaux">
      <form
        className="flex max-w-3xl flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(
            {
              key: 'contact',
              p: {
                data: {
                  ...data,
                  address: form.address,
                  postal_code: form.postal_code,
                  city: form.city,
                  phone: form.phone,
                  phone_e164: e164(form.phone),
                  opening: form.opening,
                  socials: { facebook: form.facebook, instagram: form.instagram, youtube: form.youtube, tiktok: form.tiktok },
                },
              },
            },
            { onSuccess: () => toast.success('Coordonnées enregistrées.'), onError: toast.error },
          );
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Adresse" value={form.address} onChange={(e) => set('address', e.target.value)} className="sm:col-span-3" />
          <Input label="Code postal" value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
          <Input label="Ville" value={form.city} onChange={(e) => set('city', e.target.value)} />
          <Input label="Téléphone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <Input label="Horaires (texte court)" value={form.opening} onChange={(e) => set('opening', e.target.value)} className="sm:col-span-3" hint="Les horaires détaillés se règlent dans Disponibilités." />
          <Input label="Facebook" type="url" value={form.facebook} onChange={(e) => set('facebook', e.target.value)} />
          <Input label="Instagram" type="url" value={form.instagram} onChange={(e) => set('instagram', e.target.value)} />
          <Input label="YouTube" type="url" value={form.youtube} onChange={(e) => set('youtube', e.target.value)} />
          <Input label="TikTok" type="url" value={form.tiktok} onChange={(e) => set('tiktok', e.target.value)} />
        </div>
        <SmallButton type="submit" variant="primary" className="self-start" busy={save.isPending}>
          <Save aria-hidden />
          Enregistrer
        </SmallButton>
      </form>
    </Panel>
  );
}

function PagesEditor({ rows }: { rows: ContentRow[] }) {
  const [editing, setEditing] = useState<ContentRow | null>(null);
  const known = rows.filter((r) => PAGE_PATHS[r.key]).sort((a, b) => Object.keys(PAGE_PATHS).indexOf(a.key) - Object.keys(PAGE_PATHS).indexOf(b.key));
  return (
    <Panel padded={false}>
      <ul className="divide-y divide-asphalt-800">
        {known.map((row) => (
          <li key={row.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-semibold text-chalk">{PAGE_PATHS[row.key]!.label}</span>
              <span className="block truncate text-xs text-asphalt-400">
                {row.title || '—'} · modifié le {formatDateTime(row.updated_at)}
                {row.updated_by ? ` par ${row.updated_by}` : ''}
              </span>
            </span>
            {!row.is_published && <Chip tone="neutral">Masqué</Chip>}
            <Link to={PAGE_PATHS[row.key]!.path} target="_blank" className="inline-flex h-9 items-center gap-1 px-2 text-sm text-asphalt-300 hover:text-chalk">
              <ExternalLink aria-hidden className="size-4" />
              <span className="sr-only">Voir la page {PAGE_PATHS[row.key]!.label}</span>
            </Link>
            <SmallButton variant="ghost" onClick={() => setEditing(row)}>
              <Pencil aria-hidden />
              Modifier
            </SmallButton>
          </li>
        ))}
      </ul>
      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing ? `Textes · ${PAGE_PATHS[editing.key]?.label ?? editing.key}` : ''}>
        {editing && <PageForm key={editing.key} row={editing} onClose={() => setEditing(null)} />}
      </Modal>
    </Panel>
  );
}

function PageForm({ row, onClose }: { row: ContentRow; onClose: () => void }) {
  const toast = useToast();
  const save = useUpsertContent();
  const data = row.data as Record<string, unknown>;
  const [title, setTitle] = useState(row.title);
  const [body, setBody] = useState(row.body);
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.keys(FIELD_LABELS).filter((k) => typeof data[k] === 'string').map((k) => [k, data[k] as string])),
  );
  const [sections, setSections] = useState<Record<string, SectionText>>(() => ({ ...((data.sections as Record<string, SectionText>) ?? {}) }));
  const legal = row.key.startsWith('legal.');

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          { key: row.key, p: { title, body, data: { ...data, ...fields, ...(data.sections ? { sections } : {}) } } },
          { onSuccess: () => (toast.success('Textes enregistrés.'), onClose()), onError: toast.error },
        );
      }}
    >
      <Input label="Titre de la page (H1)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea label={legal ? 'Contenu (Markdown)' : 'Introduction'} value={body} onChange={(e) => setBody(e.target.value)} rows={legal ? 16 : 3} hint={legal ? '## pour un intertitre, **gras**, - pour une liste.' : undefined} />
      {Object.keys(fields).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(fields).map(([key, value]) => (
            <Input
              key={key}
              label={FIELD_LABELS[key] ?? key}
              value={value}
              onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
              maxLength={key === 'seo_title' ? 70 : key === 'seo_description' ? 170 : 200}
              hint={key.startsWith('seo_') ? `${value.length} caractères` : undefined}
              className={key === 'seo_description' ? 'sm:col-span-2' : undefined}
            />
          ))}
        </div>
      )}
      {Object.keys(sections).length > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-asphalt-300">Sections</legend>
          {Object.entries(sections).map(([key, section]) => (
            <div key={key} className="grid gap-2 bg-asphalt-950 p-3 ring-1 ring-asphalt-800">
              <Input label={`Titre · ${key}`} value={section?.title ?? ''} onChange={(e) => setSections((s) => ({ ...s, [key]: { ...s[key]!, title: e.target.value } }))} />
              <Textarea label="Texte" value={section?.body ?? ''} rows={2} onChange={(e) => setSections((s) => ({ ...s, [key]: { ...s[key]!, body: e.target.value } }))} />
            </div>
          ))}
        </fieldset>
      )}
      <div className="flex justify-end gap-2 border-t border-asphalt-800 pt-4">
        <SmallButton variant="ghost" onClick={onClose}>
          Annuler
        </SmallButton>
        <SmallButton type="submit" variant="primary" busy={save.isPending}>
          <Save aria-hidden />
          Enregistrer
        </SmallButton>
      </div>
    </form>
  );
}

function ReviewsEditor() {
  const reviews = useReviews();
  const toast = useToast();
  const upsert = useUpsertReview();
  const remove = useDeleteReview();
  const [editing, setEditing] = useState<Partial<AdminReview> | null>(null);
  const [deleting, setDeleting] = useState<AdminReview | null>(null);
  if (reviews.isPending) return <Skeleton className="h-40" />;
  if (reviews.isError) return <ErrorPanel message={errorMessage(reviews.error)} />;
  return (
    <Panel
      title="Avis clients"
      actions={
        <SmallButton variant="primary" onClick={() => setEditing({ rating: 5, source: 'google', is_published: true })}>
          <Plus aria-hidden />
          Ajouter un avis
        </SmallButton>
      }
      padded={false}
    >
      <p className="px-4 pt-3 text-xs text-asphalt-400">Recopiez uniquement de vrais avis (Google, Facebook…), avec le prénom de l’auteur tel que publié.</p>
      <ul className="divide-y divide-asphalt-800">
        {reviews.data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
            <span className="min-w-0 flex-1 text-sm">
              <span className="flex items-center gap-2 font-semibold text-chalk">
                {r.author_name}
                <span className="flex text-flag-yellow" aria-label={`${r.rating} sur 5`}>
                  {Array.from({ length: r.rating }, (_, i) => (
                    <Star key={i} aria-hidden className="size-3.5 fill-current" />
                  ))}
                </span>
                <span className="text-xs font-normal text-asphalt-400">{r.source}</span>
              </span>
              <span className="line-clamp-2 text-asphalt-300">{r.body}</span>
            </span>
            {r.is_published ? <Chip tone="green">Publié</Chip> : <Chip tone="neutral">Masqué</Chip>}
            <SmallButton variant="ghost" onClick={() => setEditing(r)} aria-label={`Modifier l’avis de ${r.author_name}`}>
              <Pencil />
            </SmallButton>
            <SmallButton variant="ghost" onClick={() => setDeleting(r)} aria-label={`Supprimer l’avis de ${r.author_name}`}>
              <Trash2 />
            </SmallButton>
          </li>
        ))}
      </ul>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Modifier l’avis' : 'Nouvel avis'}>
        {editing && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              upsert.mutate(editing, { onSuccess: () => (toast.success('Avis enregistré.'), setEditing(null)), onError: toast.error });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Auteur" value={editing.author_name ?? ''} onChange={(e) => setEditing({ ...editing, author_name: e.target.value })} required />
              <Select label="Note" value={editing.rating ?? 5} onChange={(e) => setEditing({ ...editing, rating: Number(e.target.value) })}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
              </Select>
              <Select label="Source" value={editing.source ?? 'google'} onChange={(e) => setEditing({ ...editing, source: e.target.value as AdminReview['source'] })}>
                <option value="google">Google</option>
                <option value="facebook">Facebook</option>
                <option value="site">Site</option>
                <option value="other">Autre</option>
              </Select>
              <Input label="Date de l’avis" type="date" value={editing.review_date ?? ''} onChange={(e) => setEditing({ ...editing, review_date: e.target.value || null })} />
            </div>
            <Textarea label="Texte de l’avis" value={editing.body ?? ''} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={4} required />
            <Check label="Publier sur le site" checked={editing.is_published ?? false} onChange={(e) => setEditing({ ...editing, is_published: e.target.checked })} />
            <div className="flex justify-end gap-2 pt-2">
              <SmallButton variant="ghost" onClick={() => setEditing(null)}>
                Annuler
              </SmallButton>
              <SmallButton type="submit" variant="primary" busy={upsert.isPending}>
                Enregistrer
              </SmallButton>
            </div>
          </form>
        )}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        title="Supprimer cet avis ?"
        confirmLabel="Supprimer"
        danger
        busy={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => (toast.success('Avis supprimé.'), setDeleting(null)), onError: toast.error })}
      >
        {deleting?.author_name}
      </ConfirmDialog>
    </Panel>
  );
}
