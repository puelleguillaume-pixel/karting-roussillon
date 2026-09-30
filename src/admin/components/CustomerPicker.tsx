import { UserPlus, X } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { useCustomers } from '../api';
import { EMPTY_CUSTOMER, type CustomerChoice, type NewCustomer } from './customer-choice';
import { Input, SearchInput, SmallButton } from '../ui';

/** Recherche d'un client existant ou saisie d'un nouveau client */
export function CustomerPicker({ value, onChange, error }: { value: CustomerChoice; onChange: (v: CustomerChoice) => void; error?: string }) {
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q.trim());
  const results = useCustomers({ q: deferred, limit: 6 }, deferred.length >= 2);

  if (value?.kind === 'existing') {
    const c = value.customer;
    return (
      <div className="flex items-center justify-between gap-3 bg-asphalt-950 px-3 py-2 ring-1 ring-asphalt-700">
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-chalk">
            {c.first_name} {c.last_name}
            {c.company ? ` · ${c.company}` : ''}
          </p>
          <p className="truncate text-xs text-asphalt-400">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
        </div>
        <SmallButton variant="ghost" aria-label="Changer de client" onClick={() => onChange(null)}>
          <X />
        </SmallButton>
      </div>
    );
  }

  if (value?.kind === 'new') {
    const c = value.customer;
    const set = (key: keyof NewCustomer, v: string) => onChange({ kind: 'new', customer: { ...c, [key]: v } });
    return (
      <div className="flex flex-col gap-3 bg-asphalt-950 p-3 ring-1 ring-asphalt-700">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-asphalt-300">Nouveau client</p>
          <SmallButton variant="ghost" onClick={() => onChange(null)}>
            Rechercher plutôt
          </SmallButton>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Prénom" value={c.first_name} onChange={(e) => set('first_name', e.target.value)} autoComplete="off" />
          <Input label="Nom" value={c.last_name} onChange={(e) => set('last_name', e.target.value)} autoComplete="off" required />
          <Input label="Téléphone" type="tel" value={c.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="off" />
          <Input label="Email" type="email" value={c.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" hint="Pour la confirmation et le QR code" />
        </div>
        {error && <p className="text-xs font-medium text-race-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} label="Rechercher un client" placeholder="Nom, téléphone ou email…" />
        <SmallButton onClick={() => onChange({ kind: 'new', customer: { ...EMPTY_CUSTOMER } })}>
          <UserPlus aria-hidden />
          Nouveau client
        </SmallButton>
      </div>
      {deferred.length >= 2 && (
        <ul className="flex flex-col divide-y divide-asphalt-800 ring-1 ring-asphalt-800" aria-label="Clients trouvés">
          {results.data?.rows.length === 0 && <li className="px-3 py-2 text-sm text-asphalt-400">Aucun client trouvé.</li>}
          {results.data?.rows.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onChange({ kind: 'existing', customer: c })} className="flex w-full flex-col px-3 py-2 text-left hover:bg-asphalt-850">
                <span className="text-sm font-semibold text-chalk">
                  {c.first_name} {c.last_name}
                  {c.company ? ` · ${c.company}` : ''}
                </span>
                <span className="text-xs text-asphalt-400">{[c.phone, c.email].filter(Boolean).join(' · ') || 'Sans coordonnées'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs font-medium text-race-400">{error}</p>}
    </div>
  );
}

