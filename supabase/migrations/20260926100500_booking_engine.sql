-- =============================================================================
-- Karting Roussillon — 06 · Moteur de réservation (fonctions internes `app`)
--
-- Principe anti-surréservation : toute opération qui consomme ou libère de la
-- capacité verrouille d'abord les lignes `slots` concernées (FOR UPDATE, ordre
-- par id pour éviter les interblocages), puis recalcule la capacité restante
-- dans la même transaction. Les pilotes sont en plus sérialisés par verrou
-- consultatif sur leur pilot_key (pas deux sessions simultanées).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Capacité restante, calcul ensembliste pour une liste de créneaux.
--   p_online = true  : min(quota en ligne restant, capacité totale restante)
--   p_online = false : capacité totale restante (comptoir / téléphone)
-- Les holds non expirés comptent comme de la consommation en ligne.
-- -----------------------------------------------------------------------------
create or replace function app.slots_remaining(
  p_slot_ids        uuid[],
  p_vehicle_type_id uuid,
  p_online          boolean,
  p_exclude_hold    uuid default null,
  p_exclude_booking uuid default null)
returns table (slot_id uuid, remaining integer)
language sql stable security definer
set search_path = ''
as $$
  with s as (
    select sl.id, coalesce(sl.max_karts, t.max_karts_on_track) as max_karts, t.enforce_run_groups
    from public.slots sl
    join public.tracks t on t.id = sl.track_id
    where sl.id = any (p_slot_ids)
  ),
  vt as (
    select v.run_group from public.vehicle_types v where v.id = p_vehicle_type_id
  ),
  usage as (
    select bs.slot_id, bs.vehicle_type_id, v.run_group, bs.karts, (b.source = 'online') as is_online
    from public.booking_sessions bs
    join public.bookings b       on b.id = bs.booking_id
    join public.vehicle_types v  on v.id = bs.vehicle_type_id
    where bs.slot_id = any (p_slot_ids)
      and app.is_active_status(b.status)
      and b.id is distinct from p_exclude_booking
    union all
    select h.slot_id, h.vehicle_type_id, v.run_group, h.karts, true
    from public.booking_holds h
    join public.vehicle_types v on v.id = h.vehicle_type_id
    where h.slot_id = any (p_slot_ids)
      and h.expires_at > now()
      and h.hold_token is distinct from p_exclude_hold
  ),
  agg as (
    select s.id,
           coalesce(sum(u.karts) filter (where u.vehicle_type_id = p_vehicle_type_id), 0)                  as used_type,
           coalesce(sum(u.karts) filter (where u.vehicle_type_id = p_vehicle_type_id and u.is_online), 0)  as used_type_online,
           coalesce(sum(u.karts), 0)                                                                       as used_all,
           coalesce(bool_or(u.run_group <> (select run_group from vt)), false)                             as other_group
    from s
    left join usage u on u.slot_id = s.id
    group by s.id
  )
  select s.id,
         greatest(0,
           case
             when sc.slot_id is null then 0
             when s.enforce_run_groups and a.other_group then 0
             else least(
               case when p_online
                    then least(sc.online_capacity - a.used_type_online, sc.capacity - a.used_type)
                    else sc.capacity - a.used_type
               end,
               coalesce(s.max_karts - a.used_all, 2147483647))
           end)::integer
  from s
  join agg a on a.id = s.id
  left join public.slot_capacities sc on sc.slot_id = s.id and sc.vehicle_type_id = p_vehicle_type_id
$$;

-- -----------------------------------------------------------------------------
-- Contrôle d'un produit réservable
-- -----------------------------------------------------------------------------
create or replace function app.assert_product_bookable(p_product public.products, p_day date, p_online boolean)
returns void language plpgsql stable
set search_path = ''
as $$
begin
  if p_product.id is null or not p_product.is_active or p_product.kind not in ('session', 'pack') then
    perform app.fail('KR_PRODUCT_NOT_BOOKABLE', 'Ce produit ne peut pas être réservé en ligne.');
  end if;
  if p_online and not p_product.is_online_bookable then
    perform app.fail('KR_PRODUCT_NOT_BOOKABLE', 'Ce produit se réserve uniquement sur place ou par téléphone.');
  end if;
  if p_product.active_months is not null
     and not (extract(month from p_day)::smallint = any (p_product.active_months)) then
    perform app.fail('KR_PRODUCT_OUT_OF_SEASON', 'Ce produit n''est pas proposé à cette période.');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Valide une sélection de créneaux pour un produit et renvoie les ids triés
-- chronologiquement. Session : 1 créneau. Pack : N créneaux distincts, sans
-- chevauchement, écart minimal respecté, même journée si requis.
-- -----------------------------------------------------------------------------
-- p_check_timing = false à la confirmation d'un hold : le délai minimal a été
-- contrôlé à la prise du hold, seul le départ futur est revérifié.
create or replace function app.validate_slot_selection(
  p_product public.products, p_slot_ids uuid[], p_online boolean, p_check_timing boolean default true)
