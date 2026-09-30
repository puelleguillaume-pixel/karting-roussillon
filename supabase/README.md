# Base de données — Karting Roussillon (Supabase)

## Contenu

| Fichier | Rôle |
|---|---|
| `migrations/20260926100000_foundation.sql` | Schéma interne `app`, types énumérés, helpers (fuseau Paris, âge révolu, codes aléatoires, erreurs métier) |
| `migrations/20260926100100_admin_and_catalogue.sql` | Rôles `owner` / `staff`, paramètres, `audit_log`, pistes, véhicules, capacités modèles, produits, packs |
| `migrations/20260926100200_scheduling.sql` | Horaires, créneaux matérialisés, capacités par créneau, blocages, calendrier droits de piste, événements, expansion RRULE |
| `migrations/20260926100300_customers_bookings.sql` | Clients, demandes, décharges, réservations, sessions, participants, holds, bons cadeaux, paiements, file d'emails |
| `migrations/20260926100400_content.sql` | Contenu éditorial, chronos, avis |
| `migrations/20260926100500_booking_engine.sql` | Moteur : capacité restante, holds, contrôles participants, bons, déplacement, annulation |
| `migrations/20260926100600_public_rpc.sql` | RPC du site public |
| `migrations/20260926100700_planning_and_blocks.sql` | Génération des créneaux, occurrences et conflits de blocages |
| `migrations/20260926100800_admin_rpc.sql` | RPC de l'espace dirigeant |
| `migrations/20260926100900_rls_and_grants.sql` | RLS et privilèges |
| `migrations/20260926101000_cron.sql` | Tâches planifiées (pg_cron) |
| `migrations/20260927100000_site_read_api.sql` | API de lecture du site (`get_site_bundle`, `get_leaderboard`), libellé court des karts |
| `migrations/20260928100000_booking_front_api.sql` | Parcours de réservation et compte client (décharge, fiche événement, profil, bons), file d'emails pour l'Edge Function, planification de l'envoi |
| `migrations/20260929100000_gift_card_orders.sql` | Commande de bons cadeaux en ligne (sans paiement), activation à l'encaissement, emails acheteur et bénéficiaire, bon imputable sur un trackday |
| `migrations/20260930100000_admin_read_api.sql` | Lectures de l'espace dirigeant : listes paginées (réservations, clients, bons, demandes, blocages, événements), fiches détaillées, planning mensuel, créneaux comptoir, catalogue complet, paramètres, équipe, journal |
| `functions/send-emails/` | Edge Function d'envoi des emails (Deno) |
| `functions/_shared/email/render.ts` | Gabarits des 19 emails, partagés avec l'aperçu du mode démo |
| `functions/_shared/giftcard/pdf.ts` | PDF du bon cadeau (A5 paysage, QR code), partagé avec le téléchargement côté site |
| `seed.sql` | Catalogue initial (tarifs du site actuel), paramètres, horaires, textes de toutes les pages |
| `seed_demo.sql` | Données d'exemple (comptes « dirigeant » et « accueil », clients, réservations, demandes, bons, trackdays, statuts de piste, chronos, emplacements d'avis) : **mode démo uniquement, jamais en production** |
| `tests/` | Banc de test PGlite (`npm run db:test`) |

## Déploiement

```bash
npm i -g supabase
supabase link --project-ref <ref-du-projet>
supabase db push                 # applique les migrations
psql "$SUPABASE_DB_URL" -f supabase/seed.sql   # une seule fois, sur une base vide
```

Ensuite, dans le SQL editor :

1. Créer le compte du dirigeant (Auth → Users → Invite).
2. Lui donner le rôle `owner` :
   ```sql
   insert into public.staff_roles (user_id, role, display_name)
   values ('<uuid auth.users>', 'owner', 'Prénom Nom');
   ```
   Les comptes suivants se gèrent depuis l'admin avec `admin_set_staff_role`.
3. Renseigner l'email de notification : `select public.admin_set_setting('notify_email', '"contact@…"')`, à exécuter connecté en tant qu'owner, ou directement dans la table `settings`.

pg_cron est activé par la migration 11 s'il est disponible. Sur Supabase, activez d'abord l'extension dans *Database → Extensions* si la migration signale qu'elle est absente.

## Tests

```bash
npm install
npm run db:test
```

Le banc de test rejoue les migrations et le seed dans PGlite (Postgres 17 en WASM, sans Docker), puis exécute 94 scénarios métier. Ils couvrent la RLS, les quotas, l'âge et la taille, la validation chrono, le chevauchement de pilotes, les packs, les blocages et leurs conflits, les récurrences (y compris au changement d'heure), l'annulation et le report, les bons cadeaux, les rôles, le RGPD et les exports, ainsi que des scénarios de recette (annulation météo d'une journée, abandon du parcours).

