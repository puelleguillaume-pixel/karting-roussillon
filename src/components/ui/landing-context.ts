import { createContext, useContext } from 'react';

/**
 * Vrai sur la page d'arrivée (déjà affichée par le HTML pré-rendu) : les
 * animations d'apparition y sont désactivées pour ne pas masquer puis
 * réafficher un contenu déjà visible.
 */
export const LandingPageContext = createContext(false);

export const useIsLandingPage = () => useContext(LandingPageContext);
