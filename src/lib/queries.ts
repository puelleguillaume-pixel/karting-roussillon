import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { buildCatalog } from '@/lib/catalog';
import { rpc } from '@/lib/data/source';
import { env } from '@/lib/env';
import type {
  CalendarItem,
  GiftCardCheck,
  LeaderboardGroup,
  RequestContact,
  RequestType,
  SiteBundle,
  SubmitRequestResult,
} from '@/lib/data/types';

export const queryKeys = {
  bundle: ['site-bundle'] as const,
  calendar: (from: string, to: string) => ['public-calendar', from, to] as const,
  leaderboard: (perGroup: number) => ['leaderboard', perGroup] as const,
};

/**
 * Données embarquées dans le HTML au build (scripts/prerender.mjs) : la page
 * s'affiche sans attendre le réseau, puis les données sont rafraîchies.
 */
function embeddedBundle(): { data: SiteBundle; updatedAt: number } | undefined {
  try {
    const node = document.getElementById('kr-site-bundle');
    if (!node?.textContent) return undefined;
    const updatedAt = Date.parse(node.dataset.generatedAt ?? '') || 0;
    return { data: JSON.parse(node.textContent) as SiteBundle, updatedAt };
  } catch {
    return undefined;
  }
}
const initialBundle = typeof document === 'undefined' ? undefined : embeddedBundle();

/** Catalogue, contenus, paramètres publics, horaires, avis : un seul appel. */
export function useSiteBundle() {
  return useQuery({
    queryKey: queryKeys.bundle,
    queryFn: () => rpc<SiteBundle>('get_site_bundle'),
    staleTime: 5 * 60_000,
    initialData: initialBundle?.data,
    // Production : relue en arrière-plan quand la version du build a vieilli.
    // Démo : la base du navigateur est recréée avec d'autres identifiants que
    // celle du build ; les données intégrées ne servent qu'au premier affichage
    // et sont relues dès que la base locale est prête.
    initialDataUpdatedAt: env.dataSource === 'demo' ? 0 : initialBundle?.updatedAt,
  });
}

/**
 * Données communes, garanties chargées : le layout n'affiche les pages
 * qu'une fois le bundle disponible (voir BundleGate).
 */
export function useBundle(): SiteBundle {
  const { data } = useSiteBundle();
  if (!data) throw new Error('useBundle() utilisé hors de BundleGate');
  return data;
}

export function useCatalog() {
  const bundle = useBundle();
  return useMemo(() => buildCatalog(bundle), [bundle]);
}

export function usePublicCalendar(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.calendar(from, to),
    queryFn: () => rpc<CalendarItem[]>('get_public_calendar', { p_from: from, p_to: to }),
    staleTime: 60_000,
    enabled,
  });
}

export function useLeaderboard(perGroup = 10) {
  return useQuery({
    queryKey: queryKeys.leaderboard(perGroup),
    queryFn: () => rpc<LeaderboardGroup[]>('get_leaderboard', { p_per_group: perGroup }),
    staleTime: 5 * 60_000,
  });
}

export interface RequestInput {
  type: RequestType;
  contact: RequestContact;
  details: Record<string, unknown>;
}

export function useSubmitRequest() {
  return useMutation({
    mutationFn: ({ type, contact, details }: RequestInput) =>
      rpc<SubmitRequestResult>('submit_request', { p_type: type, p_contact: contact, p_details: details }),
  });
}

export function useCheckGiftCard() {
  return useMutation({
    mutationFn: (code: string) => rpc<GiftCardCheck>('check_gift_card', { p_code: code }),
  });
}
