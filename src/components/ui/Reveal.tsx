import { m } from 'framer-motion';
import type { ReactNode } from 'react';
import { useIsLandingPage } from './landing-context';

/** Apparition au défilement (désactivée si « réduire les animations »). */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const landing = useIsLandingPage();
  return (
    <m.div
      className={className}
      initial={landing ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ duration: 0.55, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </m.div>
  );
}
