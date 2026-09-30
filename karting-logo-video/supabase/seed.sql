-- =============================================================================
-- Karting Roussillon — Seed initial
-- Tarifs repris à l'identique du site actuel. Tout est modifiable dans /admin.
-- Valeurs marquées [PROVISOIRE] : à confirmer par le client (flotte, prix
-- Alpine / anniversaires, texte de décharge, email de notification).
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
  ('morning_start',                '"09:00"',  'Début de la demi-journée du matin', false),
  ('morning_end',                  '"13:00"',  'Fin de la demi-journée du matin', false),
  ('afternoon_start',              '"13:00"',  'Début de la demi-journée de l''après-midi', false),
  ('afternoon_end',                '"19:00"',  'Fin de la demi-journée de l''après-midi', false),
  ('gift_card_validity_months',    '12',       'Validité des bons cadeaux (mois)', true),
  ('reminder_local_hour',          '10',       'Heure locale d''envoi des rappels J-1', false),
  ('notify_email',                 '""',       '[PROVISOIRE] Email du dirigeant pour les notifications', false),
  ('online_payment_enabled',       'false',    'Paiement en ligne (Stripe) — désactivé : règlement sur place', true);

-- -----------------------------------------------------------------------------
-- Pistes
-- -----------------------------------------------------------------------------
insert into public.tracks (slug, name, short_name, length_m, usage, min_age, description, requires_booking,
                           online_booking_enabled, slot_interval_min, session_min, display_on_circuits, sort_order) values
  ('circuit-1', 'Circuit 1 — Loisir', 'Circuit 1', 726, 'leisure', 3,
   'Le circuit loisir, accessible dès 3 ans : idéal pour découvrir le karting en famille ou entre amis.',
   false, true, 15, 10, true, 1),
  ('circuit-2', 'Circuit 2 — Droits de piste', 'Circuit 2', 1019, 'track_access', null,
   'Circuit de 1019 m ouvert aux droits de piste auto, moto et kart avec votre propre matériel, et aux sessions SodiKart.',
   false, true, 15, 10, true, 2),
  ('circuit-3', 'Circuit 3 — Trackdays & événements', 'Circuit 3', 1513, 'events', null,
   'Le grand circuit de 1513 m dédié aux trackdays et aux événements. Réservation obligatoire.',
   true, false, 15, 10, true, 3),
  ('piste-baby', 'Piste Baby Kart', 'Piste baby', null, 'baby', 3,
   'Piste dédiée aux tout-petits, dès 3 ans.',
   false, false, 5, 3, false, 0);

-- -----------------------------------------------------------------------------
-- Flotte  [PROVISOIRE : fleet_count et capacités par piste à confirmer]
-- run_group : catégories autorisées à rouler ensemble sur une même session
-- -----------------------------------------------------------------------------
insert into public.vehicle_types (slug, name, short_label, engine, description, min_age, min_height_cm, seats,
                                  passenger_min_age, passenger_min_height_cm, is_adapted, run_group, fleet_count, sort_order) values
  ('sodikart-22cv',  'SodiKart 2T 22 CV', '22 CV',  '2 temps · 22 CV',     'Kart 2 temps pour pilotes confirmés.',            16, null, 1, null, null, false, 'performance', 6, 1),
  ('sodikart-30cv',  'SodiKart 2T 30 CV', '30 CV',  '2 temps · 30 CV',     'Le kart le plus puissant de la flotte.',          16, null, 1, null, null, false, 'performance', 4, 2),
  ('sodikart-390',   'SodiKart 390 cc',   '390',    '390 cc',              'Le kart loisir polyvalent, dès 14 ans.',          14, null, 1, null, null, false, 'loisir',      12, 3),
  ('biplace-270',    'Biplace 270 cc',    '2 pl.',  '270 cc · 2 places',   'Pilotez avec un passager à vos côtés.',           16, null, 2, 4, 100, false, 'loisir',      3, 4),
  ('handikart-birel','Handikart Birel',   'Handi',  'Commande au volant',  'Kart adapté : accélérateur et frein au volant.',  14, null, 1, null, null, true,  'loisir',      2, 5),
  ('kart-160',       'Kart 160 cc',       '160',    '160 cc',              'Le kart enfant, dès 7 ans et 1,30 m.',             7, 130, 1, null, null, false, 'enfant',      8, 6),
  ('baby-kart',      'Baby Kart',         'Baby',   '',                    'Premiers tours de roue, dès 3 ans.',               3, null, 1, null, null, false, 'baby',        6, 7);

