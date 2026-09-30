-- =============================================================================
-- Karting Roussillon — 10 · RLS & privilèges
--
-- Règles :
--   * RLS activée sur toutes les tables, aucune politique d'écriture :
--     toute écriture passe par une RPC SECURITY DEFINER.
--   * anon / authenticated : lecture du catalogue, des horaires, des
--     événements publiés, du contenu publié, des chronos publiés.
--     Créneaux, capacités et blocages ne sont lisibles qu'au travers des RPC
--     (get_availability, get_public_calendar) : aucune note interne exposée.
--   * Client connecté : ses propres données.
--   * staff : lecture de l'exploitation ; owner : en plus paiements, audit,
--     paramètres privés.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Activation RLS
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'staff_roles', 'settings', 'audit_log', 'tracks', 'vehicle_types', 'track_vehicle_capacities', 'products',
    'product_tracks', 'packs', 'opening_hours', 'slots', 'slot_capacities', 'schedule_blocks', 'schedule_block_tracks',
    'track_access_calendar', 'events', 'event_tracks', 'customers', 'requests', 'waiver_versions', 'bookings',
    'booking_sessions', 'booking_participants', 'booking_holds', 'gift_cards', 'gift_card_transactions', 'payments',
    'email_outbox', 'site_content', 'lap_records', 'reviews']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- Pas de FORCE RLS : les fonctions SECURITY DEFINER s'exécutent avec les
-- droits du propriétaire des tables et contournent donc la RLS, ce qui est
-- le comportement voulu (elles portent elles-mêmes les contrôles de rôle).

-- Helpers utilisés dans les politiques
grant execute on function app.staff_role(), app.is_staff(), app.is_owner(), app.current_customer_id()
  to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Catalogue & contenu publics
-- -----------------------------------------------------------------------------
grant select on public.tracks, public.vehicle_types, public.products, public.product_tracks, public.packs,
                public.opening_hours, public.events, public.event_tracks, public.track_access_calendar,
                public.site_content, public.reviews, public.waiver_versions
  to anon, authenticated;

create policy tracks_read on public.tracks for select to anon, authenticated
  using (is_active or (select app.is_staff()));
create policy vehicle_types_read on public.vehicle_types for select to anon, authenticated
  using (is_active or (select app.is_staff()));
create policy products_read on public.products for select to anon, authenticated
  using (is_active or (select app.is_staff()));
create policy product_tracks_read on public.product_tracks for select to anon, authenticated using (true);
create policy packs_read on public.packs for select to anon, authenticated using (true);
create policy opening_hours_read on public.opening_hours for select to anon, authenticated using (true);
create policy events_read on public.events for select to anon, authenticated
  using (is_published or (select app.is_staff()));
create policy event_tracks_read on public.event_tracks for select to anon, authenticated using (true);
create policy track_access_calendar_read on public.track_access_calendar for select to anon, authenticated using (true);
create policy site_content_read on public.site_content for select to anon, authenticated
  using (is_published or (select app.is_staff()));
create policy reviews_read on public.reviews for select to anon, authenticated
  using (is_published or (select app.is_staff()));
create policy waiver_versions_read on public.waiver_versions for select to anon, authenticated
  using (is_current or (select app.is_staff()));

-- Chronos : colonnes publiques uniquement (pas de customer_id / created_by)
grant select (id, track_id, vehicle_type_id, category_label, driver_name, lap_time_ms, recorded_on, is_published)
  on public.lap_records to anon;
grant select on public.lap_records to authenticated;
create policy lap_records_read on public.lap_records for select to anon, authenticated
  using (is_published or (select app.is_staff()));

-- Paramètres : publics pour tous, privés pour l'owner
grant select on public.settings to anon, authenticated;
create policy settings_read on public.settings for select to anon, authenticated
  using (is_public or (select app.is_owner()));

-- -----------------------------------------------------------------------------
-- Exploitation (staff) — lecture seule, écritures par RPC
-- -----------------------------------------------------------------------------
grant select on public.track_vehicle_capacities, public.slots, public.slot_capacities, public.schedule_blocks,
                public.schedule_block_tracks, public.requests, public.booking_holds, public.email_outbox,
                public.staff_roles
  to authenticated;

