import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyAdsConsent } from './analytics';
import { ConsentContext, type ConsentContextValue } from './consent-context';
import { CONSENT_VERSION, readStoredConsent, storeConsent, type ConsentCategory, type ConsentState } from './consent-storage';

export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentState | null>(() => readStoredConsent());
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  // Google Ads : balise chargée et consentement mis à jour selon le choix du visiteur
  useEffect(() => {
    applyAdsConsent(consent?.choices.ads ?? false);
  }, [consent]);

  const save = useCallback((choices: Record<ConsentCategory, boolean>) => {
    const next: ConsentState = { version: CONSENT_VERSION, decidedAt: new Date().toISOString(), choices };
    storeConsent(next);
    setConsent(next);
    setPreferencesOpen(false);
    window.dispatchEvent(new CustomEvent('kr:consent', { detail: next }));
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      consent,
      hasDecided: consent !== null,
      preferencesOpen,
      isGranted: (category) => consent?.choices[category] ?? false,
      acceptAll: () => save({ analytics: true, ads: true }),
      rejectAll: () => save({ analytics: false, ads: false }),
      save,
      openPreferences: () => setPreferencesOpen(true),
      closePreferences: () => setPreferencesOpen(false),
    }),
    [consent, preferencesOpen, save],
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}