insert into public.track_vehicle_capacities (track_id, vehicle_type_id, capacity)
select t.id, v.id, c.capacity
from (values
  ('circuit-1', 'kart-160',        8),
  ('circuit-1', 'sodikart-390',    6),
  ('circuit-1', 'biplace-270',     2),
  ('circuit-1', 'handikart-birel', 1),
  ('circuit-2', 'sodikart-22cv',   6),
  ('circuit-2', 'sodikart-30cv',   4),
  ('circuit-2', 'sodikart-390',    6),
  ('circuit-2', 'biplace-270',     1),
  ('circuit-2', 'handikart-birel', 1),
  ('piste-baby','baby-kart',       6)
) as c(track, vehicle, capacity)
join public.tracks t on t.slug = c.track
join public.vehicle_types v on v.slug = c.vehicle;

-- -----------------------------------------------------------------------------
-- Produits : sessions (tarifs du site actuel)
-- -----------------------------------------------------------------------------
insert into public.products (slug, kind, name, short_description, vehicle_type_id, price_cents, duration_min,
                             min_age, min_height_cm, age_label, is_online_bookable, is_featured, sort_order)
select p.slug, 'session', p.name, p.short_description, v.id, p.price_cents, p.duration_min,
       p.min_age, p.min_height_cm, p.age_label, p.online, p.featured, p.sort_order
from (values
  ('session-sodikart-22cv',   'SodiKart 2T 22 CV',                     'Session de 10 min sur le circuit de 1019 m.',        'sodikart-22cv',   4000, 10, 16, null, '16 ans révolus',                                 true,  true,  1),
  ('session-sodikart-30cv',   'SodiKart 2T 30 CV',                     'Session de 10 min sur le circuit de 1019 m.',        'sodikart-30cv',   5000, 10, 16, null, '16 ans révolus',                                 true,  true,  2),
  ('session-sodikart-390',    'SodiKart 390 cc',                       'Session de 10 min sur les circuits 726 m ou 1019 m.', 'sodikart-390',    2400, 10, 14, null, '14 ans révolus',                                 true,  true,  3),
  ('session-biplace',         'Biplace 270 cc',                        'Session de 10 min à deux.',                          'biplace-270',     2500, 10, 16, null, 'Conducteur 16 ans, passager 4 ans et 1 m',       true,  false, 4),
  ('session-handikart',       'Handikart Birel (commande au volant)',  'Session de 10 min en kart adapté.',                  'handikart-birel', 2000, 10, 14, null, '14 ans révolus',                                 true,  false, 5),
  ('session-kart-160',        'Kart 160 cc',                           'Session de 10 min pour les enfants.',                'kart-160',        2000, 10,  7, 130,  'Dès 7 ans (1,30 m)',                             true,  true,  6),
  ('session-baby-kart',       'Baby Kart',                             'Session de 3 min sur la piste baby.',                'baby-kart',        300,  3,  3, null, 'Dès 3 ans',                                      false, false, 7)
) as p(slug, name, short_description, vehicle, price_cents, duration_min, min_age, min_height_cm, age_label, online, featured, sort_order)
join public.vehicle_types v on v.slug = p.vehicle;

-- Packs KR (3 × 10 min, le même jour)
insert into public.products (slug, kind, name, short_description, vehicle_type_id, price_cents, duration_min,
                             min_age, min_height_cm, age_label, requires_chrono_validation, is_online_bookable, is_featured, sort_order)
