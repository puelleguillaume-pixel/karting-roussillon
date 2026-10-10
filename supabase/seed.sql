-- =============================================================================
-- Karting de Torreilles — Seed initial (démo)
-- Tarifs repris du site actuel (kartingtorreilles.com/karts-tarifs).
-- Tout est modifiable dans /admin.
-- Valeurs marquées [PROVISOIRE] : à confirmer par le client (flotte, formules
-- de groupe, horaires hors saison, texte de décharge, email de notification).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Paramètres
-- -----------------------------------------------------------------------------
insert into public.settings (key, value, description, is_public) values
  ('hold_minutes',                 '10',       'Durée de blocage d''un créneau pendant la réservation (min)', true),
  ('booking_min_lead_minutes',     '30',       'Délai minimal avant départ pour réserver en ligne (min)', true),
  ('booking_horizon_days',         '90',       'Réservation en ligne possible jusqu''à N jours', true),
  ('max_karts_per_booking',        '10',       'Nombre max de karts / pilotes par réservation en ligne', true),
  ('default_online_quota_pct',     '50',       'Part de la flotte réservable en ligne par créneau (%)', false),
  ('slot_generation_horizon_days', '120',      'Créneaux générés automatiquement sur N jours', false),
  ('cancel_full_refund_hours',     '48',       'Annulation ≥ N h avant : remboursement intégral ou report', true),
  ('cancel_credit_hours',          '24',       'Annulation ≥ N h avant : avoir (bon cadeau)', true),
  ('block_warning_hours',          '72',       'Blocage d''une plage réservée à moins de N h : alerte renforcée', false),
  ('morning_start',                '"10:00"',  'Début de la demi-journée du matin', false),
  ('morning_end',                  '"14:00"',  'Fin de la demi-journée du matin', false),
  ('afternoon_start',              '"14:00"',  'Début de la demi-journée de l''après-midi', false),
  ('afternoon_end',                '"23:00"',  'Fin de la demi-journée de l''après-midi', false),
  ('gift_card_validity_months',    '12',       'Validité des bons cadeaux (mois)', true),
  ('reminder_local_hour',          '10',       'Heure locale d''envoi des rappels J-1', false),
  ('notify_email',                 '""',       '[PROVISOIRE] Email du dirigeant pour les notifications', false),
  ('online_payment_enabled',       'false',    'Paiement en ligne (Stripe) — désactivé : règlement sur place', true);

-- -----------------------------------------------------------------------------
-- Pistes
-- -----------------------------------------------------------------------------
insert into public.tracks (slug, name, short_name, length_m, usage, min_age, description, requires_booking,
                           online_booking_enabled, slot_interval_min, session_min, display_on_circuits, sort_order) values
  ('grande-piste', 'Grande piste', 'Grande piste', 492, 'leisure', 7,
   'Le circuit principal de 492 m, homologué et équipé du chronométrage : karts 120 cc dès 7 ans, 270 cc dès 14 ans et biplace.',
   false, true, 15, 10, true, 1),
  ('petite-piste', 'Petite piste enfants', 'Petite piste', 200, 'baby', 3,
   'Une piste de 200 m réservée aux enfants de 3 à 7 ans, en kart électrique : idéale pour les premiers tours de roue.',
   false, false, 5, 5, true, 2);

-- -----------------------------------------------------------------------------
-- Flotte  [PROVISOIRE : fleet_count et capacités par piste à confirmer]
-- run_group : catégories autorisées à rouler ensemble sur une même session
-- -----------------------------------------------------------------------------
insert into public.vehicle_types (slug, name, short_label, engine, description, min_age, min_height_cm, seats,
                                  passenger_min_age, passenger_min_height_cm, is_adapted, run_group, fleet_count, sort_order) values
  ('kart-270',        'Kart Sodi RT10 270 cc', '270',   '270 cc',            'Le kart adulte de la grande piste, dès 14 ans.',                       14, null, 1, null, null, false, 'adulte', 12, 1),
  ('biplace',         'Kart biplace',          '2 pl.', '2 places',          'Pilotez avec un passager à vos côtés : parfait pour une initiation.',   16, null, 2, 5,    null, false, 'adulte', 2,  2),
  ('kart-120',        'Kart Sodi 120 cc',      '120',   '120 cc',            'Le kart junior de la grande piste, de 7 à 14 ans.',                     7, null, 1, null, null, false, 'junior', 8,  3),
  ('kart-electrique', 'Kart électrique enfant','Élec.', 'Électrique',        'Premiers tours de roue sur la petite piste, de 3 à 7 ans.',             3, null, 1, null, null, false, 'enfant', 6,  4);