returns uuid[] language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_pack      public.packs;
  v_expected  integer := 1;
  v_ids       uuid[];
  v_prev      record;
  r           record;
  v_first_day date;
  v_lead      integer := app.setting_int('booking_min_lead_minutes', 30);
  v_horizon   integer := app.setting_int('booking_horizon_days', 90);
  v_i         integer := 0;
begin
  if p_slot_ids is null or cardinality(p_slot_ids) = 0 then
    perform app.fail('KR_SLOT_REQUIRED', 'Choisissez un créneau.');
  end if;
  if (select count(distinct x) from unnest(p_slot_ids) x) <> cardinality(p_slot_ids) then
    perform app.fail('KR_SLOT_DUPLICATE', 'Un même créneau ne peut être choisi deux fois.');
  end if;

  if p_product.kind = 'pack' then
    select * into v_pack from public.packs where product_id = p_product.id;
    if v_pack.product_id is null then
      perform app.fail('KR_PRODUCT_MISCONFIGURED', 'Pack incomplet (détail manquant).');
    end if;
    v_expected := v_pack.sessions_count;
  end if;
  if cardinality(p_slot_ids) <> v_expected then
    perform app.fail('KR_SLOT_COUNT', format('Ce produit nécessite %s créneau(x).', v_expected));
  end if;

  for r in
    select sl.id, sl.track_id, sl.starts_at, sl.ends_at, sl.is_active,
           t.is_active as track_active, t.online_booking_enabled,
           exists (select 1 from public.product_tracks pt where pt.product_id = p_product.id and pt.track_id = sl.track_id) as track_ok
    from public.slots sl
    join public.tracks t on t.id = sl.track_id
    where sl.id = any (p_slot_ids)
    order by sl.starts_at
  loop
    v_i := v_i + 1;
    v_ids := array_append(v_ids, r.id);
    if not r.is_active or not r.track_active or not r.track_ok then
      perform app.fail('KR_SLOT_UNAVAILABLE', 'Ce créneau n''est pas disponible pour cette activité.');
    end if;
    if app.is_blocked(r.track_id, r.starts_at, r.ends_at) then
      perform app.fail('KR_SLOT_BLOCKED', 'Ce créneau vient d''être fermé à la réservation.');
    end if;
    if p_online then
      if not r.online_booking_enabled then
        perform app.fail('KR_SLOT_UNAVAILABLE', 'Cette piste ne se réserve pas en ligne.');
      end if;
      if r.starts_at <= now()
         or (p_check_timing and r.starts_at < now() + make_interval(mins => v_lead)) then
        perform app.fail('KR_SLOT_TOO_SOON', format('Réservation en ligne possible jusqu''à %s min avant le départ.', v_lead));
      end if;
      if p_check_timing and app.local_date(r.starts_at) > app.local_date(now()) + v_horizon then
        perform app.fail('KR_SLOT_TOO_FAR', format('Réservation possible jusqu''à %s jours à l''avance.', v_horizon));
      end if;
    end if;
    if v_i = 1 then
      v_first_day := app.local_date(r.starts_at);
      perform app.assert_product_bookable(p_product, v_first_day, p_online);
    else
      if coalesce(v_pack.same_day, true) and app.local_date(r.starts_at) <> v_first_day then
        perform app.fail('KR_PACK_SAME_DAY', 'Les sessions d''un pack doivent avoir lieu le même jour.');
      end if;
      if r.starts_at < v_prev.ends_at + make_interval(mins => coalesce(v_pack.min_gap_min, 0)) then
        perform app.fail('KR_PACK_OVERLAP', 'Les sessions d''un pack ne peuvent pas se chevaucher.');
      end if;
    end if;
    v_prev := r;
  end loop;

  if v_i <> cardinality(p_slot_ids) then
    perform app.fail('KR_SLOT_NOT_FOUND', 'Créneau introuvable.');
  end if;
  return v_ids;
end;
$$;

-- -----------------------------------------------------------------------------
-- Crée un hold (blocage temporaire) sur un ou plusieurs créneaux.
-- -----------------------------------------------------------------------------
create or replace function app.create_hold(
  p_product_id uuid, p_slot_ids uuid[], p_karts integer, p_online boolean,
  p_booking_id uuid default null)
returns table (hold_token uuid, expires_at timestamptz)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_ids     uuid[];
  v_token   uuid := gen_random_uuid();
  v_expires timestamptz := now() + make_interval(mins => app.setting_int('hold_minutes', 10));
  v_max     integer := app.setting_int('max_karts_per_booking', 10);
  r         record;
