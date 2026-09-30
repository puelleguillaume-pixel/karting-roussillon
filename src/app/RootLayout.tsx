import { m } from 'framer-motion';
import { useState } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { DemoNotice, InfoBanner, MobileCtaBar } from '@/components/layout/bars';
import { BundleGate } from '@/components/layout/BundleGate';
import { CookieConsent } from '@/components/layout/CookieConsent';
import { Footer } from '@/components/layout/Footer';
import { LandingPageContext } from '@/components/ui/landing-context';
import { Header } from '@/components/layout/Header';

export function RootLayout() {
  const { pathname } = useLocation();
  // Pas d'animation d'entrée sur la première page : elle est déjà affichée par
  // le HTML pré-rendu (et un contenu à opacité nulle retarderait l'affichage)
  const [landingPath] = useState(pathname);
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#contenu"
        className="sr-only z-[70] bg-race-600 px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Aller au contenu
      </a>
      <DemoNotice />
      <InfoBanner />
      <Header />
      <main id="contenu" tabIndex={-1} className="flex-1 focus:outline-none">
        <BundleGate>
          <m.div
            key={pathname}
            initial={pathname === landingPath ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <LandingPageContext.Provider value={pathname === landingPath}>
              <Outlet />
            </LandingPageContext.Provider>
          </m.div>
        </BundleGate>
      </main>
      <Footer />
      <MobileCtaBar />
      <CookieConsent />
      <ScrollRestoration />
    </div>
  );
}