insert into public.track_vehicle_capacities (track_id, vehicle_type_id, capacity)
select t.id, v.id, c.capacity
from (values
  ('grande-piste', 'kart-270',        10),
  ('grande-piste', 'biplace',          2),
  ('grande-piste', 'kart-120',         8),
  ('petite-piste', 'kart-electrique',  6)
) as c(track, vehicle, capacity)
join public.tracks t on t.slug = c.track
join public.vehicle_types v on v.slug = c.vehicle;

-- -----------------------------------------------------------------------------
-- Produits : sessions (tarifs de kartingtorreilles.com/karts-tarifs)
-- -----------------------------------------------------------------------------
insert into public.products (slug, kind, name, short_description, vehicle_type_id, price_cents, duration_min,
                             min_age, min_height_cm, age_label, is_online_bookable, is_featured, sort_order)
select p.slug, 'session', p.name, p.short_description, v.id, p.price_cents, p.duration_min,
       p.min_age, p.min_height_cm::integer, p.age_label, p.online, p.featured, p.sort_order
from (values
  ('session-kart-270',        'Kart Sodi RT10 270 cc',  'Session de 10 min sur la grande piste de 492 m.', 'kart-270',        1900, 10, 14, null, 'Dès 14 ans',                              true,  true, 1),
  ('session-biplace',         'Kart biplace',           'Session de 10 min à deux sur la grande piste.',   'biplace',         2400, 10, 16, null, 'Conducteur 16 ans, passager dès 5 ans',   true,  true, 2),
  ('session-kart-120',        'Kart Sodi 120 cc',       'Session de 10 min sur la grande piste.',          'kart-120',        1500, 10,  7, null, 'De 7 à 14 ans',                           true,  true, 3),
  ('session-kart-electrique', 'Kart électrique enfant', 'Session de 5 min sur la petite piste.',           'kart-electrique',  500,  5,  3, null, 'De 3 à 7 ans',                            false, true, 4)
) as p(slug, name, short_description, vehicle, price_cents, duration_min, min_age, min_height_cm, age_label, online, featured, sort_order)
join public.vehicle_types v on v.slug = p.vehicle;

-- Pistes par produit (celles où le véhicule roule)
insert into public.product_tracks (product_id, track_id)
select p.id, t.id
from public.products p
join (values
  ('kart-270',        'grande-piste'),
  ('biplace',         'grande-piste'),
  ('kart-120',        'grande-piste'),
  ('kart-electrique', 'petite-piste')
) as m(vehicle, track) on true
join public.vehicle_types v on v.slug = m.vehicle and v.id = p.vehicle_type_id
join public.tracks t on t.slug = m.track;

-- -----------------------------------------------------------------------------
-- Formules sur demande  [PROVISOIRE : contenu des formules à confirmer]
-- -----------------------------------------------------------------------------
insert into public.products (slug, kind, name, short_description, description, request_type, price_cents, price_label,
                             duration_min, age_label, metadata, is_featured, sort_order) values
  ('anniversaire', 'on_request', 'Anniversaire karting',
   'Fêtez un anniversaire sur la piste, entre copains.', '', 'birthday', null, 'Sur demande',
   null, '', '{}', true, 30),
  ('evg-evjf', 'on_request', 'EVG / EVJF',
   'Enterrement de vie de garçon ou de jeune fille sur la piste.', '', 'bachelor_party', null, 'Sur demande',
   null, '', '{}', false, 32),
  ('groupes-entreprises', 'on_request', 'Groupes & entreprises',
   'Challenge karting pour les groupes, les CE et les entreprises.', '', 'team_building', null, 'Sur devis',
   null, '', '{}', false, 33);