begin
  select * into v_product from public.products where id = p_product_id;
  if v_product.id is null then
    perform app.fail('KR_PRODUCT_NOT_FOUND');
  end if;
  if p_karts is null or p_karts < 1 or (p_online and p_karts > v_max) then
    perform app.fail('KR_KARTS_INVALID', format('Nombre de karts entre 1 et %s en ligne.', v_max));
  end if;

  -- Verrou des créneaux (ordre déterministe)
  perform 1 from public.slots where id = any (p_slot_ids) order by id for update;

  v_ids := app.validate_slot_selection(v_product, p_slot_ids, p_online);

  for r in select x.slot_id, x.remaining
           from app.slots_remaining(v_ids, v_product.vehicle_type_id, p_online, null, p_booking_id) x
  loop
    if r.remaining < p_karts then
      perform app.fail('KR_SLOT_FULL',
        case when r.remaining = 0 then 'Ce créneau est complet.'
             else format('Il ne reste que %s kart(s) sur ce créneau.', r.remaining) end,
        r.slot_id::text);
    end if;
  end loop;

  insert into public.booking_holds (hold_token, product_id, slot_id, vehicle_type_id, karts, seq, booking_id, expires_at)
  select v_token, v_product.id, x.id, v_product.vehicle_type_id, p_karts, x.ord::integer, p_booking_id, v_expires
  from unnest(v_ids) with ordinality as x(id, ord);

  hold_token := v_token;
  expires_at := v_expires;
  return next;
end;
$$;

-- -----------------------------------------------------------------------------
-- Client : recherche / création non destructive.
-- p_strict = true (parcours public) : email, prénom, nom, téléphone obligatoires.
-- Un compte connecté n'est rattaché à une fiche que si l'email correspond.
-- -----------------------------------------------------------------------------
create or replace function app.upsert_customer(p jsonb, p_strict boolean)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_email      text := nullif(lower(trim(p ->> 'email')), '');
  v_first      text := left(trim(coalesce(p ->> 'first_name', '')), 80);
  v_last       text := left(trim(coalesce(p ->> 'last_name', '')), 80);
  v_phone      text := left(trim(coalesce(p ->> 'phone', '')), 30);
  v_company    text := left(trim(coalesce(p ->> 'company', '')), 120);
  v_uid        uuid := auth.uid();
  v_auth_email text;
  v_id         uuid;
  v_linked     uuid;
begin
  if p_strict and (v_email is null or v_first = '' or v_last = '' or v_phone = '') then
    perform app.fail('KR_CUSTOMER_INCOMPLETE', 'Nom, prénom, email et téléphone sont obligatoires.');
  end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.fail('KR_EMAIL_INVALID', 'Adresse email invalide.');
  end if;
  if v_first = '' and v_last = '' then
    perform app.fail('KR_CUSTOMER_INCOMPLETE', 'Le nom du client est obligatoire.');
  end if;

  if v_uid is not null and not app.is_staff() then
    select u.email into v_auth_email from auth.users u where u.id = v_uid;
    select c.id into v_linked from public.customers c where c.auth_user_id = v_uid;
    if v_linked is not null and (v_email is null or v_email = lower(v_auth_email)) then
      update public.customers c
         set first_name = v_first, last_name = v_last,
             phone = case when v_phone <> '' then v_phone else c.phone end,
             company = case when v_company <> '' then v_company else c.company end
       where c.id = v_linked;
      return v_linked;
    end if;
  end if;

  if v_email is not null then
    select c.id into v_id from public.customers c where lower(c.email) = v_email for update;
  end if;

  if v_id is not null then
    -- On ne modifie pas une fiche existante depuis un parcours anonyme,
    -- on complète seulement les champs vides.
    update public.customers c
       set first_name = case when c.first_name = '' then v_first else c.first_name end,
           last_name  = case when c.last_name  = '' then v_last  else c.last_name  end,
           phone      = case when c.phone      = '' then v_phone else c.phone      end,
           company    = case when c.company    = '' then v_company else c.company  end,
           auth_user_id = case
             when c.auth_user_id is null and v_uid is not null and v_auth_email is not null
                  and lower(v_auth_email) = v_email and v_linked is null then v_uid
             else c.auth_user_id end
     where c.id = v_id;
    return v_id;
  end if;

  insert into public.customers (email, first_name, last_name, phone, company, marketing_opt_in, auth_user_id)
  values (v_email, v_first, v_last, v_phone, v_company,
          coalesce((p ->> 'marketing_opt_in')::boolean, false),
          case when v_uid is not null and v_linked is null and v_auth_email is not null
                    and lower(v_auth_email) = v_email then v_uid end)
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Participants : validation métier + insertion.
-- Contrôles : nombre (1 pilote par kart, passagers selon places), âge révolu
-- à la date de la session, taille (mesurée ou certifiée), validation chrono,
-- représentant légal pour les mineurs, doublons.
-- -----------------------------------------------------------------------------
create or replace function app.add_participants(
  p_booking_id uuid, p_product public.products, p_day date, p_karts integer,
  p_participants jsonb, p_require_waiver boolean)
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_vehicle   public.vehicle_types;
  v_min_age   integer;
  v_min_h     integer;
  v_drivers   integer;
  v_pass      integer;
  v_waiver    integer;
  v_keys      text[] := '{}';
  p           jsonb;
  v_role      public.participant_role;
  v_first     text;
  v_last      text;
  v_birth     date;
  v_height    integer;
  v_cert      boolean;
  v_age       integer;
  v_key       text;
  v_guardian  text;
  v_who       text;
  v_n         integer := 0;
