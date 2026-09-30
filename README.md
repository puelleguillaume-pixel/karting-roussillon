# Karting Roussillon — site vitrine, réservation et espace dirigeant

React 19 · Vite 8 · TypeScript · Tailwind CSS 4 · Framer Motion · React Router · TanStack Query · Supabase (PostgreSQL).

## Démarrer

```bash
npm install
npm run dev          # http://localhost:5173
```

Sans configuration, le site démarre en **mode démo** : la vraie base (mêmes migrations, même seed, plus quelques données d'exemple) tourne **dans le navigateur** grâce à PGlite. Le premier chargement prend quelques secondes, le temps de créer la base. Elle est ensuite conservée dans IndexedDB. Le bandeau bleu en haut du site permet de la réinitialiser.

Pour brancher un vrai projet Supabase, copiez `.env.example` en `.env.local` et renseignez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (voir [supabase/README.md](supabase/README.md) pour installer la base).

| Script | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Images responsive, TypeScript, build, **pré-rendu** des pages publiques (`dist/`) |
| `npm run preview` | Sert le build de production |
| `npm run typecheck` | TypeScript seul |
| `npm run lint` | ESLint |
| `npm test` | Tests unitaires du front (Vitest) |
| `npm run db:test` | Tests métier de la base (PGlite, sans Docker) |
| `npm run db:test:concurrency` | Accès concurrents sur un vrai PostgreSQL 17 embarqué |
| `npm run test:e2e` | Parcours, accessibilité, SEO et hébergement dans Edge (après `npm run build`) |
| `npm run images` | Variantes AVIF / WebP des photos de `public/images` |

Mise en production : voir **[DEPLOIEMENT.md](DEPLOIEMENT.md)**.

## Architecture

```
src/
  app/          routeur, layout racine, navigation (structure des menus)
  pages/        une page par route, chargée à la demande
  components/
    ui/         design system : boutons, sections, pastilles, champs, alertes, Markdown
    layout/     en-tête, menu mobile, pied de page, barre CTA mobile, cookies, bannières
    domain/     cartes karts / packs / pistes, calendrier, chronos, formulaires de demande
  lib/
    data/       accès aux données (Supabase ou démo PGlite), types, erreurs
    queries.ts  requêtes TanStack Query
    catalog.ts  dérivations du catalogue et libellés métier
    format.ts   prix, distances, chronos, dates (heure de Paris)
  styles/       tokens Tailwind (couleurs, typo, motifs damier / vibreur)
supabase/       migrations, seed, données de démo, tests
```

- **Aucune donnée métier en dur dans le front.** Catalogue, tarifs, pistes, horaires, textes des pages (titres, introductions, SEO, sections), coordonnées, bannière d'info, avis et chronos viennent de la base, en un appel (`get_site_bundle`) plus quelques RPC dédiées (calendrier, classement, demandes, bons cadeaux). Le code ne contient que la structure : routes, libellés d'interface, règles de formulaire.
- **Un seul contrat d'accès aux données** (`rpc(nom, arguments)`), avec deux implémentations interchangeables :
  - Supabase : PostgREST via supabase-js ;
  - démo : PGlite dans un Web Worker. Chaque appel y est exécuté sous le rôle `anon`, comme PostgREST, donc la RLS et les droits sont respectés aussi en démo.
- **Erreurs métier** : les codes `KR_…` et leurs messages en français viennent de la base et sont affichés tels quels (`lib/data/errors.ts`).

## Design system

| Élément | Choix |
|---|---|
| Couleurs | Asphalte (neutres légèrement froids), rouge course `#D00010` (fonds de boutons, 5,2:1 avec du blanc), `#FF4D4D` pour le texte rouge sur fond sombre (5,6:1), blanc craie `#F2F2EE` |
| Statuts de piste | Codes couleur des drapeaux : vert (ouvert), jaune (accès restreint), rouge (fermé), bleu (trackday), damier (privatisé), toujours accompagnés d'un libellé |
| Typographie | Barlow Condensed (titres), Barlow (texte), auto-hébergées : aucun appel à Google Fonts |
| Motifs | Damier discret, vibreur rouge/blanc en séparateur, boutons à coin biseauté, tracés de piste en SVG |
| Animations | Apparition au défilement et transitions de page (Framer Motion), désactivées si l'utilisateur demande de réduire les animations |

## Accessibilité

- Lien d'évitement, focus visible partout, contrastes AA.
- Menu mobile en dialogue modal : piège du focus, Échap pour fermer, focus rendu au bouton.
- Formulaires avec libellés associés, erreurs reliées aux champs et focus sur la première erreur.
- Calendrier navigable au clavier, chaque jour annoncé avec son statut.

## Réservation en ligne

| Route | Rôle |
|---|---|
| `/reserver` | Parcours en 4 étapes : activité → nombre de karts, date et créneau (disponibilités en temps réel) → pilotes et coordonnées → récapitulatif, bon cadeau, CGV et décharge |
| `/reserver/evenement/:slug` | Inscription à un trackday (places limitées) |
| `/reservation/:token` | Page du lien reçu par email : QR code d'accès, ajout à l'agenda (.ics), report et annulation selon les règles |
| `/bon-cadeau` | Commande d'un bon (montant ou activité, bénéficiaire, message, envoi à l'acheteur ou au bénéficiaire) et vérification du solde (`?bon=…` depuis le QR code) |
| `/mon-compte` | Historique, réservations à venir et bons cadeaux, avec téléchargement du PDF (connexion par lien magique Supabase) |
| `/demo/emails` | Mode démo uniquement : les emails qui auraient été envoyés, rendus avec les vrais gabarits |

