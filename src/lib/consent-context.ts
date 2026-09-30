import { createContext, useContext } from 'react';
import type { ConsentCategory, ConsentState } from './consent-storage';

export interface ConsentContextValue {
  consent: ConsentState | null;
  hasDecided: boolean;
  preferencesOpen: boolean;
  isGranted: (category: ConsentCategory) => boolean;
  acceptAll: () => void;
  rejectAll: () => void;
  save: (choices: Record<ConsentCategory, boolean>) => void;
  openPreferences: () => void;
  closePreferences: () => void;
}

export const ConsentContext = createContext<ConsentContextValue | null>(null);

export function useConsent(): ConsentContextValue {
  const context = useContext(ConsentContext);
  if (!context) throw new Error('useConsent() doit être utilisé dans <ConsentProvider>');
  return context;
}