begin
  if p_participants is null or jsonb_typeof(p_participants) <> 'array' then
    perform app.fail('KR_PARTICIPANTS_REQUIRED', 'La liste des participants est obligatoire.');
  end if;
  select * into v_vehicle from public.vehicle_types where id = p_product.vehicle_type_id;
  v_min_age := coalesce(p_product.min_age, v_vehicle.min_age, 0);
  v_min_h   := coalesce(p_product.min_height_cm, v_vehicle.min_height_cm);

  select count(*) filter (where coalesce(e ->> 'role', 'driver') = 'driver'),
         count(*) filter (where e ->> 'role' = 'passenger')
    into v_drivers, v_pass
  from jsonb_array_elements(p_participants) e;

  if v_drivers <> p_karts then
    perform app.fail('KR_PARTICIPANTS_COUNT', format('Il faut exactement %s pilote(s).', p_karts));
  end if;
  if v_pass > p_karts * (v_vehicle.seats - 1) then
    perform app.fail('KR_PARTICIPANTS_COUNT',
      case when v_vehicle.seats = 1 then 'Ce véhicule n''accepte pas de passager.'
           else format('%s passager(s) maximum.', p_karts * (v_vehicle.seats - 1)) end);
  end if;

  select version into v_waiver from public.waiver_versions where is_current;

  for p in select * from jsonb_array_elements(p_participants) loop
    v_role   := coalesce(p ->> 'role', 'driver')::public.participant_role;
    v_first  := left(trim(coalesce(p ->> 'first_name', '')), 80);
    v_last   := left(trim(coalesce(p ->> 'last_name', '')), 80);
    v_height := nullif(p ->> 'height_cm', '')::integer;
    v_cert   := coalesce((p ->> 'height_certified')::boolean, false);
    v_guardian := nullif(left(trim(coalesce(p ->> 'guardian_name', '')), 120), '');
    v_who    := trim(v_first || ' ' || v_last);
    begin
      v_birth := (p ->> 'birth_date')::date;
    exception when others then
      v_birth := null;
    end;

    if v_first = '' or v_last = '' then
      perform app.fail('KR_PARTICIPANT_NAME', 'Nom et prénom obligatoires pour chaque participant.');
    end if;
    if v_birth is null or v_birth > p_day or v_birth < p_day - interval '110 years' then
      perform app.fail('KR_PARTICIPANT_BIRTHDATE', 'Date de naissance invalide.', v_who);
    end if;

    v_age := app.age_on(v_birth, p_day);
    v_key := app.pilot_key(v_first, v_last, v_birth);
    if v_key = any (v_keys) then
      perform app.fail('KR_DUPLICATE_PARTICIPANT', 'Un même participant est saisi deux fois.', v_who);
    end if;
    v_keys := array_append(v_keys, v_key);

    if v_role = 'driver' then
      if v_age < v_min_age then
        perform app.fail('KR_AGE_TOO_LOW', format('%s : âge minimum %s ans révolus le jour de la session.', v_who, v_min_age), v_who);
      end if;
      if v_min_h is not null then
        if v_height is not null and v_height < v_min_h then
          perform app.fail('KR_HEIGHT_TOO_LOW', format('%s : taille minimum %s cm.', v_who, v_min_h), v_who);
        elsif v_height is null and not v_cert then
          perform app.fail('KR_HEIGHT_REQUIRED', format('%s : indiquez ou certifiez une taille d''au moins %s cm.', v_who, v_min_h), v_who);
        end if;
      end if;
      if p_product.requires_chrono_validation and not exists (
           select 1 from public.customers c where c.pilot_key = v_key and c.chrono_validated) then
        perform app.fail('KR_CHRONO_VALIDATION_REQUIRED',
          format('%s : ce produit nécessite une validation chrono préalable par le circuit.', v_who), v_who);
      end if;
    else
      if v_age < coalesce(v_vehicle.passenger_min_age, 0) then
        perform app.fail('KR_PASSENGER_AGE_TOO_LOW', format('%s : âge minimum passager %s ans.', v_who, v_vehicle.passenger_min_age), v_who);
      end if;
      if v_vehicle.passenger_min_height_cm is not null then
        if v_height is not null and v_height < v_vehicle.passenger_min_height_cm then
          perform app.fail('KR_HEIGHT_TOO_LOW', format('%s : taille minimum passager %s cm.', v_who, v_vehicle.passenger_min_height_cm), v_who);
        elsif v_height is null and not v_cert then
          perform app.fail('KR_HEIGHT_REQUIRED', format('%s : indiquez ou certifiez une taille d''au moins %s cm.', v_who, v_vehicle.passenger_min_height_cm), v_who);
        end if;
      end if;
    end if;

    if p_require_waiver and v_age < 18 and v_guardian is null then
      perform app.fail('KR_GUARDIAN_REQUIRED', format('%s est mineur : le nom du représentant légal est obligatoire.', v_who), v_who);
    end if;

    -- Sérialise les réservations concurrentes d'un même pilote
    perform pg_advisory_xact_lock(hashtextextended('pilot:' || v_key, 0));

    insert into public.booking_participants (
      booking_id, role, first_name, last_name, birth_date, height_cm, height_certified,
      pilot_key, extra, waiver_signed_at, waiver_signed_by, waiver_version)
    values (
      p_booking_id, v_role, v_first, v_last, v_birth, v_height, v_cert,
      v_key, coalesce(p -> 'extra', '{}'::jsonb),
      case when p_require_waiver then now() end,
      case when p_require_waiver then coalesce(v_guardian, v_who) end,
      case when p_require_waiver then v_waiver end);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Un pilote ne peut pas être sur deux sessions qui se chevauchent (toutes pistes).
