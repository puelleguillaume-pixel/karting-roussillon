import { useEffect, useReducer, useState } from 'react';
import { EMPTY_PARTICIPANT, pilotKey, validateParticipant, type ParticipantDraft, type ParticipantRules } from '@/lib/booking-rules';
import type { AvailabilitySlot, CustomerInput, ParticipantInput } from '@/lib/data/types';
import { forgetPendingGiftCode, pendingGiftCode } from '@/lib/giftcards';

// État du parcours de réservation, conservé dans sessionStorage (survit à un
// rechargement ou à un aller-retour sur une autre page pendant la saisie).

export interface HoldState {
  token: string;
  expiresAt: string;
  slotIds: string[];
  karts: number;
}

export interface FlowState {
  productSlug: string;
  karts: number;
  day: string | null;
  slots: AvailabilitySlot[]; // créneaux choisis, triés par heure
  hold: HoldState | null;
  contact: CustomerInput;
  drivers: ParticipantDraft[];
  passengers: Array<ParticipantDraft | null>;
  giftCode: string;
  note: string;
}

export type FlowAction =
  | { type: 'setKarts'; karts: number }
  | { type: 'selectDay'; day: string }
  | { type: 'toggleSlot'; slot: AvailabilitySlot; max: number; day: string }
  | { type: 'setHold'; hold: HoldState | null }
  | { type: 'setContact'; patch: Partial<CustomerInput> }
  | { type: 'setDriver'; index: number; patch: Partial<ParticipantDraft> }
  | { type: 'setPassenger'; index: number; draft: ParticipantDraft | null }
  | { type: 'setPassengerField'; index: number; patch: Partial<ParticipantDraft> }
  | { type: 'setGiftCode'; code: string }
  | { type: 'setNote'; note: string };

const STORAGE_KEY = 'kr-booking-flow-v1';
const EMPTY_CONTACT: CustomerInput = { first_name: '', last_name: '', email: '', phone: '' };

function resize<T>(list: T[], length: number, fill: () => T): T[] {
  return Array.from({ length }, (_, i) => list[i] ?? fill());
}

export function initialFlow(productSlug: string, contact: CustomerInput = EMPTY_CONTACT): FlowState {
  return {
    productSlug,
    karts: 1,
    day: null,
    slots: [],
    hold: null,
    contact,
    drivers: [{ ...EMPTY_PARTICIPANT }],
    passengers: [null],
    giftCode: pendingGiftCode(),
    note: '',
  };
}

function reducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'setKarts':
      return {
        ...state,
        karts: action.karts,
        slots: [],
        drivers: resize(state.drivers, action.karts, () => ({ ...EMPTY_PARTICIPANT })),
        passengers: resize(state.passengers, action.karts, () => null),
      };
    case 'selectDay':
      return state.day === action.day ? state : { ...state, day: action.day, slots: [] };
    case 'toggleSlot': {
      if (state.day !== action.day) return { ...state, day: action.day, slots: [action.slot] };
      const selected = state.slots.some((s) => s.slot_id === action.slot.slot_id);
      if (selected) return { ...state, slots: state.slots.filter((s) => s.slot_id !== action.slot.slot_id) };
      const next = action.max === 1 ? [action.slot] : [...state.slots, action.slot].slice(-action.max);
      return { ...state, slots: next.sort((a, b) => a.starts_at.localeCompare(b.starts_at)) };
    }
    case 'setHold':
      return { ...state, hold: action.hold };
    case 'setContact':
      return { ...state, contact: { ...state.contact, ...action.patch } };
    case 'setDriver':
      return { ...state, drivers: state.drivers.map((d, i) => (i === action.index ? { ...d, ...action.patch } : d)) };
    case 'setPassenger':
      return { ...state, passengers: state.passengers.map((p, i) => (i === action.index ? action.draft : p)) };
    case 'setPassengerField':
      return {
        ...state,
        passengers: state.passengers.map((p, i) => (i === action.index && p ? { ...p, ...action.patch } : p)),
      };
    case 'setGiftCode':
      return { ...state, giftCode: action.code };
    case 'setNote':
      return { ...state, note: action.note };
  }
}

