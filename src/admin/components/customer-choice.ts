import type { CustomerRow } from '../types';

export interface NewCustomer {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

export type CustomerChoice = { kind: 'existing'; customer: CustomerRow } | { kind: 'new'; customer: NewCustomer } | null;

export const EMPTY_CUSTOMER: NewCustomer = { first_name: '', last_name: '', email: '', phone: '' };

/** Champs « client » attendus par les RPC admin (client existant ou nouveau) */
export function customerPayload(choice: CustomerChoice): { customer_id?: string; customer?: NewCustomer } {
  if (choice?.kind === 'existing') return { customer_id: choice.customer.id };
  if (choice?.kind === 'new') {
    const c = choice.customer;
    return { customer: { first_name: c.first_name.trim(), last_name: c.last_name.trim(), email: c.email.trim(), phone: c.phone.trim() } };
  }
  return {};
}

export function customerError(choice: CustomerChoice): string | undefined {
  if (!choice) return 'Choisissez ou créez un client.';
  if (choice.kind === 'new') {
    const c = choice.customer;
    if (!c.last_name.trim() && !c.first_name.trim()) return 'Nom du client obligatoire.';
    if (c.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email.trim())) return 'Email invalide.';
  }
  return undefined;
}

export function customerEmail(choice: CustomerChoice): string | null {
  if (choice?.kind === 'existing') return choice.customer.email;
  if (choice?.kind === 'new') return choice.customer.email.trim() || null;
  return null;
}
