import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * Faux pendant le pré-rendu et pendant l'hydratation, vrai ensuite : ce qui
 * dépend du navigateur du visiteur (consentement, préférences stockées) n'est
 * affiché qu'après, sans écart avec le HTML pré-rendu.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
