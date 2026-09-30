# Images du site

Déposez ici les photos fournies (logo, karts, circuits, hero).
Les chemins sont enregistrés en base, relatifs à ce dossier :

| Élément | Où le renseigner | Exemple |
|---|---|---|
| Logo | `site_content.brand` → `data.logo_path` | `logo.svg` |
| Hero accueil | `site_content.page.home` → `data.hero_image` / `hero_video` / `hero_poster` | `hero/circuit.jpg` |
| Kart | `vehicle_types.image_path` | `karts/sodikart-390.jpg` |
| Circuit | `tracks.image_path` | `circuits/circuit-2.jpg` |

Formats recommandés : AVIF ou WebP, 1600 px de large pour le hero, 1200 px pour les cartes.
Sans image, le site affiche des visuels de remplacement (tracés de piste, vignettes typographiques).