create or replace function app.assert_no_pilot_overlap(p_booking_id uuid)
returns void language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_who text;
begin
  select p.first_name || ' ' || p.last_name into v_who
  from public.booking_participants p
  join public.booking_sessions s  on s.booking_id = p.booking_id
  join public.slots sl            on sl.id = s.slot_id
  where p.booking_id = p_booking_id
    and exists (
      select 1
      from public.booking_participants p2
      join public.bookings b2        on b2.id = p2.booking_id
      join public.booking_sessions s2 on s2.booking_id = b2.id
      join public.slots sl2          on sl2.id = s2.slot_id
      where p2.pilot_key = p.pilot_key
        and p2.booking_id <> p_booking_id
        and app.is_active_status(b2.status)
        and tstzrange(sl2.starts_at, sl2.ends_at, '[)') && tstzrange(sl.starts_at, sl.ends_at, '[)'))
  limit 1;
  if v_who is not null then
    perform app.fail('KR_PILOT_OVERLAP', format('%s est déjà inscrit(e) sur une session au même moment.', v_who), v_who);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Bons cadeaux : débit / recrédit
-- -----------------------------------------------------------------------------
create or replace function app.redeem_gift_card(
  p_code text, p_product_id uuid, p_max_cents integer, p_booking_id uuid)
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_card    public.gift_cards;
  v_applied integer;
begin
  select * into v_card from public.gift_cards
   where code = upper(trim(p_code)) for update;
  if v_card.id is null or v_card.status in ('pending_payment', 'disabled') then
    perform app.fail('KR_GIFT_CARD_INVALID', 'Code de bon cadeau invalide.');
  end if;
  if v_card.status = 'expired' or v_card.expires_at <= now() then
    perform app.fail('KR_GIFT_CARD_EXPIRED', 'Ce bon cadeau a expiré.');
  end if;
  if v_card.balance_cents <= 0 then
    perform app.fail('KR_GIFT_CARD_EMPTY', 'Ce bon cadeau a déjà été utilisé.');
  end if;
  if v_card.kind = 'product' and v_card.product_id is distinct from p_product_id then
    perform app.fail('KR_GIFT_CARD_WRONG_PRODUCT', 'Ce bon cadeau est valable pour une autre activité.');
  end if;

  v_applied := least(v_card.balance_cents, p_max_cents);
  if v_applied <= 0 then
    return 0;
  end if;

  update public.gift_cards
     set balance_cents = balance_cents - v_applied,
         status = case when balance_cents - v_applied = 0 then 'exhausted'::public.gift_card_status else status end
   where id = v_card.id;

  insert into public.gift_card_transactions (gift_card_id, booking_id, kind, amount_cents, balance_after_cents, created_by)
  values (v_card.id, p_booking_id, 'redeem', -v_applied, v_card.balance_cents - v_applied, auth.uid());
  return v_applied;
end;
$$;

-- Recrédite sur leurs bons d'origine les montants débités pour une réservation.
create or replace function app.refund_gift_cards_for_booking(p_booking_id uuid)
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r       record;
  v_total integer := 0;
  v_card  public.gift_cards;
begin
  for r in
    select t.gift_card_id, -sum(t.amount_cents)::integer as net_debit
    from public.gift_card_transactions t
    where t.booking_id = p_booking_id and t.kind in ('redeem', 'refund')
    group by t.gift_card_id
    having sum(t.amount_cents) < 0
  loop
    select * into v_card from public.gift_cards where id = r.gift_card_id for update;
    update public.gift_cards
       set balance_cents = balance_cents + r.net_debit,
           status = case when status in ('exhausted', 'expired') then 'active'::public.gift_card_status else status end,
           -- un bon recrédité reste utilisable au moins 3 mois
           expires_at = greatest(expires_at, now() + interval '3 months')
     where id = r.gift_card_id;
    insert into public.gift_card_transactions (gift_card_id, booking_id, kind, amount_cents, balance_after_cents, note, created_by)
    values (r.gift_card_id, p_booking_id, 'refund', r.net_debit, v_card.balance_cents + r.net_debit,
            'Annulation de réservation', auth.uid());
    v_total := v_total + r.net_debit;
  end loop;
  return v_total;