- **Aucun paiement en ligne** : le règlement se fait sur place, et un bon cadeau peut être imputé à la réservation.
- **Bons cadeaux** : commandés en ligne mais réglés à l'accueil ou par téléphone. Le bon n'est activé (et son code révélé) qu'à l'encaissement. En mode démo, un bouton « Simuler le règlement à l'accueil » fait l'activation. Le lien « Réserver avec ce bon » (email, vérificateur de solde) applique le code automatiquement.
- **Blocage du créneau** : il est tenu 10 minutes pendant la saisie, avec un compte à rebours et la possibilité de le rebloquer à expiration.
- **Validation des participants** : le navigateur vérifie l'âge révolu au jour de la session, la taille (ou sa certification) et le représentant légal pour les mineurs. La base revérifie tout. Si elle refuse, l'utilisateur est renvoyé à la bonne étape avec son message.
- **Reprise du parcours** : l'état est conservé en `sessionStorage` (un rechargement ne perd rien) et chaque étape est dans l'URL (le bouton retour du navigateur fonctionne).
- **Emails** : voir [supabase/README.md](supabase/README.md#emails) et [apps-script/README.md](apps-script/README.md).

## Espace dirigeant (`/admin`)

Connexion par lien magique (Supabase Auth) ; le rôle vient de `staff_roles`. En mode démo, deux comptes d'exemple : **Dirigeant** (tous les accès) et **Accueil** (rôle `staff`).

| Rubrique | Contenu | Rôle |
|---|---|---|
| Tableau de bord | Réservations du jour par créneau, arrivées, remplissage, météo (Open-Meteo), alertes (demandes, reports, remboursements), blocages et événements à venir, CA jour / semaine / mois | CA : dirigeant |
| Planning | Vues jour / semaine / mois par piste ; glisser-déposer (ou bouton « Déplacer ») avec email au client ; saisie téléphone / comptoir ; blocage d'un créneau ; blocage en un clic (journée, matin, après-midi) depuis le mois | équipe |
| Check-in | Scan du QR code à la caméra (BarcodeDetector, sinon jsQR) ou référence ; participants, décharges signées au comptoir, arrivée, encaissement | équipe |
| Réservations | Recherche, filtres (statut, période, remboursements à faire), export CSV, fiche complète (règlement, participants, note interne, historique, annulation avec restitution) | équipe ; remboursement : dirigeant |
| Blocages | Création avec aperçu des réservations impactées et une action par réservation (conserver, faire reporter, annuler), récurrence hebdomadaire ou quotidienne, duplication, conversion en événement vendable, suppression (occurrence ou série) | équipe |
| Événements | Trackdays et courses : places, prix, publication, blocage automatique des pistes, participants et export CSV | équipe |
| Demandes | Pipeline à traiter → devis → confirmée → réglée, emails au client, acompte / solde, blocage de planning associé | équipe |
| Bons cadeaux | Commandes à encaisser (activation = code + PDF envoyés), émission au comptoir, mouvements, PDF ; ajustement et désactivation | ajustement : dirigeant |
| Clients | Recherche, fiche éditable, historique, validation chrono (Pack Rotax), export RGPD et anonymisation | RGPD : dirigeant |
| Chronos | Saisie, masquage, import CSV | équipe |
| Contenu du site | Bannière d'information (modèles pluie / fermeture), textes et SEO de chaque page, coordonnées et réseaux, avis clients | équipe |
| Disponibilités | Statuts des droits de piste (calendrier public), horaires d'ouverture, capacités par piste et part réservable en ligne | horaires et capacités : dirigeant |
| Catalogue & tarifs | Produits (prix, TVA, âges, saison, réservable en ligne), karts, pistes | dirigeant |
| Exports comptables | Ventes par période, ventilation TVA, moyens de paiement, bons émis / consommés / encours, CSV compatible Excel | dirigeant |
| Paramètres & équipe | Règles de réservation et d'annulation, demi-journées, bons, emails ; membres de l'équipe ; journal des actions | dirigeant |

Toutes les lectures et écritures passent par des RPC `admin_*` qui vérifient le rôle côté base : masquer une rubrique dans le menu n'est qu'un confort.

## SEO et pré-rendu

- **Pages rendues au build** : `scripts/prerender.mjs` rend chaque page publique avec React ([src/entry-server.tsx](src/entry-server.tsx)) et les vraies données (Supabase en production). Le HTML contient la page complète, le titre, la description, l'URL canonique, Open Graph et les données structurées ; le navigateur reprend ce HTML sans le reconstruire (hydratation). Les données du site sont intégrées à la page : premier affichage sans attendre le réseau.
- **Données structurées** : établissement (`LocalBusiness` + `SportsActivityLocation` : adresse, coordonnées, horaires, réseaux), offres (`Product` / `Offer` pour chaque tarif), trackdays (`Event`), fil d'Ariane. Construites depuis la base ([src/lib/seo/structured-data.ts](src/lib/seo/structured-data.ts)).
- **Mots-clés locaux** dans les titres et descriptions (modifiables dans Contenu du site) : karting Perpignan, Rivesaltes, Claira, Pyrénées-Orientales, anniversaire karting, trackday Roussillon.
- `sitemap.xml` et `robots.txt` générés au build ; une version de démonstration n'est jamais indexable.
- **Redirections 301** des 25 anciennes pages Wix (relevées dans le sitemap Wix) dans [netlify.toml](netlify.toml), avec les en-têtes de sécurité (CSP stricte, HSTS…) et de cache.
- **Images** : `npm run images` (exécuté au build) produit des variantes AVIF et WebP en 480, 960 et 1600 px ; `<MediaImage>` les sert avec `srcset` et chargement différé.

## Tests

| Suite | Contenu | Résultat |
|---|---|---|
| `npm run db:test` | 94 scénarios métier sur la base (RLS, quotas, âges, packs, blocages, annulations, bons, espace dirigeant, recette : annulation météo d'une journée, abandon du parcours) | 94 / 94 |
| `npm run db:test:concurrency` | Vrai PostgreSQL 17, connexions parallèles : 30 clients pour les 3 derniers karts, saisies comptoir simultanées, même pilote sur deux circuits, blocage et réservation concurrents (dans les deux ordres), bon cadeau utilisé en parallèle | 7 / 7 |
| `npm test` | Règles de saisie, formats, horaires, agenda, CSV, données structurées | 21 / 21 |
| `npm run test:e2e` | Réservation complète, email et QR code, check-in à l'accueil, bon cadeau commandé → encaissé → utilisé, audit d’accessibilité WCAG 2.1 AA (axe-core) de 11 écrans publics et 4 écrans de l’espace dirigeant, HTML pré-rendu, 25 redirections Wix, en-têtes, mobile | 32 / 32 |

Pas de paiement en ligne : le scénario « paiement échoué » du cahier des charges correspond ici à l'abandon du parcours (capacité rendue aussitôt, confirmation impossible).

Les tests de bout en bout s'exécutent sur la version de production servie comme sur Netlify ([scripts/serve-dist.mjs](scripts/serve-dist.mjs) : redirections, CSP, compression). La configuration Supabase se vérifie en local sans projet grâce à un faux Supabase ([scripts/mock-supabase.mjs](scripts/mock-supabase.mjs), [scripts/build-prod-local.sh](scripts/build-prod-local.sh)).

## Performances (Lighthouse 13)

Mesures locales de la configuration de production (`node scripts/lighthouse.mjs <url> <pages…> [--desktop]`) :

| | Performance | Accessibilité | Bonnes pratiques | SEO |
|---|---|---|---|---|
| Ordinateur | 99 | 100 | 100 | 100 |
| Mobile (4G lente simulée, processeur ralenti ×4) | 74 à 88 selon la page et le passage | 100 | 100 | 100 |

Sans bridage, le premier affichage a lieu en 0,3 s et le plus grand élément en 0,6 s. Le score mobile est limité par le téléchargement et l'exécution du JavaScript (≈ 130 Ko compressés au chargement : React, routeur, requêtes ; les animations Framer Motion sont chargées ensuite). Pistes si nécessaire : servir les images réelles en AVIF (déjà prévu), mesurer sur l'hébergement Netlify (HTTP/2, compression Brotli pré-calculée), alléger les pages les plus riches.

## Images

Déposez les photos dans `public/images` et renseignez leur chemin en base : voir [public/images/README.md](public/images/README.md). En attendant, le site affiche des visuels de remplacement (tracés de piste, vignettes typographiques des karts).

## Cookies (RGPD)

Rien n'est déposé avant un choix. « Tout refuser » est aussi visible que « Tout accepter ». Le choix est gardé 6 mois et reste modifiable depuis le pied de page. Le suivi des conversions Google Ads (réservation, inscription à un trackday, commande de bon) ne charge la balise `gtag.js` qu'après acceptation des cookies « publicité » (mode Consent v2, [src/lib/analytics.ts](src/lib/analytics.ts)) ; sans identifiant `VITE_GOOGLE_ADS_ID`, rien n'est chargé.

## Avancement

1. ✅ Base de données : schéma, RLS, RPC, seed, tests
2. ✅ Design system + pages vitrines
3. ✅ Moteur de réservation (créneaux, participants, confirmation, report, annulation, trackdays, compte client) + emails
4. ✅ Bons cadeaux (commande sans paiement en ligne, activation à l'encaissement, PDF avec QR code, solde, utilisation en réservation)
5. ✅ Espace dirigeant (tableau de bord, planning, check-in, blocages, demandes, bons, clients, contenus, catalogue, exports)
6. ✅ SEO (pré-rendu, données structurées, sitemap), redirections Wix, sécurité, tests (base, concurrence, unitaires, bout en bout, accessibilité), performances, guide de déploiement
