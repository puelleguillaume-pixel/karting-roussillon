-- =============================================================================
-- Karting Roussillon — 14 · Bons cadeaux : commande en ligne, activation au
-- règlement, envoi (acheteur et/ou bénéficiaire), usage pour les trackdays
--
-- Sans paiement en ligne : la commande crée un bon « en attente de règlement »
-- dont le code n'est jamais communiqué. Le personnel l'active à l'encaissement
-- (admin_activate_gift_card) : le bon part alors par email, en PDF.
-- =============================================================================

alter table public.gift_cards
  add column order_reference text unique,
  add column deliver_to text not null default 'buyer' check (deliver_to in ('buyer', 'recipient')),
  add column ordered_at timestamptz;

-- Montants proposés à la commande (modifiables dans l'admin)
insert into public.settings (key, value, description, is_public) values
  ('gift_card_min_cents', '1000', 'Bon cadeau « montant libre » : montant minimum (centimes)', true),
  ('gift_card_max_cents', '50000', 'Bon cadeau « montant libre » : montant maximum (centimes)', true),
  ('gift_card_presets', '[2000, 3000, 5000, 10000]', 'Montants proposés en un clic (centimes)', true)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Émission d'un bon : created_by ne désigne que le personnel (une commande
-- passée par un client connecté ne doit pas y inscrire son compte).
-- -----------------------------------------------------------------------------
create or replace function app.issue_gift_card(
  p_kind public.gift_card_kind, p_source public.gift_card_source, p_amount_cents integer,
  p_product_id uuid, p_active boolean, p_purchaser uuid, p_recipient_name text,
  p_recipient_email text, p_message text, p_origin_booking uuid default null)
returns public.gift_cards language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_code   text;
  v_card   public.gift_cards;
  v_months integer := app.setting_int('gift_card_validity_months', 12);
  v_staff  uuid := case when app.is_staff() then auth.uid() end;
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
          v_staff)
  returning * into v_card;

  if p_active then
    insert into public.gift_card_transactions (gift_card_id, kind, amount_cents, balance_after_cents, created_by)
    values (v_card.id, 'issue', p_amount_cents, p_amount_cents, v_staff);
  end if;
  return v_card;
