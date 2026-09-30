import type { ReactNode } from 'react';
import { CheckboxField, TextField } from '@/components/ui/fields';
import { isMinorOn, type ParticipantDraft } from '@/lib/booking-rules';
import { formatHeight, todayInParis } from '@/lib/format';

interface ParticipantFieldsProps {
  name: string; // préfixe des champs (ex. « driver.0 ») : sert au focus sur erreur
  legend: ReactNode;
  value: ParticipantDraft;
  errors: Record<string, string>;
  day: string;
  minHeight: number | null;
  onChange: (patch: Partial<ParticipantDraft>) => void;
  action?: ReactNode;
  children?: ReactNode;
}

export function ParticipantFields({ name, legend, value, errors, day, minHeight, onChange, action, children }: ParticipantFieldsProps) {
  const minor = isMinorOn(value.birth_date, day);
  const error = (field: string) => errors[`${name}.${field}`];
  return (
    <fieldset className="bg-asphalt-900 p-5 ring-1 ring-asphalt-800">
      {/* La légende reste le premier enfant du fieldset (annoncée avec chaque champ) */}
      <legend className="float-left mb-4 flex w-full flex-wrap items-center justify-between gap-3">
        <span className="font-display text-lg font-bold uppercase">{legend}</span>
        {action}
      </legend>
      <div className="clear-left grid gap-4 sm:grid-cols-2">
        <TextField label="Prénom" name={`${name}.first_name`} autoComplete="off" required value={value.first_name} onChange={(e) => onChange({ first_name: e.target.value })} error={error('first_name')} />
        <TextField label="Nom" name={`${name}.last_name`} autoComplete="off" required value={value.last_name} onChange={(e) => onChange({ last_name: e.target.value })} error={error('last_name')} />
        <TextField
          label="Date de naissance"
          name={`${name}.birth_date`}
          type="date"
          max={todayInParis()}
          required
          value={value.birth_date}
          onChange={(e) => onChange({ birth_date: e.target.value })}
          error={error('birth_date')}
        />
        {minHeight !== null && (
          <div className="flex flex-col gap-2">
            <TextField
              label="Taille (cm)"
              name={`${name}.height_cm`}
              type="number"
              inputMode="numeric"
              min={50}
              max={250}
              hint={`Minimum ${formatHeight(minHeight)}`}
              value={value.height_cm}
              onChange={(e) => onChange({ height_cm: e.target.value })}
              error={error('height_cm')}
            />
            <CheckboxField
              label={`Je certifie qu'il ou elle mesure au moins ${formatHeight(minHeight)} (vérifié à l'accueil)`}
              checked={value.height_certified}
              onChange={(e) => onChange({ height_certified: e.target.checked })}
            />
          </div>
        )}
        {minor && (
          <TextField
            label="Représentant légal (nom et prénom)"
            name={`${name}.guardian_name`}
            required
            hint="Participant mineur : la décharge est acceptée par son représentant légal."
            value={value.guardian_name}
            onChange={(e) => onChange({ guardian_name: e.target.value })}
            error={error('guardian_name')}
            className="sm:col-span-2"
          />
        )}
        {children}
      </div>
    </fieldset>
  );
}