end;
$$;

-- Émet un bon cadeau (code unique), actif ou en attente de paiement.
create or replace function app.issue_gift_card(
  p_kind public.gift_card_kind, p_source public.gift_card_source, p_amount_cents integer,
  p_product_id uuid, p_active boolean, p_purchaser uuid, p_recipient_name text,
  p_recipient_email text, p_message text, p_origin_booking uuid default null)
returns public.gift_cards language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_code text;
  v_card public.gift_cards;
  v_months integer := app.setting_int('gift_card_validity_months', 12);
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    perform app.fail('KR_GIFT_CARD_AMOUNT', 'Montant du bon cadeau invalide.');
  end if;
  loop
    v_code := 'KDO-' || app.random_code(4) || '-' || app.random_code(4) || '-' || app.random_code(4);
    exit when not exists (select 1 from public.gift_cards where code = v_code);
  end loop;

  insert into public.gift_cards (code, kind, source, product_id, initial_amount_cents, balance_cents, status,
                                 purchaser_customer_id, recipient_name, recipient_email, message,
                                 origin_booking_id, issued_at, expires_at, created_by)
  values (v_code, p_kind, p_source, p_product_id, p_amount_cents, p_amount_cents,
          case when p_active then 'active' else 'pending_payment' end::public.gift_card_status,
          p_purchaser, coalesce(p_recipient_name, ''), nullif(lower(trim(p_recipient_email)), ''),
          coalesce(p_message, ''), p_origin_booking,
          case when p_active then now() end,
          case when p_active then now() + make_interval(months => v_months) end,
          auth.uid())
  returning * into v_card;

  if p_active then
    insert into public.gift_card_transactions (gift_card_id, kind, amount_cents, balance_after_cents, created_by)
    values (v_card.id, 'issue', p_amount_cents, p_amount_cents, auth.uid());
  end if;
  return v_card;
end;
$$;

-- -----------------------------------------------------------------------------
-- Représentation JSON d'une réservation (emails, pages client, check-in)
-- -----------------------------------------------------------------------------
create or replace function app.booking_json(p_booking_id uuid, p_include_private boolean default false)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id,
    'reference', b.reference,
    'qr_token', b.qr_token,
    'status', b.status,
    'source', b.source,
    'starts_at', b.starts_at,
    'booking_date', b.booking_date,
    'karts', b.karts,
    'participants_count', b.participants_count,
    'unit_price_cents', b.unit_price_cents,
    'total_cents', b.total_cents,
    'gift_card_applied_cents', b.gift_card_applied_cents,
    'paid_cents', app.booking_paid_cents(b.id),
    'amount_due_cents', greatest(b.total_cents - b.gift_card_applied_cents - app.booking_paid_cents(b.id), 0),
    'cancellation_outcome', b.cancellation_outcome,
    'product', case when pr.id is not null then jsonb_build_object('id', pr.id, 'slug', pr.slug, 'name', pr.name, 'kind', pr.kind) end,
    'event', case when ev.id is not null then jsonb_build_object('id', ev.id, 'slug', ev.slug, 'title', ev.title, 'starts_at', ev.starts_at, 'ends_at', ev.ends_at) end,
    'customer', jsonb_build_object('first_name', c.first_name, 'last_name', c.last_name, 'email', c.email, 'phone', c.phone),
    'sessions', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'slot_id', sl.id, 'track_id', t.id, 'track', t.short_name,
                 'starts_at', sl.starts_at, 'ends_at', sl.ends_at, 'karts', bs.karts)
               order by sl.starts_at)
        from public.booking_sessions bs
        join public.slots sl on sl.id = bs.slot_id
        join public.tracks t on t.id = sl.track_id
        where bs.booking_id = b.id), '[]'::jsonb),
    'participants', coalesce((
        select jsonb_agg(
                 jsonb_build_object('id', p.id, 'role', p.role, 'first_name', p.first_name, 'last_name', p.last_name,
                                    'waiver_signed', p.waiver_signed_at is not null,
                                    'checked_in', p.checked_in_at is not null)
                 || case when p_include_private then jsonb_build_object(
                         'birth_date', p.birth_date, 'height_cm', p.height_cm, 'height_certified', p.height_certified,
                         'waiver_signed_by', p.waiver_signed_by, 'extra', p.extra) else '{}'::jsonb end
               order by p.role, p.created_at)
        from public.booking_participants p where p.booking_id = b.id), '[]'::jsonb)
  )
  || case when p_include_private then jsonb_build_object(
       'customer_id', c.id, 'customer_note', b.customer_note, 'internal_note', b.internal_note,
       'chrono_validated', c.chrono_validated, 'created_at', b.created_at, 'checked_in_at', b.checked_in_at)
     else '{}'::jsonb end
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  left join public.products pr on pr.id = b.product_id
  left join public.events ev on ev.id = b.event_id
  where b.id = p_booking_id