end;
$$;
revoke execute on function app.issue_gift_card(public.gift_card_kind, public.gift_card_source, integer, uuid, boolean, uuid, text, text, text, uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Emails d'un bon activé : l'acheteur reçoit toujours le bon ; le bénéficiaire
-- aussi si l'acheteur a demandé l'envoi direct (ou s'il n'y a pas d'acheteur).
-- -----------------------------------------------------------------------------
create or replace function app.enqueue_gift_card_emails(p_card_id uuid)
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_card    public.gift_cards;
  v_buyer   public.customers;
  v_product text;
  v_payload jsonb;
  v_sent    integer := 0;
  v_direct  boolean;
begin
  select * into v_card from public.gift_cards where id = p_card_id;
  if v_card.id is null or v_card.status <> 'active' then
    return 0;
  end if;
  select * into v_buyer from public.customers where id = v_card.purchaser_customer_id;
  select name into v_product from public.products where id = v_card.product_id;
  v_direct := v_card.deliver_to = 'recipient' and v_card.recipient_email is not null;

  v_payload := jsonb_build_object(
    'code', v_card.code, 'amount_cents', v_card.initial_amount_cents, 'kind', v_card.kind,
    'product', v_product, 'recipient_name', v_card.recipient_name, 'message', v_card.message,
    'expires_at', v_card.expires_at, 'order_reference', v_card.order_reference,
    'buyer_first_name', v_buyer.first_name,
    'buyer_name', nullif(trim(coalesce(v_buyer.first_name, '') || ' ' || coalesce(v_buyer.last_name, '')), ''));

  if v_buyer.email is not null then
    perform app.enqueue_email('gift_card_issued', v_buyer.email,
      v_payload || jsonb_build_object('audience', 'buyer', 'sent_to_recipient', v_direct));
    v_sent := v_sent + 1;
  end if;
  if v_card.recipient_email is not null and (v_direct or v_buyer.email is null)
     and v_card.recipient_email is distinct from v_buyer.email then
    perform app.enqueue_email('gift_card_issued', v_card.recipient_email, v_payload || jsonb_build_object('audience', 'recipient'));
    v_sent := v_sent + 1;
  end if;
  return v_sent;
end;
$$;

-- -----------------------------------------------------------------------------
-- Commande publique
-- p = {kind: 'amount'|'product', amount_cents | product_id, recipient_name,
--      recipient_email, deliver_to: 'buyer'|'recipient', message,
--      buyer: {first_name, last_name, email, phone}, accept_terms}
-- -----------------------------------------------------------------------------
create or replace function public.order_gift_card(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_kind       public.gift_card_kind;
  v_amount     integer;
  v_product    public.products;
  v_recipient  text := left(trim(coalesce(p ->> 'recipient_name', '')), 80);
  v_rec_email  text := nullif(lower(trim(coalesce(p ->> 'recipient_email', ''))), '');
  v_deliver    text := coalesce(nullif(p ->> 'deliver_to', ''), 'buyer');
  v_message    text := left(trim(coalesce(p ->> 'message', '')), 300);
  v_customer   uuid;
  v_card       public.gift_cards;
  v_reference  text;
  v_min        integer := app.setting_int('gift_card_min_cents', 1000);
  v_max        integer := app.setting_int('gift_card_max_cents', 50000);
  v_payload    jsonb;
  v_buyer      public.customers;
begin
  if not coalesce((p ->> 'accept_terms')::boolean, false) then
    perform app.fail('KR_TERMS_REQUIRED', 'Merci d''accepter les conditions générales de vente.');
  end if;
  begin
    v_kind := (p ->> 'kind')::public.gift_card_kind;
  exception when others then
    v_kind := null;
  end;
  if v_kind is null then
    perform app.fail('KR_GIFT_CARD_KIND', 'Choisissez un montant ou une activité.');
  end if;

  if v_kind = 'amount' then
    v_amount := nullif(p ->> 'amount_cents', '')::integer;
    if v_amount is null or v_amount < v_min or v_amount > v_max then
      perform app.fail('KR_GIFT_CARD_AMOUNT',
        format('Montant entre %s et %s €.', v_min / 100, v_max / 100));
    end if;
  else
    select * into v_product from public.products
     where id = nullif(p ->> 'product_id', '')::uuid and is_active and price_cents is not null;
    if v_product.id is null then
      perform app.fail('KR_PRODUCT_NOT_FOUND', 'Cette activité ne peut pas être offerte en bon cadeau.');
    end if;
    v_amount := v_product.price_cents;
  end if;

  if v_recipient = '' then
    perform app.fail('KR_GIFT_CARD_RECIPIENT', 'Indiquez le prénom du bénéficiaire.');
  end if;
  if v_deliver not in ('buyer', 'recipient') then
    perform app.fail('KR_GIFT_CARD_DELIVERY');
  end if;
  if v_rec_email is not null and v_rec_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.fail('KR_EMAIL_INVALID', 'Adresse email du bénéficiaire invalide.');
  end if;
  if v_deliver = 'recipient' and v_rec_email is null then
    perform app.fail('KR_GIFT_CARD_DELIVERY', 'Indiquez l''email du bénéficiaire pour un envoi direct.');
  end if;

  v_customer := app.upsert_customer(coalesce(p -> 'buyer', '{}'::jsonb), true);
  if (select count(*) from public.gift_cards
      where purchaser_customer_id = v_customer and ordered_at > now() - interval '1 hour') >= 5 then
    perform app.fail('KR_RATE_LIMITED', 'Trop de commandes envoyées, merci de réessayer plus tard.');
  end if;

  v_card := app.issue_gift_card(v_kind, 'sale', v_amount, v_product.id, false, v_customer,
                                v_recipient, v_rec_email, v_message);
  loop
    v_reference := 'BC-' || app.random_code(6);
    exit when not exists (select 1 from public.gift_cards where order_reference = v_reference);
  end loop;
  update public.gift_cards
     set order_reference = v_reference, deliver_to = v_deliver, ordered_at = now()
   where id = v_card.id;

  select * into v_buyer from public.customers where id = v_customer;
  v_payload := jsonb_build_object(
    'order_reference', v_reference, 'amount_cents', v_amount, 'kind', v_kind, 'product', v_product.name,
    'recipient_name', v_recipient, 'recipient_email', v_rec_email, 'deliver_to', v_deliver, 'message', v_message,
    'buyer', jsonb_build_object('first_name', v_buyer.first_name, 'last_name', v_buyer.last_name,
                                'email', v_buyer.email, 'phone', v_buyer.phone));
  perform app.enqueue_email('gift_card_ordered', v_buyer.email, v_payload);
  perform app.enqueue_email('owner_gift_card_order', app.setting_text('notify_email'), v_payload);

  return jsonb_build_object('order_reference', v_reference, 'amount_cents', v_amount, 'kind', v_kind,
                            'product', v_product.name, 'recipient_name', v_recipient, 'deliver_to', v_deliver);
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin : émission et activation passent par l'envoi commun ci-dessus
-- -----------------------------------------------------------------------------
create or replace function public.admin_issue_gift_card(p jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_kind      public.gift_card_kind := coalesce((p ->> 'kind')::public.gift_card_kind, 'amount');
  v_product   public.products;
  v_amount    integer := (p ->> 'amount_cents')::integer;
  v_paid      boolean := jsonb_typeof(p -> 'payment') = 'object';
  v_purchaser uuid;
  v_card      public.gift_cards;
begin
  perform app.require_staff();
  if v_kind = 'product' then
    select * into v_product from public.products where id = (p ->> 'product_id')::uuid;
    if v_product.id is null or v_product.price_cents is null then
      perform app.fail('KR_PRODUCT_NOT_FOUND', 'Produit sans prix : utilisez un bon « montant ».');
    end if;
    v_amount := coalesce(v_amount, v_product.price_cents);
  end if;
  v_purchaser := coalesce(nullif(p ->> 'purchaser_customer_id', '')::uuid,
                          case when jsonb_typeof(p -> 'purchaser') = 'object' then app.upsert_customer(p -> 'purchaser', false) end);

  v_card := app.issue_gift_card(v_kind, 'manual', v_amount, v_product.id, v_paid, v_purchaser,
                                p ->> 'recipient_name', p ->> 'recipient_email', p ->> 'message');
  if coalesce(p ->> 'deliver_to', '') = 'recipient' then
    update public.gift_cards set deliver_to = 'recipient' where id = v_card.id returning * into v_card;
  end if;
  if v_paid then
    perform public.admin_record_payment(jsonb_build_object('gift_card_id', v_card.id, 'amount_cents', v_amount,
                                                           'method', p #>> '{payment,method}', 'note', 'Vente bon cadeau'));
    if coalesce((p ->> 'send_email')::boolean, true) then
      perform app.enqueue_gift_card_emails(v_card.id);
    end if;
  end if;
  perform app.audit('gift_card_issue', 'gift_cards', v_card.id::text, null, to_jsonb(v_card));
  return to_jsonb(v_card);
end;
$$;

create or replace function public.admin_activate_gift_card(p_gift_card_id uuid, p_method public.payment_method)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_card public.gift_cards;
begin
  perform app.require_staff();
  select * into v_card from public.gift_cards where id = p_gift_card_id for update;
  if v_card.id is null or v_card.status <> 'pending_payment' then
    perform app.fail('KR_GIFT_CARD_INVALID', 'Bon introuvable ou déjà actif.');
  end if;
  update public.gift_cards
     set status = 'active', issued_at = now(),
         expires_at = now() + make_interval(months => app.setting_int('gift_card_validity_months', 12))
   where id = p_gift_card_id
  returning * into v_card;
  insert into public.gift_card_transactions (gift_card_id, kind, amount_cents, balance_after_cents, created_by)
  values (v_card.id, 'issue', v_card.initial_amount_cents, v_card.balance_cents, auth.uid());
  perform public.admin_record_payment(jsonb_build_object('gift_card_id', v_card.id, 'amount_cents', v_card.initial_amount_cents,
                                                         'method', p_method, 'note', 'Vente bon cadeau'));
  perform app.enqueue_gift_card_emails(v_card.id);
  perform app.audit('gift_card_activate', 'gift_cards', v_card.id::text, null, jsonb_build_object('method', p_method));
  return to_jsonb(v_card);
end;
$$;

-- -----------------------------------------------------------------------------
-- Compte client : le code d'un bon non réglé n'est jamais communiqué
-- -----------------------------------------------------------------------------
create or replace function public.my_gift_cards()
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', case when g.status = 'pending_payment' then null else g.code end,
           'order_reference', g.order_reference, 'kind', g.kind, 'status', g.status,
           'initial_amount_cents', g.initial_amount_cents, 'balance_cents', g.balance_cents,
           'issued_at', g.issued_at, 'expires_at', g.expires_at,
           'recipient_name', g.recipient_name, 'message', g.message,
           'product', (select p.name from public.products p where p.id = g.product_id))
         order by g.created_at desc), '[]'::jsonb)
  from public.gift_cards g
  where g.purchaser_customer_id = app.current_customer_id() and auth.uid() is not null
$$;

-- -----------------------------------------------------------------------------
-- Trackdays : un bon « montant » peut régler tout ou partie de l'inscription
-- -----------------------------------------------------------------------------
drop function public.book_event(uuid, jsonb, jsonb, boolean, boolean, text);

create function public.book_event(
  p_event_id uuid, p_customer jsonb, p_participants jsonb,
  p_accept_terms boolean, p_accept_waiver boolean, p_customer_note text default '',
  p_gift_card_code text default null)
returns jsonb language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_e        public.events;
  v_taken    integer;
  v_n        integer;
  v_customer uuid;
  v_id       uuid;
  v_ref      text;
  v_waiver   integer;
  p          jsonb;
  v_birth    date;
  v_first    text;
  v_last     text;
  v_keys     text[] := '{}';
  v_json     jsonb;
begin
  if not coalesce(p_accept_terms, false) then
    perform app.fail('KR_TERMS_REQUIRED', 'Merci d''accepter les conditions générales de vente.');
  end if;
  if not coalesce(p_accept_waiver, false) then
    perform app.fail('KR_WAIVER_REQUIRED', 'Merci d''accepter la décharge de responsabilité.');
  end if;
  select * into v_e from public.events where id = p_event_id for update;
  if v_e.id is null or not v_e.is_published or not v_e.is_bookable or v_e.starts_at <= now() then
    perform app.fail('KR_EVENT_NOT_BOOKABLE', 'Cet événement n''est pas ouvert à la réservation.');
  end if;
  v_n := coalesce(jsonb_array_length(p_participants), 0);
  if v_n < 1 or v_n > app.setting_int('max_karts_per_booking', 10) then
    perform app.fail('KR_PARTICIPANTS_COUNT', 'Nombre de participants invalide.');
  end if;
  select coalesce(sum(b.participants_count), 0) into v_taken
  from public.bookings b where b.event_id = v_e.id and app.is_active_status(b.status);
  if v_taken + v_n > v_e.capacity then
    perform app.fail('KR_EVENT_FULL', format('Il reste %s place(s).', greatest(v_e.capacity - v_taken, 0)));
  end if;

  v_customer := app.upsert_customer(p_customer, true);
  loop
    v_ref := 'KR-' || app.random_code(6);
    exit when not exists (select 1 from public.bookings where reference = v_ref);
  end loop;
  select version into v_waiver from public.waiver_versions where is_current;

  insert into public.bookings (reference, customer_id, event_id, status, source, starts_at, booking_date, karts,
                               participants_count, unit_price_cents, total_cents, vat_rate_bp, waiver_version,
                               terms_accepted_at, customer_note)
  values (v_ref, v_customer, v_e.id, 'confirmed', 'online', v_e.starts_at, app.local_date(v_e.starts_at), 0,
          v_n, v_e.price_cents, v_e.price_cents * v_n, v_e.vat_rate_bp, v_waiver, now(),
          left(coalesce(p_customer_note, ''), 2000))
  returning id into v_id;

  for p in select * from jsonb_array_elements(p_participants) loop
    v_first := left(trim(coalesce(p ->> 'first_name', '')), 80);
    v_last  := left(trim(coalesce(p ->> 'last_name', '')), 80);
    begin v_birth := (p ->> 'birth_date')::date; exception when others then v_birth := null; end;
    if v_first = '' or v_last = '' or v_birth is null or v_birth > current_date then
      perform app.fail('KR_PARTICIPANT_NAME', 'Nom, prénom et date de naissance obligatoires pour chaque pilote.');
    end if;
    if app.age_on(v_birth, app.local_date(v_e.starts_at)) < 18 and nullif(trim(coalesce(p ->> 'guardian_name', '')), '') is null then
      perform app.fail('KR_GUARDIAN_REQUIRED', format('%s %s est mineur : représentant légal obligatoire.', v_first, v_last));
    end if;
    if app.pilot_key(v_first, v_last, v_birth) = any (v_keys) then
      perform app.fail('KR_DUPLICATE_PARTICIPANT', 'Un même pilote est saisi deux fois.');
    end if;
    v_keys := array_append(v_keys, app.pilot_key(v_first, v_last, v_birth));
    insert into public.booking_participants (booking_id, role, first_name, last_name, birth_date, pilot_key, extra,
                                             waiver_signed_at, waiver_signed_by, waiver_version)
    values (v_id, 'driver', v_first, v_last, v_birth, app.pilot_key(v_first, v_last, v_birth),
            coalesce(p -> 'extra', '{}'::jsonb), now(),
            coalesce(nullif(trim(p ->> 'guardian_name'), ''), v_first || ' ' || v_last), v_waiver);
  end loop;

  -- Bon cadeau : seuls les bons « montant » s'appliquent (pas de produit associé)
  if nullif(trim(coalesce(p_gift_card_code, '')), '') is not null then
    update public.bookings
       set gift_card_applied_cents = app.redeem_gift_card(p_gift_card_code, null, v_e.price_cents * v_n, v_id)
     where id = v_id;
  end if;

  v_json := app.booking_json(v_id);
  perform app.enqueue_email('event_booking_confirmation', v_json #>> '{customer,email}', v_json);
  perform app.enqueue_email('owner_new_booking', app.setting_text('notify_email'), v_json);
  return jsonb_build_object('booking_id', v_id, 'reference', v_ref, 'qr_token', v_json ->> 'qr_token',
                            'total_cents', (v_json ->> 'total_cents')::integer,
                            'gift_card_applied_cents', (v_json ->> 'gift_card_applied_cents')::integer,
                            'amount_due_cents', (v_json ->> 'amount_due_cents')::integer);
end;
$$;

-- -----------------------------------------------------------------------------
-- Droits
-- -----------------------------------------------------------------------------
revoke execute on function public.order_gift_card(jsonb),
  public.book_event(uuid, jsonb, jsonb, boolean, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.order_gift_card(jsonb),
  public.book_event(uuid, jsonb, jsonb, boolean, boolean, text, text)
  to anon, authenticated;
revoke execute on function app.enqueue_gift_card_emails(uuid) from public, anon, authenticated;