`npm run db:test:concurrency` rejoue les mêmes migrations sur un **vrai PostgreSQL 17** (paquet `embedded-postgres`, sans installation) et vérifie les verrous avec des connexions parallèles : pas de surréservation du dernier kart, un pilote jamais confirmé sur deux sessions simultanées, blocage et réservation concurrents arbitrés dans les deux ordres, bon cadeau jamais consommé au-delà de son solde.

**Limite :** PGlite est mono-connexion. Le verrouillage concurrent (`FOR UPDATE`) sera testé en phase 6 contre un vrai Postgres Supabase.

## Principes

- **Montants** en centimes (`integer`). **Dates** en `timestamptz`. Tous les calculs de jour et d'heure passent par le fuseau `Europe/Paris` (`app.tz()`, `app.local_ts()`, `app.local_date()`).
- **Aucune écriture directe** depuis le front. La RLS n'accorde que des `SELECT`, et toute écriture passe par une RPC `SECURITY DEFINER` avec `search_path = ''`. Chaque RPC admin commence par `app.require_staff()` ou `app.require_owner()` et écrit dans `audit_log`.
- **Anti-surréservation** : toute opération qui consomme ou libère de la capacité verrouille les lignes `slots` concernées (`FOR UPDATE`, ordre par `id`), puis recalcule la capacité dans la même transaction. Les pilotes sont sérialisés par verrou consultatif (`pg_advisory_xact_lock`) pour empêcher deux sessions simultanées.
- **Quota walk-in** : en ligne, restant = `min(quota en ligne − conso en ligne, capacité − conso totale)`. Au comptoir, restant = `capacité − conso totale`.
- **Groupes de roulage** (`vehicle_types.run_group`) : sur une piste où `enforce_run_groups = true`, une session ouverte par un groupe (ex. `loisir`) ferme les autres groupes (ex. `performance`) sur ce créneau.
- **Blocages** : ils sont vérifiés à la lecture (`get_availability`) et revérifiés dans la transaction de réservation. Une récurrence est matérialisée en occurrences qui partagent un `series_id`. La suppression d'un blocage rouvre les créneaux immédiatement.
- **Paiement** : pas de paiement en ligne (paramètre `online_payment_enabled = false`). Le personnel enregistre les règlements avec `admin_record_payment`. Les colonnes Stripe sont prêtes pour une activation ultérieure.

## Erreurs métier

Les RPC lèvent `SQLSTATE P0001` avec `message` = un code stable et `hint` = un texte en français affichable. Le front mappe sur `message`.

| Code | Sens |
|---|---|
| `KR_FORBIDDEN` | Rôle insuffisant |
| `KR_PRODUCT_NOT_BOOKABLE`, `KR_PRODUCT_OUT_OF_SEASON` | Produit non réservable (en ligne ou à cette date) |
| `KR_SLOT_FULL`, `KR_SLOT_BLOCKED`, `KR_SLOT_UNAVAILABLE`, `KR_SLOT_TOO_SOON`, `KR_SLOT_TOO_FAR` | Créneau indisponible |
| `KR_SLOT_COUNT`, `KR_PACK_SAME_DAY`, `KR_PACK_OVERLAP` | Sélection de créneaux invalide pour un pack |
| `KR_HOLD_NOT_FOUND`, `KR_HOLD_EXPIRED` | Sélection expirée : relancer l'étape 2 |
| `KR_AGE_TOO_LOW`, `KR_HEIGHT_TOO_LOW`, `KR_HEIGHT_REQUIRED`, `KR_PASSENGER_AGE_TOO_LOW` | Conditions d'accès (`detail` = nom du participant) |
| `KR_CHRONO_VALIDATION_REQUIRED` | Pack Rotax sans validation chrono |
| `KR_GUARDIAN_REQUIRED` | Mineur sans représentant légal |
| `KR_PILOT_OVERLAP`, `KR_DUPLICATE_PARTICIPANT` | Pilote déjà engagé au même moment, ou saisi deux fois |
| `KR_TERMS_REQUIRED`, `KR_WAIVER_REQUIRED` | CGV ou décharge non acceptées |
| `KR_CANCELLATION_TOO_LATE`, `KR_RESCHEDULE_TOO_LATE`, `KR_BOOKING_NOT_CANCELLABLE` | Politique d'annulation |
| `KR_GIFT_CARD_INVALID`, `KR_GIFT_CARD_EXPIRED`, `KR_GIFT_CARD_EMPTY`, `KR_GIFT_CARD_WRONG_PRODUCT` | Bons cadeaux |
| `KR_BLOCK_HAS_CONFLICTS` | Réservations sur la plage : appeler `admin_preview_block` et choisir une action |
| `KR_EVENT_FULL`, `KR_EVENT_NOT_BOOKABLE` | Trackdays |
| `KR_RATE_LIMITED` | Plus de 5 demandes par heure et par email |

