import { useLocation } from 'react-router';
import { assetUrl } from '@/lib/assets';
import { env } from '@/lib/env';
import { useSiteBundle } from '@/lib/queries';
import { breadcrumbTrail } from '@/lib/seo/routes';
import { breadcrumbJsonLd, serializeJsonLd } from '@/lib/seo/structured-data';

interface SeoProps {
  title?: string;
  description?: string;
  /** Page à ne pas indexer (compte client, 404…) */
  noIndex?: boolean;
  /** Données structurées schema.org propres à la page */
  jsonLd?: Array<Record<string, unknown> | null | undefined>;
  /** Image de partage (sinon : visuel de l'accueil ou logo) */
  image?: string | null;
}

const DEFAULT_TITLE = 'Karting Roussillon';

// React 19 place <title>, <meta> et <link> dans <head> automatiquement. Les mêmes
// balises sont pré-rendues au build (scripts/prerender.mjs) : React les reprend
// lors de l'hydratation ; main.tsx les retire pour les pages non pré-rendues.
export function Seo({ title, description, noIndex, jsonLd = [], image }: SeoProps) {
  const { pathname } = useLocation();
  const bundle = useSiteBundle().data;
  const fullTitle = title?.trim() || DEFAULT_TITLE;
  const canonical = `${env.siteUrl}${pathname === '/' ? '/' : pathname}`;
  const home = bundle?.content['page.home']?.data as { hero_image?: string | null; hero_poster?: string | null } | undefined;
  const brand = bundle?.content['brand']?.data as { logo_path?: string | null } | undefined;
  const shareImage = assetUrl(image ?? home?.hero_image ?? home?.hero_poster ?? brand?.logo_path ?? null);
  const blocks = noIndex ? [] : [...jsonLd, breadcrumbJsonLd(breadcrumbTrail(pathname), env.siteUrl)].filter(Boolean);

  return (
    <>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {noIndex && <meta name="robots" content="noindex, follow" />}
      {!noIndex && <link rel="canonical" href={canonical} />}
      <meta property="og:type" content="website" />
      <meta property="og:locale" content="fr_FR" />
      <meta property="og:site_name" content={DEFAULT_TITLE} />
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:url" content={canonical} />
      {shareImage && <meta property="og:image" content={shareImage.startsWith('http') ? shareImage : `${env.siteUrl}${shareImage}`} />}
      <meta name="twitter:card" content={shareImage ? 'summary_large_image' : 'summary'} />
      {blocks.map((block, index) => (
        <script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(block) }} />
      ))}
    </>
  );
}
