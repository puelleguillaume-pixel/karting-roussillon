export interface NavItem {
  label: string;
  to: string;
  children?: NavItem[];
}

export const FORMULA_NAV: NavItem[] = [
  { label: 'Anniversaire', to: '/formules/anniversaire' },
  { label: 'EVG & EVJF', to: '/formules/evg-evjf' },
  { label: 'Groupes & entreprises', to: '/formules/team-building' },
];

export const MAIN_NAV: NavItem[] = [
  { label: 'Karts & tarifs', to: '/karts-tarifs' },
  { label: 'Pistes', to: '/circuits' },
  { label: 'Événements', to: '/evenements' },
  { label: 'Groupes', to: '/formules', children: FORMULA_NAV },
  { label: 'Chronos', to: '/chronos' },
  { label: 'Contact', to: '/contact' },
];

export const LEGAL_NAV: NavItem[] = [
  { label: 'Mentions légales', to: '/mentions-legales' },
  { label: 'CGV', to: '/cgv' },
  { label: 'Confidentialité', to: '/confidentialite' },
  { label: 'Cookies', to: '/cookies' },
];

/** Liens directions : Google Maps et Waze à partir de l'adresse en base */
export function directionsLinks(query: string) {
  const q = encodeURIComponent(query);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
  };
}