## RPC publiques (anon)

| RPC | Usage |
|---|---|
| `get_site_bundle()` | Tout ce qui est commun au site en un appel : paramètres publics, contenus publiés, pistes, karts, produits (avec pistes et détail des packs), horaires, avis publiés |
| `get_leaderboard(per_group)` | Meilleur tour de chaque pilote, par piste et catégorie |
| `get_current_waiver()` | Texte de la décharge en vigueur |
| `get_event_public(slug)` | Fiche d'un événement publié, avec places restantes |
| `get_available_days(product, from, to, karts)` | Calendrier : jours avec des créneaux libres (62 jours max) |
| `get_availability(product, day, karts)` | Créneaux d'un jour avec le nombre de karts restants |
| `create_booking_hold(product, slot_ids[], karts)` | Bloque la capacité 10 min, renvoie `hold_token` |
| `release_booking_hold(hold_token)` | Abandon du parcours |
| `confirm_booking(hold_token, customer, participants, accept_terms, accept_waiver, note, gift_code)` | Crée la réservation (règlement sur place) |
| `get_booking_by_token` / `cancel_booking_by_token` / `reschedule_booking_by_token` | Gestion par le lien reçu par email, sans compte |
| `get_event_availability`, `book_event(…, gift_card_code)` | Places de trackday, réglables en partie par un bon « montant » |
| `submit_request(type, contact, details)` | Anniversaire, EVG/EVJF, team building, école, Alpine |
| `check_gift_card(code)` | Solde et validité d'un bon |
| `order_gift_card(p)` | Commande d'un bon (montant libre borné ou activité) : créé en `pending_payment` avec une référence `BC-XXXXXX`, sans code renvoyé. Limité à 5 commandes par heure et par email |
| `get_public_calendar(from, to)` | Événements publiés, blocages publics, statuts des droits de piste |
| `my_bookings()`, `claim_customer_profile()`, `my_profile()`, `my_gift_cards()` | Client connecté (Supabase Auth, lien magique) |

Format des participants : `[{first_name, last_name, birth_date, role: "driver"|"passenger", height_cm?, height_certified?, guardian_name?, extra?}]`.

## RPC admin (`admin_*`)

