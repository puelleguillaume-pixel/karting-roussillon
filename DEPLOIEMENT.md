# Mise en production — Karting Roussillon

Ce guide passe du mode démonstration (base dans le navigateur) au site réel :
Supabase (base, comptes, envoi des emails), Google Apps Script (Gmail) et Netlify (hébergement).
Compter une demi-journée. Rien n'est à modifier dans le code : tout passe par la configuration.

## 0. Comptes nécessaires

| Service | Usage | Remarque |
|---|---|---|
| Supabase | Base PostgreSQL, connexion par lien magique, envoi planifié des emails | Région **UE (Paris ou Francfort)** pour le RGPD. Offre Pro recommandée (sauvegardes quotidiennes, pas de mise en veille). |
| Google (compte du circuit) | Apps Script pour envoyer les emails depuis Gmail, Search Console, Google Ads | Le compte Gmail qui envoie est celui qui déploie l'Apps Script. |
| Netlify | Hébergement du site, redirections des anciennes URL Wix | Offre gratuite suffisante au départ. |
| Registrar du domaine | DNS de `kartingroussillon.com` | Aujourd'hui géré par Wix (à transférer ou à pointer). |

## 1. Base de données (Supabase)

```bash
npm install -g supabase            # ou : npx supabase …
supabase login
supabase link --project-ref <référence du projet>
supabase db push                   # applique supabase/migrations/*
psql "<chaîne de connexion>" -f supabase/seed.sql
```

- **Ne jamais appliquer `supabase/seed_demo.sql` en production** (données d'exemple).
- Les extensions `pg_cron` et `pg_net` sont activées par les migrations (tâches planifiées : purge des blocages, rappels J-1, expiration des bons, envoi des emails).
- Vérifier : `npm run db:test` (banc local) et `npm run db:test:concurrency` (vrai PostgreSQL, accès concurrents) passent avant chaque mise à jour du schéma.

### Authentification (Supabase → Authentication)

1. **URL Configuration** : Site URL `https://www.kartingroussillon.com` ; Redirect URLs : `https://www.kartingroussillon.com/mon-compte`, `https://www.kartingroussillon.com/admin`.
2. **SMTP personnalisé** (Settings → Auth → SMTP) : l'expéditeur par défaut de Supabase est limité à quelques emails par heure ; renseigner le SMTP de Gmail (mot de passe d'application) ou d'un service d'envoi pour les liens de connexion.
3. **Modèle d'email « Magic Link »** : le traduire en français (objet : « Votre lien de connexion — Karting Roussillon »).

### Compte du dirigeant

1. Ouvrir `https://www.kartingroussillon.com/admin` et demander un lien de connexion avec l'email du dirigeant (le compte est créé).
2. Dans l'éditeur SQL de Supabase, une seule fois :

```sql
insert into public.staff_roles (user_id, role, display_name)
select id, 'owner', 'Prénom Nom' from auth.users where email = 'dirigeant@…';
```