function readStored(productSlug: string): FlowState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as FlowState;
      if (stored.productSlug === productSlug) return { ...stored, giftCode: stored.giftCode || pendingGiftCode() };
      return initialFlow(productSlug, stored.contact); // on garde les coordonnées
    }
  } catch {
    // stockage indisponible ou contenu illisible : parcours neuf
  }
  return initialFlow(productSlug);
}

export function clearStoredFlow(keepContact = true) {
  forgetPendingGiftCode();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (keepContact && raw) {
      const stored = JSON.parse(raw) as FlowState;
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(initialFlow('', stored.contact)));
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // rien à nettoyer
  }
}

export function useBookingFlow(productSlug: string) {
  const [state, dispatch] = useReducer(reducer, productSlug, readStored);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // stockage indisponible : l'état reste en mémoire
    }
  }, [state]);
  return [state, dispatch] as const;
}

/** Le blocage correspond-il toujours à la sélection (mêmes créneaux, même nombre de karts) ? */
export function holdMatches(state: FlowState): boolean {
  const hold = state.hold;
  if (!hold) return false;
  const ids = state.slots.map((s) => s.slot_id);
  return hold.karts === state.karts && hold.slotIds.length === ids.length && hold.slotIds.every((id) => ids.includes(id));
}

export const STEPS = ['Activité', 'Créneau', 'Pilotes', 'Confirmation'] as const;

// -----------------------------------------------------------------------------
// Validation de l'étape « Pilotes » et données envoyées à confirm_booking
// -----------------------------------------------------------------------------
export interface StepRules {
  driver: ParticipantRules;
  passenger: ParticipantRules | null;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function participantErrors(state: FlowState, rules: StepRules): Record<string, string> {
  const errors: Record<string, string> = {};
  const contact = state.contact;
  if (!contact.first_name.trim()) errors['contact.first_name'] = 'Indiquez votre prénom.';
  if (!contact.last_name.trim()) errors['contact.last_name'] = 'Indiquez votre nom.';
  if (!EMAIL.test(contact.email.trim())) errors['contact.email'] = 'Indiquez une adresse email valide, par exemple nom@exemple.fr.';
  if (contact.phone.replace(/\D/g, '').length < 10) errors['contact.phone'] = 'Indiquez un numéro de téléphone à 10 chiffres.';

  const seen = new Set<string>();
  const check = (draft: ParticipantDraft, name: string, participantRules: ParticipantRules, who: string) => {
    for (const [field, message] of Object.entries(validateParticipant(draft, participantRules, who))) {
      errors[`${name}.${field}`] = message;
    }
    if (draft.first_name && draft.last_name && draft.birth_date) {
      const key = pilotKey(draft);
      if (seen.has(key)) errors[`${name}.first_name`] = 'Ce participant est déjà saisi.';
      seen.add(key);
    }
  };
  state.drivers.forEach((driver, i) => check(driver, `driver.${i}`, rules.driver, state.drivers.length > 1 ? `Le pilote ${i + 1}` : 'Le pilote'));
  state.passengers.forEach((passenger, i) => {
    if (passenger && rules.passenger) check(passenger, `passenger.${i}`, rules.passenger, 'Le passager');
  });
  return errors;
}

export function participantsPayload(state: FlowState): ParticipantInput[] {
  const toInput = (draft: ParticipantDraft, role: ParticipantInput['role']): ParticipantInput => ({
    role,
    first_name: draft.first_name.trim(),
    last_name: draft.last_name.trim(),
    birth_date: draft.birth_date,
    height_cm: draft.height_cm ? Number(draft.height_cm) : null,
    height_certified: draft.height_certified,
    guardian_name: draft.guardian_name.trim(),
  });
  return [
    ...state.drivers.map((driver) => toInput(driver, 'driver')),
    ...state.passengers.filter((p): p is ParticipantDraft => !!p).map((passenger) => toInput(passenger, 'passenger')),
  ];
}

/** Temps restant avant l'expiration d'un blocage de créneau. */
export function useCountdown(expiresAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);
  const remainingMs = expiresAt ? Math.max(0, new Date(expiresAt).getTime() - now) : 0;
  return { remainingMs, expired: !!expiresAt && remainingMs === 0 };
}
