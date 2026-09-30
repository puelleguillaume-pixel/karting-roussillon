// Pages publiques indexables : chemin → contenu éditorial (titre, SEO).
// Partagé par le site, le sitemap et le pré-rendu des métadonnées
// (scripts/prerender.mjs) : aucune dépendance d'exécution, importable par Node.

export interface PublicRoute {
  path: string;
  /** Clé site_content qui porte le titre (H1), l'introduction et le SEO */
  contentKey: string;
  /** Libellé du fil d'Ariane */
  label: string;
  priority: number;
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** Parent dans le fil d'Ariane (hors accueil) */
  parent?: string;
}

export const PUBLIC_ROUTES: PublicRoute[] = [
  { path: '/', contentKey: 'page.home', label: 'Accueil', priority: 1, changefreq: 'weekly' },
  { path: '/karts-tarifs', contentKey: 'page.karts-tarifs', label: 'Karts & tarifs', priority: 0.9, changefreq: 'monthly' },
  { path: '/reserver', contentKey: 'page.reserver', label: 'Réserver', priority: 0.9, changefreq: 'weekly' },
  { path: '/bon-cadeau', contentKey: 'page.bon-cadeau', label: 'Bon cadeau', priority: 0.9, changefreq: 'monthly' },
  { path: '/circuits', contentKey: 'page.circuits', label: 'Circuits', priority: 0.8, changefreq: 'monthly' },
  { path: '/trackday', contentKey: 'page.trackday', label: 'Trackday', priority: 0.8, changefreq: 'daily' },
  { path: '/formules', contentKey: 'page.formules', label: 'Formules', priority: 0.8, changefreq: 'monthly' },
  { path: '/formules/anniversaire', contentKey: 'page.anniversaire', label: 'Anniversaire', priority: 0.8, changefreq: 'monthly', parent: '/formules' },
  { path: '/formules/evg-evjf', contentKey: 'page.evg-evjf', label: 'EVG & EVJF', priority: 0.7, changefreq: 'monthly', parent: '/formules' },
  { path: '/formules/team-building', contentKey: 'page.team-building', label: 'Team building', priority: 0.7, changefreq: 'monthly', parent: '/formules' },
  { path: '/ecole-de-pilotage', contentKey: 'page.ecole-de-pilotage', label: 'École de pilotage', priority: 0.7, changefreq: 'monthly' },
  { path: '/alpine-a110s', contentKey: 'page.alpine-a110s', label: 'Alpine A110S', priority: 0.7, changefreq: 'monthly' },
  { path: '/chronos', contentKey: 'page.chronos', label: 'Chronos', priority: 0.5, changefreq: 'weekly' },
  { path: '/contact', contentKey: 'page.contact', label: 'Contact & accès', priority: 0.7, changefreq: 'yearly' },
  { path: '/mentions-legales', contentKey: 'legal.mentions', label: 'Mentions légales', priority: 0.1, changefreq: 'yearly' },
  { path: '/cgv', contentKey: 'legal.cgv', label: 'CGV', priority: 0.1, changefreq: 'yearly' },
  { path: '/confidentialite', contentKey: 'legal.privacy', label: 'Confidentialité', priority: 0.1, changefreq: 'yearly' },
  { path: '/cookies', contentKey: 'legal.cookies', label: 'Cookies', priority: 0.1, changefreq: 'yearly' },
];

/** Chemins jamais indexés (robots.txt et balise noindex) */
export const PRIVATE_PATH_PREFIXES = ['/admin', '/mon-compte', '/reservation/', '/demo/'];

export function findRoute(path: string): PublicRoute | undefined {
  const normalized = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return PUBLIC_ROUTES.find((r) => r.path === normalized);
}

/** Fil d'Ariane d'une page : Accueil › (parent) › page */
export function breadcrumbTrail(path: string): Array<{ name: string; path: string }> {
  const route = findRoute(path);
  if (!route || route.path === '/') return [];
  const trail = [{ name: 'Accueil', path: '/' }];
  const parent = route.parent ? findRoute(route.parent) : undefined;
  if (parent) trail.push({ name: parent.label, path: parent.path });
  trail.push({ name: route.label, path: route.path });
  return trail;
}