$$;

-- -----------------------------------------------------------------------------
-- Transforme un hold en réservation (parcours public et saisie admin).
-- -----------------------------------------------------------------------------
create or replace function app.create_booking_from_hold(
  p_hold_token uuid, p_customer_id uuid, p_participants jsonb, p_source public.booking_source,
  p_online boolean, p_gift_card_code text, p_customer_note text, p_status public.booking_status,
  p_require_participants boolean)
returns uuid language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_holds    public.booking_holds[];
  v_h        public.booking_holds;
  v_product  public.products;
  v_slot_ids uuid[];
  v_first    public.slots;
  v_karts    integer;
  v_ref      text;
  v_id       uuid;
  v_total    integer;
  v_gift     integer := 0;
  v_count    integer;
  r          record;
begin
  select array_agg(h order by h.seq) into v_holds
  from public.booking_holds h
  where h.hold_token = p_hold_token and h.booking_id is null;

  if v_holds is null then
    perform app.fail('KR_HOLD_NOT_FOUND', 'Votre sélection a expiré, merci de choisir à nouveau un créneau.');
  end if;
  v_slot_ids := array(select (x).slot_id from unnest(v_holds) x);

  -- Verrou des créneaux puis re-vérification complète
  perform 1 from public.slots where id = any (v_slot_ids) order by id for update;
  perform 1 from public.booking_holds where hold_token = p_hold_token for update;

  foreach v_h in array v_holds loop
    if v_h.expires_at <= now() then
      perform app.fail('KR_HOLD_EXPIRED', 'Votre sélection a expiré, merci de choisir à nouveau un créneau.');
    end if;
  end loop;
  v_h := v_holds[1];
  v_karts := v_h.karts;

  select * into v_product from public.products where id = v_h.product_id;
  perform app.validate_slot_selection(v_product, v_slot_ids, p_online, false);   -- blocages, activité, saison

  for r in select x.slot_id, x.remaining
           from app.slots_remaining(v_slot_ids, v_product.vehicle_type_id, p_online, p_hold_token, null) x
  loop
    if r.remaining < v_karts then
      perform app.fail('KR_SLOT_FULL', 'Ce créneau vient d''être complété.', r.slot_id::text);
    end if;
  end loop;

  select sl.* into v_first from public.slots sl
   where sl.id = any (v_slot_ids) order by sl.starts_at limit 1;

  loop
    v_ref := 'KR-' || app.random_code(6);
    exit when not exists (select 1 from public.bookings where reference = v_ref);
  end loop;

  v_total := v_product.price_cents * v_karts;

  insert into public.bookings (
    reference, customer_id, product_id, status, source, starts_at, booking_date, karts,
    participants_count, unit_price_cents, total_cents, vat_rate_bp, customer_note, created_by)
  values (
    v_ref, p_customer_id, v_product.id, p_status, p_source, v_first.starts_at, app.local_date(v_first.starts_at), v_karts,
    greatest(v_karts, coalesce(jsonb_array_length(p_participants), 0)), v_product.price_cents, v_total,
    v_product.vat_rate_bp, left(coalesce(p_customer_note, ''), 2000),
    case when p_source <> 'online' then auth.uid() end)
  returning id into v_id;

  insert into public.booking_sessions (booking_id, slot_id, vehicle_type_id, karts, seq)
  select v_id, (x).slot_id, (x).vehicle_type_id, (x).karts, (x).seq from unnest(v_holds) x;

  if p_require_participants or coalesce(jsonb_array_length(p_participants), 0) > 0 then
    v_count := app.add_participants(v_id, v_product, app.local_date(v_first.starts_at), v_karts,
                                    p_participants, p_online);
    update public.bookings
       set participants_count = v_count,
           waiver_version = case when p_online then (select version from public.waiver_versions where is_current) end
     where id = v_id;
    perform app.assert_no_pilot_overlap(v_id);
  end if;

  if nullif(trim(coalesce(p_gift_card_code, '')), '') is not null then
    v_gift := app.redeem_gift_card(p_gift_card_code, v_product.id, v_total, v_id);
    update public.bookings set gift_card_applied_cents = v_gift where id = v_id;
  end if;

  delete from public.booking_holds where hold_token = p_hold_token;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Déplace les sessions d'une réservation vers de nouveaux créneaux.
-- -----------------------------------------------------------------------------
create or replace function app.move_booking(
  p_booking_id uuid, p_slot_ids uuid[], p_online boolean, p_exclude_hold uuid default null)
returns void language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_b        public.bookings;
  v_product  public.products;
  v_ids      uuid[];
  v_all      uuid[];
  v_first    public.slots;
  r          record;