select p.slug, 'pack', p.name, '3 sessions de 10 minutes.', v.id, p.price_cents, 30,
       p.min_age, p.min_height_cm, p.age_label, p.chrono, true, false, p.sort_order
from (values
  ('pack-kr-160',     'Pack KR 160 cc',     'kart-160',      5000,  7, 130,  'Dès 7 ans (1,30 m)',          false, 10),
  ('pack-kr-390',     'Pack KR 390 cc',     'sodikart-390',  6000, 14, null, 'Dès 14 ans',                  false, 11),
  ('pack-kr-biplace', 'Pack KR Biplace',    'biplace-270',   6000, 16, null, 'Conducteur 16 ans, passager 4 ans', false, 12),
  ('pack-kr-rotax',   'Pack KR Rotax 22 CV','sodikart-22cv', 10000, 16, null, 'Dès 16 ans, validation chrono', true, 13)
) as p(slug, name, vehicle, price_cents, min_age, min_height_cm, age_label, chrono, sort_order)
join public.vehicle_types v on v.slug = p.vehicle;

insert into public.packs (product_id, sessions_count, session_min, min_gap_min, same_day)
select id, 3, 10, 0, true from public.products where kind = 'pack';

-- Pistes par produit (sessions & packs : celles où le véhicule roule)
insert into public.product_tracks (product_id, track_id)
select p.id, t.id
from public.products p
join (values
  ('sodikart-22cv',   'circuit-2'),
  ('sodikart-30cv',   'circuit-2'),
  ('sodikart-390',    'circuit-1'), ('sodikart-390',    'circuit-2'),
  ('biplace-270',     'circuit-1'), ('biplace-270',     'circuit-2'),
  ('handikart-birel', 'circuit-1'), ('handikart-birel', 'circuit-2'),
  ('kart-160',        'circuit-1'), ('kart-160',        'circuit-2'),
  ('baby-kart',       'piste-baby')
) as m(vehicle, track) on true
join public.vehicle_types v on v.slug = m.vehicle and v.id = p.vehicle_type_id
join public.tracks t on t.slug = m.track;

-- -----------------------------------------------------------------------------
-- Expériences et produits sur demande  [PROVISOIRE : prix à renseigner]
-- -----------------------------------------------------------------------------
insert into public.products (slug, kind, name, short_description, description, request_type, price_cents, price_label,
                             duration_min, age_label, metadata, is_featured, sort_order) values
  ('alpine-a110s-1019', 'experience', 'Alpine A110S — 5 tours (1019 m)',
   'Pilotez une Alpine A110S : 5 tours sur le circuit de 1019 m.', '', 'alpine', null, 'Tarif sur demande',
   null, '', '{"laps": 5, "track_length_m": 1019, "extra_lap_cents": 1700, "extra_lap_note": "Tour supplémentaire 17 € sur place"}', true, 20),
  ('alpine-a110s-1513', 'experience', 'Alpine A110S — 3 tours (1513 m)',
   'Pilotez une Alpine A110S : 3 tours sur le circuit de 1513 m.', '', 'alpine', null, 'Tarif sur demande',
   null, '', '{"laps": 3, "track_length_m": 1513, "extra_lap_cents": 1700, "extra_lap_note": "Tour supplémentaire 17 € sur place"}', true, 21),
  ('anniversaire-formule-1', 'on_request', 'Anniversaire — Formule 1',
   'Formule anniversaire pour les plus jeunes.', '', 'birthday', null, 'Sur demande',
   null, '', '{"includes": ["Espace réservé", "Podium", "Récompenses", "Baptême en biplace offert"]}', true, 30),
  ('anniversaire-formule-2', 'on_request', 'Anniversaire — Formule 2',
   'Formule anniversaire pour les plus grands.', '', 'birthday', null, 'Sur demande',
   null, '', '{"includes": ["Espace réservé", "Podium", "Récompenses", "Baptême en biplace offert"]}', true, 31),
  ('evg-evjf', 'on_request', 'EVG / EVJF',
   'Enterrement de vie de garçon ou de jeune fille sur la piste.', '', 'bachelor_party', null, 'Sur demande',
   null, '', '{}', false, 32),
  ('team-building', 'on_request', 'Team building',
   'Challenge karting pour les entreprises.', '', 'team_building', null, 'Sur devis',
   null, '', '{}', false, 33),
  ('ecole-pilotage-kart', 'on_request', 'École de pilotage — Kart',
   'Apprendre ou progresser en karting avec un encadrement.', '', 'school_kart', null, 'Sur demande',
   null, '', '{}', false, 40),
  ('ecole-pilotage-moto', 'on_request', 'École de pilotage — Moto',
   'Apprendre ou progresser en moto sur circuit.', '', 'school_moto', null, 'Sur demande',
   null, '', '{}', false, 41);