create policy tvc_staff_read on public.track_vehicle_capacities for select to authenticated using ((select app.is_staff()));
create policy slots_staff_read on public.slots for select to authenticated using ((select app.is_staff()));
create policy slot_capacities_staff_read on public.slot_capacities for select to authenticated using ((select app.is_staff()));
create policy schedule_blocks_staff_read on public.schedule_blocks for select to authenticated using ((select app.is_staff()));
create policy schedule_block_tracks_staff_read on public.schedule_block_tracks for select to authenticated using ((select app.is_staff()));
create policy booking_holds_staff_read on public.booking_holds for select to authenticated using ((select app.is_staff()));
create policy email_outbox_staff_read on public.email_outbox for select to authenticated using ((select app.is_owner()));
create policy staff_roles_read on public.staff_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_owner()));

-- -----------------------------------------------------------------------------
-- Données client : le client voit les siennes, le staff voit tout
-- -----------------------------------------------------------------------------
grant select on public.customers, public.bookings, public.booking_sessions, public.booking_participants,
                public.gift_cards, public.gift_card_transactions
  to authenticated;

create policy customers_read on public.customers for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select app.is_staff()));

create policy requests_read on public.requests for select to authenticated
  using (customer_id = (select app.current_customer_id()) or (select app.is_staff()));

create policy bookings_read on public.bookings for select to authenticated
  using (customer_id = (select app.current_customer_id()) or (select app.is_staff()));

create policy booking_sessions_read on public.booking_sessions for select to authenticated
  using ((select app.is_staff())
         or exists (select 1 from public.bookings b
                    where b.id = booking_id and b.customer_id = (select app.current_customer_id())));

create policy booking_participants_read on public.booking_participants for select to authenticated
  using ((select app.is_staff())
         or exists (select 1 from public.bookings b
                    where b.id = booking_id and b.customer_id = (select app.current_customer_id())));

create policy gift_cards_read on public.gift_cards for select to authenticated
  using ((select app.is_staff()) or purchaser_customer_id = (select app.current_customer_id()));

create policy gift_card_transactions_read on public.gift_card_transactions for select to authenticated
  using ((select app.is_staff())
         or exists (select 1 from public.gift_cards g
                    where g.id = gift_card_id and g.purchaser_customer_id = (select app.current_customer_id())));

-- -----------------------------------------------------------------------------
-- Owner uniquement : paiements (CA), audit
-- -----------------------------------------------------------------------------
grant select on public.payments, public.audit_log to authenticated;
create policy payments_owner_read on public.payments for select to authenticated using ((select app.is_owner()));
create policy audit_log_owner_read on public.audit_log for select to authenticated using ((select app.is_owner()));

-- -----------------------------------------------------------------------------
-- Fonctions : rien n'est exécutable par défaut, puis ouverture explicite
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function app.staff_role(), app.is_staff(), app.is_owner(), app.current_customer_id()
  to anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app revoke execute on functions from public, anon, authenticated;

-- RPC publiques (site, parcours de réservation sans compte)
grant execute on function
  public.get_availability(uuid, date, integer),
  public.get_available_days(uuid, date, date, integer),
  public.create_booking_hold(uuid, uuid[], integer),
  public.release_booking_hold(uuid),
  public.confirm_booking(uuid, jsonb, jsonb, boolean, boolean, text, text),
  public.get_booking_by_token(uuid),
  public.cancel_booking_by_token(uuid),
  public.reschedule_booking_by_token(uuid, uuid),
  public.get_event_availability(uuid),
  public.book_event(uuid, jsonb, jsonb, boolean, boolean, text),
  public.submit_request(public.request_type, jsonb, jsonb),
  public.check_gift_card(text),
  public.get_public_calendar(date, date)
  to anon, authenticated;

-- RPC client connecté
grant execute on function public.my_bookings(), public.claim_customer_profile(text, text, text) to authenticated;

-- RPC admin : exécutables par authenticated, le rôle est contrôlé dans chaque fonction
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\_%'
  loop
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end;
$$;