-- -----------------------------------------------------------------------------
-- Horaires : 7 j / 7, 10 h – 23 h non-stop (horaires d'été publiés)
-- -----------------------------------------------------------------------------
insert into public.opening_hours (track_id, weekday, opens_at, closes_at, label)
select null, d, '10:00', '23:00', 'Horaires d''été' from generate_series(1, 7) d;

-- -----------------------------------------------------------------------------
-- Décharge de responsabilité  [PROVISOIRE : texte officiel à fournir]
-- -----------------------------------------------------------------------------
insert into public.waiver_versions (version, title, body, is_current) values
  (1, 'Décharge de responsabilité — version provisoire',
   'TEXTE PROVISOIRE À REMPLACER PAR LA DÉCHARGE OFFICIELLE DU CIRCUIT.' || chr(10) || chr(10) ||
   'Je reconnais avoir pris connaissance du règlement intérieur et des consignes de sécurité du circuit, '
   'et m''engage à les respecter. Pour un participant mineur, la décharge est acceptée par son représentant légal.',
   true);

-- -----------------------------------------------------------------------------
-- Contenu éditorial de base
-- -----------------------------------------------------------------------------
insert into public.site_content (key, title, body, data, is_published) values
  -- geo : coordonnées approchées (Torreilles) [PROVISOIRE : à préciser],
  -- utilisées pour la météo du tableau de bord et les données structurées
  ('contact', 'Karting de Torreilles', '',
   '{"address": "Chemin Mas dels Capellans", "postal_code": "66440", "city": "Torreilles",
     "phone": "04 68 28 44 75", "phone_e164": "+33468284475",
     "opening": "Ouvert toute l''année · en été, 7j/7 de 10h à 23h non-stop",
     "maps_query": "Karting de Torreilles, Chemin Mas dels Capellans, 66440 Torreilles",
     "geo": {"lat": 42.757, "lng": 2.99},
     "socials": {"facebook": "",
                 "instagram": "https://www.instagram.com/kartingdetorreilles/",
                 "youtube": "", "tiktok": ""}}', true),
  ('brand', 'Karting de Torreilles', '', '{"logo_path": null, "logo_alt": "Karting de Torreilles"}', true),
  ('banner', '', '', '{"level": "info"}', false);

-- Textes des pages (titre = H1, body = introduction, data = SEO et sections).
-- Chaque texte est modifiable depuis l'espace dirigeant.
insert into public.site_content (key, title, body, data, is_published) values
  ('page.home', $$Le karting de Torreilles$$,
   $$Deux pistes pour toute la famille, du kart électrique dès 3 ans au 270 cc adulte. Ouvert toute l'année, à deux pas des plages, près de Perpignan.$$,
   $${
     "eyebrow": "Torreilles · Pyrénées-Orientales",
     "seo_title": "Karting de Torreilles · Karting près de Perpignan (66)",
     "seo_description": "Karting à Torreilles, près de Perpignan (Pyrénées-Orientales) : grande piste de 492 m chronométrée, petite piste enfants dès 3 ans, kart biplace. Ouvert toute l'année.",
     "hero_image": null, "hero_video": null, "hero_poster": null,
     "cta_primary": "Réserver une session", "cta_secondary": "Offrir un bon cadeau",
     "sections": {
       "circuits": {"title": "Deux pistes", "body": "Une grande piste de 492 m chronométrée et une petite piste de 200 m pour les enfants."},
       "fleet":    {"title": "Les karts", "body": "Du kart électrique dès 3 ans au Sodi RT10 270 cc, en passant par le 120 cc junior et le biplace."},
       "formulas": {"title": "Groupes & anniversaires", "body": "Anniversaires, EVG et EVJF, groupes et entreprises : faites une demande en ligne."},
       "events":   {"title": "Prochains événements", "body": "Courses, soirées et privatisations de la piste."},
       "reviews":  {"title": "Ils ont roulé chez nous", "body": ""},
       "access":   {"title": "Accès & horaires", "body": "Chemin Mas dels Capellans, à Torreilles, entre Perpignan et la mer."},
       "cta":      {"title": "Prêt à prendre le départ ?", "body": "Réservez votre session ou offrez un bon cadeau."}
     }
   }$$::jsonb, true),
  ('page.karts-tarifs', $$Karts & tarifs$$,
   $$Des sessions de 10 minutes sur la grande piste et de 5 minutes sur la petite piste enfants. Tarifs par personne, TTC.$$,
   $${
     "seo_title": "Tarifs karting près de Perpignan · Karting de Torreilles",
     "seo_description": "Tarifs du karting de Torreilles : kart électrique 3-7 ans 5 €, kart 120 cc 7-14 ans 15 €, kart 270 cc adulte 19 €, kart biplace 24 €.",
     "sections": {
       "sessions": {"title": "Sessions", "body": "Prix par personne pour une session."},
       "packs":    {"title": "Packs", "body": "Plusieurs sessions le même jour, moins cher qu'à l'unité."},
       "finder":   {"title": "Quel kart pour moi ?", "body": "Indiquez l'âge du pilote pour voir les karts accessibles."}
     }
   }$$::jsonb, true),
  ('page.circuits', $$Nos pistes$$,
   $$Une grande piste homologuée de 492 m avec chronométrage, et une petite piste de 200 m réservée aux enfants.$$,
   $${
     "seo_title": "Grande piste de 492 m et piste enfants · Karting de Torreilles",
     "seo_description": "Les pistes du karting de Torreilles : grande piste de 492 m homologuée et chronométrée, petite piste de 200 m pour les enfants de 3 à 7 ans."
   }$$::jsonb, true),
  ('page.evenements', $$Événements$$,
   $$Courses, soirées et privatisations : retrouvez les prochains rendez-vous de la piste et réservez votre place en ligne.$$,
   $${
     "seo_title": "Courses et événements karting · Karting de Torreilles",
     "seo_description": "Les prochains événements du karting de Torreilles, près de Perpignan : courses, soirées et privatisations de la piste.",
     "sections": {
       "events": {"title": "Événements à venir", "body": ""}
     }
   }$$::jsonb, true),
  ('page.formules', $$Groupes & anniversaires$$,
   $$Anniversaires, EVG et EVJF, groupes et entreprises : faites une demande en ligne, l'équipe vous recontacte pour organiser votre venue.$$,
   $${
     "seo_title": "Anniversaire karting, EVG/EVJF et groupes · Karting de Torreilles",
     "seo_description": "Organisez un anniversaire karting, un EVG/EVJF ou une sortie de groupe à Torreilles, près de Perpignan. Demande en ligne, réponse de l'équipe.",
     "sections": {
       "groups": {"title": "Pour vos événements", "body": ""}
     }
   }$$::jsonb, true),
  ('page.anniversaire', $$Anniversaire karting$$,
   $$Fêtez un anniversaire sur la piste, dès 3 ans sur la petite piste et dès 7 ans sur la grande. Indiquez la date et le nombre d'enfants, l'équipe vous recontacte.$$,
   $${
     "eyebrow": "Formules",
     "seo_title": "Anniversaire karting près de Perpignan · Karting de Torreilles",
     "seo_description": "Fêtez un anniversaire au karting de Torreilles, près de Perpignan : karts dès 3 ans, demande en ligne.",
     "request_type": "birthday",
     "form_title": "Demander une date"
   }$$::jsonb, true),
  ('page.evg-evjf', $$EVG & EVJF$$,
   $$Un enterrement de vie de garçon ou de jeune fille sur la piste. Décrivez votre groupe, l'équipe vous propose une formule.$$,
   $${
     "eyebrow": "Formules",
     "seo_title": "EVG et EVJF au karting · Karting de Torreilles",
     "seo_description": "Organisez votre enterrement de vie de garçon ou de jeune fille au karting de Torreilles, près de Perpignan.",
     "request_type": "bachelor_party",
     "form_title": "Décrire votre groupe"
   }$$::jsonb, true),
  ('page.team-building', $$Groupes & entreprises$$,
   $$Des sessions de karting pour les groupes, les comités d'entreprise et les équipes, sur devis.$$,
   $${
     "eyebrow": "Formules",
     "seo_title": "Karting pour groupes et entreprises · Karting de Torreilles",
     "seo_description": "Sorties de groupe, CE et team building au karting de Torreilles, près de Perpignan : sessions sur devis.",
     "request_type": "team_building",
     "form_title": "Demander un devis"
   }$$::jsonb, true),
  ('page.bon-cadeau', $$Bon cadeau$$,
   $$Offrez un montant libre ou une activité précise, à utiliser en une ou plusieurs fois.$$,
   $${
     "seo_title": "Bon cadeau karting · Karting de Torreilles",
     "seo_description": "Offrez un bon cadeau karting à Torreilles : montant libre ou activité précise, valable 12 mois, à utiliser en une ou plusieurs fois.",
     "steps": [
       {"title": "Choisissez", "body": "Un montant libre ou une activité de la carte."},
       {"title": "Réglez", "body": "Au circuit ou par téléphone."},
       {"title": "Offrez", "body": "Le bon est envoyé par email, avec son code unique."}
     ],
     "sections": {
       "order":   {"title": "Commander un bon", "body": "Choisissez un montant ou une activité : vous réglez au circuit ou par téléphone, puis le bon part par email, en PDF avec son code unique."},
       "balance": {"title": "Vérifier le solde d'un bon", "body": ""}
     }
   }$$::jsonb, true),
  ('page.chronos', $$Chronos$$,
   $$Les meilleurs temps au tour réalisés sur la grande piste, par catégorie de kart.$$,
   $${
     "seo_title": "Meilleurs temps au tour · Karting de Torreilles",
     "seo_description": "Classement des meilleurs temps au tour sur la grande piste du karting de Torreilles, par catégorie de kart."
   }$$::jsonb, true),
  ('page.contact', $$Contact$$,
   $$Une question, une demande de groupe ? Écrivez-nous ou appelez le circuit.$$,
   $${
     "seo_title": "Contact et accès · Karting de Torreilles",
     "seo_description": "Karting de Torreilles, Chemin Mas dels Capellans, 66440 Torreilles (près de Perpignan). 04 68 28 44 75. Ouvert toute l'année.",
     "sections": {
       "access": {"title": "Venir au circuit", "body": ""},
       "form":   {"title": "Écrire au circuit", "body": "Pour une réservation de groupe, utilisez plutôt la page de la formule concernée."}
     }
   }$$::jsonb, true),
  ('page.reserver', $$Réserver une session$$,
   $$Choisissez votre kart, votre créneau et réglez sur place.$$,
   $${
     "seo_title": "Réserver une session · Karting de Torreilles",
     "seo_description": "Réservez en ligne votre session de karting à Torreilles, près de Perpignan : créneaux en temps réel, règlement sur place."
   }$$::jsonb, true);

insert into public.site_content (key, title, body, data, is_published) values
  ('legal.mentions', 'Mentions légales', 'À compléter : raison sociale, SIRET, siège, directeur de publication, hébergeur.', '{}', false),
  ('legal.cgv', 'Conditions générales de vente', 'À compléter.', '{}', false),
  ('legal.privacy', 'Politique de confidentialité', 'À compléter.', '{}', false),
  ('legal.cookies', 'Politique cookies', 'À compléter.', '{}', false);

-- -----------------------------------------------------------------------------
-- Créneaux sur l'horizon de génération
-- -----------------------------------------------------------------------------
select app.cron_generate_slots();

commit;