begin
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null or v_b.product_id is null then
    perform app.fail('KR_BOOKING_NOT_FOUND');
  end if;
  select * into v_product from public.products where id = v_b.product_id;

  v_all := array(select bs.slot_id from public.booking_sessions bs where bs.booking_id = p_booking_id) || p_slot_ids;
  perform 1 from public.slots where id = any (v_all) order by id for update;

  v_ids := app.validate_slot_selection(v_product, p_slot_ids, p_online);

  for r in select x.slot_id, x.remaining
           from app.slots_remaining(v_ids, v_product.vehicle_type_id, p_online, p_exclude_hold, p_booking_id) x
  loop
    if r.remaining < v_b.karts then
      perform app.fail('KR_SLOT_FULL', 'Capacité insuffisante sur le créneau choisi.', r.slot_id::text);
    end if;
  end loop;

  delete from public.booking_sessions where booking_id = p_booking_id;
  insert into public.booking_sessions (booking_id, slot_id, vehicle_type_id, karts, seq)
  select p_booking_id, x.id, v_product.vehicle_type_id, v_b.karts, x.ord::integer
  from unnest(v_ids) with ordinality as x(id, ord);

  select sl.* into v_first from public.slots sl where sl.id = v_ids[1];
  update public.bookings
     set starts_at = v_first.starts_at,
         booking_date = app.local_date(v_first.starts_at),
         status = case when status = 'reschedule_required' then 'confirmed'::public.booking_status else status end,
         reminder_sent_at = null
   where id = p_booking_id;

  if p_exclude_hold is not null then
    delete from public.booking_holds where hold_token = p_exclude_hold;
  end if;

  -- Les pilotes de la réservation ne doivent pas se retrouver en double ailleurs
  perform pg_advisory_xact_lock(hashtextextended('pilot:' || p.pilot_key, 0))
  from public.booking_participants p where p.booking_id = p_booking_id order by p.pilot_key;
  perform app.assert_no_pilot_overlap(p_booking_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Annulation (client, dirigeant ou blocage). p_outcome :
--   full_refund : bons recrédités ; montant payé sur place → "refund_due"
--   credit      : bons recrédités ; montant payé → avoir (bon cadeau)
--   none        : aucune restitution
-- -----------------------------------------------------------------------------
create or replace function app.apply_cancellation(
  p_booking_id uuid, p_outcome text, p_reason text, p_template text, p_notify boolean default true)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_b       public.bookings;
  v_paid    integer;
  v_gift    integer := 0;
  v_credit  public.gift_cards;
  v_outcome text := p_outcome;
  v_result  jsonb;
  v_slots   uuid[];
begin
  if p_outcome not in ('full_refund', 'credit', 'none') then
    perform app.fail('KR_OUTCOME_INVALID');
  end if;
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then
    perform app.fail('KR_BOOKING_NOT_FOUND');
  end if;
  if v_b.status in ('cancelled', 'completed', 'no_show', 'checked_in') then
    perform app.fail('KR_BOOKING_NOT_CANCELLABLE', 'Cette réservation ne peut plus être annulée.');
  end if;

  -- Libération de capacité : verrou des créneaux pour sérialiser avec les réservations
  v_slots := array(select bs.slot_id from public.booking_sessions bs where bs.booking_id = p_booking_id);
  perform 1 from public.slots where id = any (v_slots) order by id for update;

  v_paid := app.booking_paid_cents(p_booking_id);
  if p_outcome in ('full_refund', 'credit') then
    v_gift := app.refund_gift_cards_for_booking(p_booking_id);
  end if;

  if v_paid > 0 and p_outcome = 'full_refund' then
    v_outcome := 'refund_due';
  elsif v_paid > 0 and p_outcome = 'credit' then
    v_credit := app.issue_gift_card('amount', 'credit', v_paid, null, true, v_b.customer_id,
                                    '', (select email from public.customers where id = v_b.customer_id),
                                    'Avoir suite à l''annulation ' || v_b.reference, v_b.id);
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancel_reason = left(coalesce(p_reason, ''), 500), cancellation_outcome = v_outcome
   where id = p_booking_id;
  delete from public.booking_holds where booking_id = p_booking_id;

  v_result := jsonb_build_object(
    'booking_id', v_b.id, 'reference', v_b.reference, 'outcome', v_outcome,
    'gift_card_recredited_cents', v_gift, 'paid_cents', v_paid,
    'credit_code', v_credit.code, 'credit_amount_cents', v_credit.initial_amount_cents);

  if p_notify then
    perform app.enqueue_email(p_template, (select email from public.customers where id = v_b.customer_id),
                              app.booking_json(v_b.id) || jsonb_build_object('cancellation', v_result, 'reason', p_reason));
    perform app.enqueue_email('owner_booking_cancelled', app.setting_text('notify_email'),
                              app.booking_json(v_b.id) || jsonb_build_object('cancellation', v_result, 'reason', p_reason));
  end if;
  return v_result;
end;
$$;