insert into public.product_tracks (product_id, track_id)
select p.id, t.id from public.products p join public.tracks t on t.slug = case p.slug
  when 'alpine-a110s-1019' then 'circuit-2' when 'alpine-a110s-1513' then 'circuit-3' end
where p.slug like 'alpine-%';

-- -----------------------------------------------------------------------------
-- Horaires : 7 j / 7, 9 h – 19 h (tout le site)
-- -----------------------------------------------------------------------------
insert into public.opening_hours (track_id, weekday, opens_at, closes_at, label)
select null, d, '09:00', '19:00', 'Horaires standards' from generate_series(1, 7) d;

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
  -- geo : coordonnées approchées (secteur Rivesaltes / Claira) [PROVISOIRE : à préciser],
  -- utilisées pour la météo du tableau de bord et les données structurées
  ('contact', 'Karting Roussillon', '',
   '{"address": "Mas de la Garrigue Nord", "postal_code": "66600", "city": "Rivesaltes", "area": "Claira",
     "phone": "04 68 62 90 50", "phone_e164": "+33468629050",
     "opening": "Ouvert 7j/7, de 9h00 à 19h00",
     "maps_query": "Karting Roussillon, Mas de la Garrigue Nord, 66600 Rivesaltes",
     "geo": {"lat": 42.77, "lng": 2.88},
     "socials": {"facebook": "https://www.facebook.com/profile.php?id=61572543572359",
                 "instagram": "https://www.instagram.com/kartingduroussillon/",
                 "youtube": "", "tiktok": ""}}', true),
  ('brand', 'Karting Roussillon', '', '{"logo_path": "logo.png", "logo_alt": "Karting Roussillon"}', true),
  ('banner', '', '', '{"level": "info"}', false);