Les autres membres de l'équipe s'ajoutent ensuite depuis **Paramètres & équipe** (ils demandent d'abord un lien sur `/admin`).

## 2. Emails (Apps Script + fonction Supabase)

1. Apps Script : suivre [apps-script/README.md](apps-script/README.md) (déploiement en application Web, secret partagé).
2. Fonction d'envoi et secrets : suivre la section « Mise en service » de [supabase/README.md](supabase/README.md#emails) (`supabase secrets set …`, `supabase functions deploy send-emails`, trois secrets Vault).
3. Dans l'espace dirigeant, **Paramètres** → email de notification du dirigeant.
4. Test : faire une réservation, vérifier la réception de la confirmation (avec QR code) et de la notification.

## 3. Hébergement (Netlify)

1. Nouveau site depuis le dépôt Git ; la configuration est lue dans [`netlify.toml`](netlify.toml) (build, redirections, en-têtes de sécurité).
2. **Variables d'environnement** (Site configuration → Environment variables) :

| Variable | Valeur |
|---|---|
| `VITE_SITE_URL` | `https://www.kartingroussillon.com` |
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → clé `anon` (publique) |
| `VITE_GOOGLE_ADS_ID` | `AW-…` (facultatif, voir §5) |
| `VITE_GOOGLE_ADS_BOOKING_LABEL`, `VITE_GOOGLE_ADS_GIFT_LABEL` | libellés des conversions (facultatif) |

Ne jamais mettre la clé `service_role` dans Netlify : elle ne doit exister que dans Supabase.

3. Le build (`npm run build`) optimise les images, compile le site, puis **pré-rend chaque page publique** avec les données de Supabase (HTML complet, données structurées, `sitemap.xml`, `robots.txt`). Si Supabase est injoignable pendant le build, celui-ci échoue et le site en ligne reste inchangé.
4. **Rafraîchissement quotidien** : les pages pré-rendues se mettent à jour à chaque build (les prix affichés, eux, sont toujours relus en direct). Créer un *Build hook* Netlify puis, dans Supabase :

```sql
select cron.schedule('kr_rebuild_site', '15 4 * * *',
  $$select net.http_post(url := '<URL du build hook Netlify>', body := '{}'::jsonb)$$);
```

## 4. Bascule du domaine (depuis Wix)

1. Mettre le site en ligne sur l'adresse Netlify (`…netlify.app`) et le recetter (§6).
2. Dans Netlify → Domain management : ajouter `www.kartingroussillon.com` et `kartingroussillon.com`, suivre les instructions DNS (enregistrements chez le registrar ; si le domaine est chez Wix, le transférer ou modifier ses DNS depuis Wix).
3. Décommenter dans `netlify.toml` la redirection du domaine sans « www ».
4. Les **25 anciennes URL Wix** (relevées dans le sitemap Wix) sont redirigées en 301 vers les nouvelles pages : le référencement acquis est conservé. Vérification automatique : `npm run test:e2e`.
5. Résilier l'abonnement Wix seulement après vérification des redirections dans la Search Console (quelques semaines).

## 5. Référencement et mesure

- **Google Search Console** : ajouter le domaine, soumettre `https://www.kartingroussillon.com/sitemap.xml`, surveiller « Pages » et « Améliorations » (données structurées : établissement local, produits, événements, fil d'Ariane).
- **Fiche Google Business Profile** : vérifier que l'adresse, le téléphone et les horaires sont identiques à ceux du site (Contenu du site → Coordonnées ; Disponibilités → Horaires).
- **Google Ads** : créer deux conversions (réservation, commande de bon cadeau), renseigner l'identifiant et les libellés dans Netlify. La balise ne se charge **que si le visiteur accepte les cookies « publicité »** (mode Consent v2) ; sans consentement, rien n'est envoyé.

## 6. Recette avant ouverture

- [ ] `npm run build` puis `npm run test:e2e` (parcours, accessibilité, redirections, en-têtes) : tout est vert.
- [ ] Réservation réelle sur le site, email reçu avec QR code, check-in depuis `/admin/check-in` sur téléphone (caméra).
- [ ] Commande de bon cadeau, activation à l'encaissement, PDF reçu.
- [ ] Blocage d'une plage déjà réservée depuis le planning : choix des actions, emails aux clients.
- [ ] Bannière d'information publiée puis retirée.
- [ ] Lighthouse (onglet navigation privée) sur l'accueil et « Karts & tarifs ».

## Valeurs à confirmer par le client

Signalées « à confirmer » dans l'espace dirigeant (Paramètres, Catalogue, Contenu) : nombre de karts par catégorie et répartition par piste, prix de l'Alpine A110S et des formules anniversaire, texte de la décharge, email de notification, textes légaux (mentions, CGV, confidentialité), coordonnées GPS du circuit, montants des bons cadeaux (min 10 €, max 500 €), photos (dossier `public/images`).
