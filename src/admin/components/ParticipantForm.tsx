import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useUpsertParticipant } from '../api';
import { useToast } from '../toast-context';
import { Input, Select, SmallButton } from '../ui';

/** Ajout d'un participant au comptoir (réservation téléphone à compléter) */
export function ParticipantForm({ bookingId }: { bookingId: string }) {
  const toast = useToast();
  const upsert = useUpsertParticipant();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', birth_date: '', role: 'driver', height_cm: '' });
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  if (!open) {
    return (
      <SmallButton className="self-start" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden />
        Ajouter un participant
      </SmallButton>
    );
  }
  return (
    <form
      className="flex flex-col gap-3 bg-asphalt-950 p-3 ring-1 ring-asphalt-800"
      onSubmit={(e) => {
        e.preventDefault();
        upsert.mutate(
          {
            bookingId,
            p: {
              first_name: form.first_name,
              last_name: form.last_name,
              birth_date: form.birth_date || null,
              role: form.role,
              height_cm: form.height_cm ? Number(form.height_cm) : null,
            },
          },
          {
            onSuccess: () => {
              toast.success('Participant ajouté.');
              setForm({ first_name: '', last_name: '', birth_date: '', role: 'driver', height_cm: '' });
              setOpen(false);
            },
            onError: toast.error,
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Prénom" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} required />
        <Input label="Nom" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} required />
        <Input label="Date de naissance" type="date" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} required />
        <Input label="Taille (cm)" type="number" min={50} max={250} value={form.height_cm} onChange={(e) => set('height_cm', e.target.value)} hint="Si une taille minimale s’applique" />
        <Select label="Rôle" value={form.role} onChange={(e) => set('role', e.target.value)}>
          <option value="driver">Pilote</option>
          <option value="passenger">Passager (biplace)</option>
        </Select>
      </div>
      <div className="flex justify-end gap-2">
        <SmallButton variant="ghost" onClick={() => setOpen(false)}>
          Annuler
        </SmallButton>
        <SmallButton type="submit" variant="primary" busy={upsert.isPending}>
          Ajouter
        </SmallButton>
      </div>
    </form>
  );
}