-- Textes des pages (titre = H1, body = introduction, data = SEO et sections).
-- Chaque texte est modifiable depuis l'espace dirigeant.
insert into public.site_content (key, title, body, data, is_published) values
  ('page.home', $$Le karting du Roussillon$$,
   $$Trois circuits, une flotte pour tous les âges, du Baby Kart au 2 temps 30 CV. Ouvert 7 jours sur 7, à Rivesaltes.$$,
   $${
     "eyebrow": "Rivesaltes · Pyrénées-Orientales",
     "seo_title": "Karting Roussillon · Karting à Rivesaltes près de Perpignan (66)",
     "seo_description": "Karting à Rivesaltes, près de Perpignan et Claira (Pyrénées-Orientales) : 3 circuits, karts dès 3 ans, anniversaires, trackdays. Ouvert 7j/7.",
     "hero_image": null, "hero_video": "hero/circuit.mp4", "hero_poster": "hero/circuit-poster.jpg",
     "cta_primary": "Réserver une session", "cta_secondary": "Offrir un bon cadeau",
     "sections": {
       "circuits": {"title": "Trois circuits", "body": "Du circuit loisir de 726 m au grand tracé de 1513 m dédié aux trackdays et aux événements."},
       "fleet":    {"title": "La flotte", "body": "Du Baby Kart dès 3 ans au SodiKart 2 temps 30 CV : chaque pilote trouve son kart."},
       "formulas": {"title": "Formules & expériences", "body": "Anniversaires, EVG et EVJF, team building, école de pilotage et Alpine A110S."},
       "events":   {"title": "Prochains événements", "body": "Trackdays, privatisations et statut des droits de piste."},
       "reviews":  {"title": "Ils ont roulé chez nous", "body": ""},
       "access":   {"title": "Accès & horaires", "body": "Mas de la Garrigue Nord, à Rivesaltes, secteur Claira."},
       "cta":      {"title": "Prêt à prendre le départ ?", "body": "Réservez votre session ou offrez un bon cadeau."}
     }
   }$$::jsonb, true),
  ('page.karts-tarifs', $$Karts & tarifs$$,
   $$Des sessions de 10 minutes sur le circuit adapté à chaque kart. Les Packs KR regroupent trois sessions le même jour.$$,
   $${
     "seo_title": "Tarifs karting près de Perpignan · Karting Roussillon",
     "seo_description": "Tarifs karting à Rivesaltes, près de Perpignan : SodiKart 22 et 30 CV, 390 cc, biplace, handikart, kart enfant, Baby Kart dès 3 ans et Packs KR.",
     "sections": {
       "sessions": {"title": "Sessions", "body": "Prix par kart pour une session."},
       "packs":    {"title": "Packs KR", "body": "Trois sessions de 10 minutes le même jour, moins cher que trois sessions à l'unité."},
       "finder":   {"title": "Quel kart pour moi ?", "body": "Indiquez l'âge du pilote pour voir les karts accessibles."}
     }
   }$$::jsonb, true),
  ('page.circuits', $$Nos circuits$$,
   $$Trois tracés aux usages différents : le loisir, les droits de piste et les événements.$$,
   $${
     "seo_title": "Circuits de 726 m, 1019 m et 1513 m · Karting Roussillon",
     "seo_description": "Les trois circuits de Karting Roussillon à Rivesaltes : circuit loisir de 726 m dès 3 ans, circuit de 1019 m ouvert aux droits de piste, circuit de 1513 m pour les trackdays."
   }$$::jsonb, true),
  ('page.trackday', $$Trackdays & droits de piste$$,
   $$Roulez avec votre auto, votre moto ou votre kart sur le circuit de 1019 m, et retrouvez les trackdays et les événements du circuit de 1513 m.$$,
   $${
     "seo_title": "Trackday Roussillon : droits de piste auto et moto · Karting Roussillon",
     "seo_description": "Calendrier des droits de piste et des trackdays auto et moto à Rivesaltes, près de Perpignan : jours ouverts, accès restreints, privatisations.",
     "sections": {
       "calendar": {"title": "Calendrier de la piste", "body": "Le statut de chaque journée est mis à jour par l'équipe du circuit."},
       "events":   {"title": "Trackdays & événements à venir", "body": ""}
     }
   }$$::jsonb, true),
  ('page.formules', $$Formules & événements$$,
   $$Anniversaires, EVG et EVJF, team building : faites une demande en ligne, l'équipe vous recontacte pour organiser votre venue.$$,
   $${
     "seo_title": "Anniversaire karting, EVG/EVJF et team building · Karting Roussillon",
     "seo_description": "Organisez un anniversaire karting, un EVG/EVJF ou un team building près de Perpignan. Demande en ligne, réponse de l'équipe du circuit.",
     "sections": {
       "groups":      {"title": "Pour vos événements", "body": ""},
       "experiences": {"title": "Apprendre et piloter", "body": ""}
     }
   }$$::jsonb, true),
  ('page.anniversaire', $$Anniversaire karting$$,
   $$Deux formules selon l'âge, avec un espace réservé, un podium, des récompenses et un baptême en biplace offert.$$,
   $${
     "eyebrow": "Formules",
     "seo_title": "Anniversaire karting près de Perpignan · Karting Roussillon",
     "seo_description": "Fêtez un anniversaire au karting à Rivesaltes : deux formules selon l'âge, espace réservé, podium, récompenses et baptême en biplace offert.",
     "request_type": "birthday",
     "form_title": "Demander une date"
   }$$::jsonb, true),
  ('page.evg-evjf', $$EVG & EVJF$$,
   $$Un enterrement de vie de garçon ou de jeune fille sur la piste. Décrivez votre groupe, l'équipe vous propose une formule.$$,
   $${
     "eyebrow": "Formules",
     "seo_title": "EVG et EVJF au karting · Karting Roussillon",
     "seo_description": "Organisez votre enterrement de vie de garçon ou de jeune fille au karting, à Rivesaltes près de Perpignan.",
     "request_type": "bachelor_party",
     "form_title": "Décrire votre groupe"
   }$$::jsonb, true),
  ('page.team-building', $$Team building$$,
   $$Des sessions de karting pour les équipes et les entreprises, sur devis.$$,
   $${
     "eyebrow": "Formules",
     "seo_title": "Team building karting près de Perpignan · Karting Roussillon",
     "seo_description": "Team building et séminaires au karting à Rivesaltes : sessions pour les entreprises sur devis.",
     "request_type": "team_building",
     "form_title": "Demander un devis"
   }$$::jsonb, true),
  ('page.ecole-de-pilotage', $$École de pilotage$$,
   $$Apprendre ou progresser en kart et en moto sur circuit. Faites une demande pour connaître les prochaines sessions.$$,
   $${
     "seo_title": "École de pilotage kart et moto · Karting Roussillon",
     "seo_description": "École de pilotage kart et moto à Rivesaltes, près de Perpignan : demandez les prochaines sessions.",
     "form_title": "Demander les prochaines sessions"
   }$$::jsonb, true),
  ('page.alpine-a110s', $$Alpine A110S$$,
   $$Prenez le volant d'une Alpine A110S : 5 tours sur le circuit de 1019 m ou 3 tours sur le circuit de 1513 m.$$,
   $${
     "eyebrow": "Expérience pilotage",
     "seo_title": "Pilotage d'une Alpine A110S sur circuit · Karting Roussillon",
     "seo_description": "Pilotez une Alpine A110S sur circuit à Rivesaltes : 5 tours sur 1019 m ou 3 tours sur 1513 m. Tour supplémentaire 17 € sur place.",
     "request_type": "alpine",
     "form_title": "Réserver mon expérience"
   }$$::jsonb, true),
  ('page.bon-cadeau', $$Bon cadeau$$,
   $$Offrez un montant libre ou une activité précise, à utiliser en une ou plusieurs fois.$$,
   $${
     "seo_title": "Bon cadeau karting · Karting Roussillon",
     "seo_description": "Offrez un bon cadeau karting : montant libre ou activité précise, valable 12 mois, à utiliser en une ou plusieurs fois.",
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
   $$Les meilleurs temps au tour réalisés sur nos circuits, par catégorie de kart.$$,
   $${
     "seo_title": "Meilleurs temps au tour · Karting Roussillon",
     "seo_description": "Classement des meilleurs temps au tour sur les circuits de Karting Roussillon, par catégorie de kart."
   }$$::jsonb, true),
  ('page.contact', $$Contact$$,
   $$Une question, une demande particulière ? Écrivez-nous ou appelez le circuit.$$,
   $${
     "seo_title": "Contact et accès · Karting Roussillon, Rivesaltes",
     "seo_description": "Karting Roussillon, Mas de la Garrigue Nord, 66600 Rivesaltes (secteur Claira, près de Perpignan). 04 68 62 90 50. Ouvert 7j/7 de 9h à 19h.",
     "sections": {
       "access": {"title": "Venir au circuit", "body": ""},
       "form":   {"title": "Écrire au circuit", "body": "Pour une réservation de groupe, utilisez plutôt la page de la formule concernée."}
     }
   }$$::jsonb, true),
  ('page.reserver', $$Réserver une session$$,
   $$Choisissez votre activité. La réservation en ligne avec choix du créneau arrive très prochainement : en attendant, appelez le circuit.$$,
   $${
     "seo_title": "Réserver une session · Karting Roussillon",
     "seo_description": "Réservez en ligne votre session de karting à Rivesaltes, près de Perpignan : créneaux en temps réel, règlement sur place."
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