- **Profil et paramètres** : `admin_me`, `admin_set_setting`\*, `admin_set_staff_role`\*
- **Catalogue**\* : `admin_upsert_track`, `admin_upsert_vehicle_type`, `admin_upsert_product`, `admin_set_track_capacity`
- **Disponibilités** : `admin_upsert_opening_hours`\*, `admin_delete_opening_hours`\*, `admin_generate_slots`, `admin_set_slot_capacity`, `admin_set_slot_active`, `admin_set_track_access_status`, `admin_clear_track_access_status`
- **Blocages** : `admin_preview_block`, `admin_create_block`, `admin_update_block`, `admin_delete_block`, `admin_duplicate_block`, `admin_convert_block_to_event`
- **Événements** : `admin_upsert_event`, `admin_event_participants`
- **Réservations** : `admin_create_booking`, `admin_move_booking`, `admin_cancel_booking`, `admin_set_booking_status`, `admin_update_booking_note`, `admin_lookup_booking`, `admin_check_in`, `admin_sign_waiver`, `admin_upsert_participant`, `admin_record_payment` (remboursement réservé à l'owner)
- **Demandes** : `admin_update_request`, qui peut créer le blocage de planning associé
- **Bons cadeaux** : `admin_issue_gift_card`, `admin_activate_gift_card`, `admin_set_gift_card_status`\*, `admin_adjust_gift_card`\*
- **Clients** : `admin_update_customer`, `admin_set_chrono_validation`, `admin_export_customer`\*, `admin_anonymize_customer`\*
- **Contenu** : `admin_upsert_lap_record`, `admin_import_lap_records`, `admin_delete_lap_record`, `admin_upsert_site_content`, `admin_upsert_review`, `admin_delete_review`
- **Pilotage** : `admin_dashboard` (CA réservé à l'owner), `admin_planning`, `admin_sales_export`\*, `admin_gift_card_summary`\*
- **Lectures du back-office** : `admin_list_bookings`, `admin_get_booking`, `admin_lookup_booking`, `admin_availability`, `admin_planning_summary`, `admin_list_requests`, `admin_list_gift_cards`, `admin_get_gift_card`, `admin_list_customers`, `admin_get_customer`, `admin_create_customer`, `admin_list_events`, `admin_list_blocks`, `admin_track_access`, `admin_catalog`, `admin_list_content`, `admin_list_reviews`, `admin_list_lap_records`, `admin_settings`\*, `admin_list_staff`\*, `admin_add_staff`\*, `admin_list_audit`\*

\* réservé à l'owner.

`admin_create_block` : `p_conflict_actions = {"default": "keep"|"reschedule"|"cancel", "overrides": {"<booking_id>": "cancel"}}`.
- `reschedule` : la réservation passe en `reschedule_required`, et le client reçoit un lien pour reporter ou annuler avec restitution intégrale.
- `cancel` : annulation immédiate avec restitution intégrale.

## Valeurs provisoires du seed

Ces valeurs sont modifiables dans l'admin et doivent être confirmées par le client :

- Flotte (`vehicle_types.fleet_count`) et répartition par piste (`track_vehicle_capacities`)
- Prix de l'Alpine A110S et des formules anniversaire (`price_cents` à `null`, affichés « sur demande »)
- Texte de la décharge (`waiver_versions` v1)
- `notify_email`
- Coordonnées GPS du circuit (`site_content.contact.data.geo`, approchées : météo du tableau de bord)
- Bons cadeaux : montant minimum 10 €, maximum 500 €, montants proposés 20/30/50/100 € (`gift_card_min_cents`, `gift_card_max_cents`, `gift_card_presets`)
- Pages légales

## Emails

Chaque action métier met un email en file (`public.email_outbox`, via `app.enqueue_email`) dans la même transaction. L'envoi est ensuite asynchrone :

1. Chaque minute, `pg_cron` appelle l'Edge Function `send-emails` avec `pg_net`, uniquement s'il y a des emails en attente.
2. La fonction réserve un lot (`email_claim_batch`, verrouillage `SKIP LOCKED`), rend chaque gabarit et joint le QR code en image intégrée (`cid:qr`) et, pour un bon cadeau activé, le bon en PDF. Elle transmet l'email à la Web App Apps Script (voir [apps-script/README.md](../apps-script/README.md)), puis enregistre le résultat (`email_mark_result`).
3. En cas d'échec, l'email est retenté 5 fois (2, 4, 8, 16 min) puis marqué `failed`. Un envoi resté bloqué plus de 10 minutes est remis en file.

### Bons cadeaux

1. Le client commande sur `/bon-cadeau` (`order_gift_card`) : le bon est créé en attente de règlement, sans code visible. Le client et le dirigeant reçoivent un email avec la référence de commande.
2. Le client règle à l'accueil ou par téléphone. L'équipe active le bon (`admin_activate_gift_card`, espace dirigeant en phase 5) : le paiement est enregistré et le code est généré.
3. L'acheteur reçoit le bon en PDF (et le bénéficiaire aussi, si l'envoi direct a été choisi). Le QR code du PDF ouvre `/bon-cadeau?bon=…`, qui affiche le solde. Le lien « Réserver avec ce bon » préremplit le code à l'étape Confirmation.

### Mise en service

```bash
# 1. Secrets de la fonction
supabase secrets set   EMAIL_DISPATCH_SECRET=<valeur aléatoire>   APPS_SCRIPT_URL=https://script.google.com/macros/s/…/exec   APPS_SCRIPT_SECRET=<SHARED_SECRET de l'Apps Script>   SITE_URL=https://www.kartingroussillon.com   EMAIL_REPLY_TO=contact@…            # facultatif

# 2. Déploiement
supabase functions deploy send-emails
```

```sql
-- 3. Secrets lus par la tâche planifiée (SQL editor, une fois)
select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'kr_functions_url');
select vault.create_secret('<clé service_role>', 'kr_service_role_key');
select vault.create_secret('<même valeur que EMAIL_DISPATCH_SECRET>', 'kr_email_dispatch_secret');

-- 4. Email du dirigeant (notifications de réservations et de demandes)
update public.settings set value = '"contact@…"' where key = 'notify_email';
```

Pour tester sans attendre la tâche planifiée :

```bash
curl -X POST https://<ref>.supabase.co/functions/v1/send-emails   -H "Authorization: Bearer <clé service_role>" -H "x-dispatch-secret: <EMAIL_DISPATCH_SECRET>"
```

La fonction répond `{ "claimed": n, "sent": n, "failed": n }`. Les erreurs sont visibles dans `email_outbox.last_error`.

Vérification locale de la fonction : `npx deno check --config supabase/functions/send-emails/deno.json supabase/functions/send-emails/index.ts`.
