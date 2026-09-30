import { CircleCheck, Send } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/feedback';
import { SelectField, TextAreaField, TextField } from '@/components/ui/fields';
import { errorMessage } from '@/lib/data/errors';
import type { Product, RequestType } from '@/lib/data/types';
import { todayInParis } from '@/lib/format';
import { useSubmitRequest } from '@/lib/queries';

export interface ExtraField {
  name: string;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}

interface RequestFormProps {
  type: RequestType;
  typeOptions?: Array<{ value: RequestType; label: string }>;
  typeLabel?: string;
  products?: Product[];
  productLabel?: string;
  askCompany?: boolean;
  requireCompany?: boolean;
  askDates?: boolean;
  requireDate?: boolean;
  askParticipants?: boolean;
  participantsLabel?: string;
  extraFields?: ExtraField[];
  subject?: string;
  messageLabel?: string;
  messagePlaceholder?: string;
  requireMessage?: boolean;
  submitLabel?: string;
}

type Values = Record<string, string>;
type Errors = Record<string, string>;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function RequestForm({
  type,
  typeOptions,
  typeLabel = 'Activité',
  products,
  productLabel = 'Formule',
  askCompany = false,
  requireCompany = false,
  askDates = true,
  requireDate = true,
  askParticipants = true,
  participantsLabel = 'Nombre de participants',
  extraFields = [],
  subject,
  messageLabel = 'Votre message',
  messagePlaceholder,
  requireMessage = false,
  submitLabel = 'Envoyer la demande',
}: RequestFormProps) {
  const initialValues = (): Values => ({
    type: typeOptions?.[0]?.value ?? type,
    product_id: products?.[0]?.id ?? '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company: '',
    preferred_date: '',
    alternative_date: '',
    participants_count: '',
    message: '',
    website: '',
    ...Object.fromEntries(extraFields.map((f) => [f.name, ''])),
  });
  const [values, setValues] = useState<Values>(initialValues);
  const [errors, setErrors] = useState<Errors>({});
  const [reference, setReference] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const submit = useSubmitRequest();
  const today = todayInParis();

  useEffect(() => {
    if (reference) successRef.current?.focus();
  }, [reference]);

  const set = (name: string) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [name]: event.target.value }));

  function validate(v: Values): Errors {
    const e: Errors = {};
    if (!v.first_name?.trim()) e.first_name = 'Indiquez votre prénom.';
    if (!v.last_name?.trim()) e.last_name = 'Indiquez votre nom.';
    if (!EMAIL.test(v.email?.trim() ?? '')) e.email = 'Indiquez une adresse email valide, par exemple nom@exemple.fr.';
    if ((v.phone?.replace(/\D/g, '').length ?? 0) < 10) e.phone = 'Indiquez un numéro de téléphone à 10 chiffres.';
    if (requireCompany && !v.company?.trim()) e.company = "Indiquez le nom de l'entreprise.";
    if (askDates && requireDate && !v.preferred_date) e.preferred_date = 'Choisissez une date souhaitée.';
    if (v.preferred_date && v.preferred_date < today) e.preferred_date = 'La date souhaitée est passée.';
    if (v.alternative_date && v.alternative_date < today) e.alternative_date = 'La date de repli est passée.';
    if (askParticipants) {
      const n = Number(v.participants_count);
      if (!Number.isInteger(n) || n < 1 || n > 500) e.participants_count = 'Indiquez un nombre entre 1 et 500.';
    }
    for (const field of extraFields) {
      if (field.required && !v[field.name]?.trim()) e[field.name] = `Renseignez : ${field.label.toLowerCase()}.`;
    }
    if (requireMessage && !v.message?.trim()) e.message = 'Écrivez votre message.';
    return e;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    const firstInvalid = Object.keys(found)[0];
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
      return;
    }
    // Champ piège rempli : robot probable, on simule un succès sans rien envoyer
    if (values.website) {
      setReference('—');
      return;
    }
    const details: Record<string, unknown> = {
      preferred_date: values.preferred_date || null,
      alternative_date: values.alternative_date || null,
      participants_count: askParticipants ? Number(values.participants_count) : null,
      message: values.message?.trim() ?? '',
      product_id: values.product_id || null,
      ...(subject ? { subject } : {}),
      ...Object.fromEntries(extraFields.map((f) => [f.name, values[f.name]?.trim() ?? ''])),
    };
    submit.mutate(
      {
        type: values.type as RequestType,
        contact: {
          first_name: values.first_name!.trim(),
          last_name: values.last_name!.trim(),
          email: values.email!.trim(),
          phone: values.phone!.trim(),
          company: values.company?.trim() ?? '',
        },
        details,
      },
      { onSuccess: (result) => setReference(result.reference) },
    );
  }

  if (reference) {
    return (
      <div className="flex flex-col items-start gap-4 border-l-4 border-flag-green bg-asphalt-900 p-6">
        <CircleCheck aria-hidden className="size-8 text-flag-green" />
        <h3 ref={successRef} tabIndex={-1} className="text-display-md font-bold uppercase focus:outline-none">
          Demande envoyée
        </h3>
        <p className="text-asphalt-200">
          Merci ! L'équipe du circuit revient vers vous pour organiser votre venue.
          {reference !== '—' && (
            <>
              {' '}
              Référence de votre demande : <strong className="font-semibold text-chalk tabular">{reference}</strong>.
            </>
          )}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setValues(initialValues());
            setReference(null);
            submit.reset();
          }}
        >
          Faire une autre demande
        </Button>
      </div>
    );
  }

  return (
    <form ref={formRef} noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
      {typeOptions && (
        <SelectField label={typeLabel} name="type" required value={values.type} onChange={set('type')}>
          {typeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      )}
      {products && products.length > 1 && (
        <SelectField label={productLabel} name="product_id" required value={values.product_id} onChange={set('product_id')}>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </SelectField>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Prénom" name="first_name" autoComplete="given-name" required value={values.first_name} onChange={set('first_name')} error={errors.first_name} />
        <TextField label="Nom" name="last_name" autoComplete="family-name" required value={values.last_name} onChange={set('last_name')} error={errors.last_name} />
        <TextField label="Email" name="email" type="email" autoComplete="email" inputMode="email" required value={values.email} onChange={set('email')} error={errors.email} />
        <TextField label="Téléphone" name="phone" type="tel" autoComplete="tel" inputMode="tel" required value={values.phone} onChange={set('phone')} error={errors.phone} />
        {askCompany && (
          <TextField
            label="Entreprise"
            name="company"
            autoComplete="organization"
            required={requireCompany}
            value={values.company}
            onChange={set('company')}
            error={errors.company}
            className="sm:col-span-2"
          />
        )}
        {askDates && (
          <>
            <TextField label="Date souhaitée" name="preferred_date" type="date" min={today} required={requireDate} value={values.preferred_date} onChange={set('preferred_date')} error={errors.preferred_date} />
            <TextField label="Autre date possible" name="alternative_date" type="date" min={today} value={values.alternative_date} onChange={set('alternative_date')} error={errors.alternative_date} />
          </>
        )}
        {askParticipants && (
          <TextField
            label={participantsLabel}
            name="participants_count"
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            required
            value={values.participants_count}
            onChange={set('participants_count')}
            error={errors.participants_count}
          />
        )}
        {extraFields.map((field) => (
          <TextField
            key={field.name}
            label={field.label}
            name={field.name}
            placeholder={field.placeholder}
            hint={field.hint}
            required={field.required}
            value={values[field.name]}
            onChange={set(field.name)}
            error={errors[field.name]}
          />
        ))}
      </div>

      <TextAreaField
        label={messageLabel}
        name="message"
        required={requireMessage}
        placeholder={messagePlaceholder}
        maxLength={5000}
        value={values.message}
        onChange={set('message')}
        error={errors.message}
      />

      {/* Champ piège anti-robots : invisible pour les humains */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Site web
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set('website')} />
        </label>
      </div>

      {submit.isError && (
        <Alert tone="error" title="La demande n'a pas pu être envoyée">
          {errorMessage(submit.error)}
        </Alert>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-xs text-asphalt-400">
          Vos données servent uniquement à traiter votre demande.{' '}
          <Link to="/confidentialite" className="underline underline-offset-2 hover:text-chalk">
            Politique de confidentialité
          </Link>
        </p>
        <Button type="submit" size="lg" disabled={submit.isPending} className="shrink-0">
          <Send aria-hidden className="size-4" />
          {submit.isPending ? 'Envoi…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
