-- =============================================================================
-- Karting Roussillon — 11 · Tâches planifiées (pg_cron)
-- Les jobs appellent des fonctions `app.cron_*` idempotentes, testables à la main.
-- =============================================================================

-- Purge des holds expirés
create or replace function app.cron_purge_holds()
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.booking_holds where expires_at < now() - interval '1 minute';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Fenêtre glissante de créneaux (aujourd'hui → horizon)
create or replace function app.cron_generate_slots()
returns integer language sql volatile security definer
set search_path = ''
as $$
  select app.generate_slots(app.local_date(now()),
                            app.local_date(now()) + app.setting_int('slot_generation_horizon_days', 120))
$$;

-- Rappels J-1 : exécuté toutes les heures, n'agit qu'à partir de l'heure locale
-- configurée (reminder_local_hour), une seule fois par réservation.
create or replace function app.cron_enqueue_reminders()
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
  v_json jsonb;
begin
  if extract(hour from now() at time zone app.tz()) < app.setting_int('reminder_local_hour', 10) then
    return 0;
  end if;
  for r in
    select b.id from public.bookings b
    where b.booking_date = app.local_date(now()) + 1
      and b.status in ('confirmed', 'pending')
      and b.reminder_sent_at is null
    for update skip locked
  loop
    v_json := app.booking_json(r.id);
    perform app.enqueue_email(case when v_json ->> 'event' is not null then 'event_reminder' else 'booking_reminder' end,
                              v_json #>> '{customer,email}', v_json);
    update public.bookings set reminder_sent_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Expiration des bons cadeaux (solde restant sorti du passif)
create or replace function app.cron_expire_gift_cards()
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select * from public.gift_cards
    where status = 'active' and expires_at <= now()
    for update skip locked
  loop
    if r.balance_cents > 0 then
      insert into public.gift_card_transactions (gift_card_id, kind, amount_cents, balance_after_cents, note)
      values (r.id, 'expire', -r.balance_cents, 0, 'Expiration automatique');
    end if;
    update public.gift_cards set status = 'expired', balance_cents = 0 where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Clôture des réservations passées (confirmées / présentes → terminées).
-- Les absences (no_show) sont saisies manuellement par le personnel.
create or replace function app.cron_complete_past_bookings()
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare n integer;
begin
  update public.bookings b set status = 'completed'
  where b.status in ('confirmed', 'checked_in', 'pending')
    and coalesce(
          (select max(sl.ends_at) from public.booking_sessions bs join public.slots sl on sl.id = bs.slot_id where bs.booking_id = b.id),
          (select e.ends_at from public.events e where e.id = b.event_id)) < now() - interval '6 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Nettoyage de la file d'emails (90 jours)
create or replace function app.cron_prune_outbox()
returns integer language plpgsql volatile security definer
set search_path = ''
as $$
declare n integer;
begin
  delete from public.email_outbox where status in ('sent', 'skipped') and created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function app.staff_role(), app.is_staff(), app.is_owner(), app.current_customer_id()
  to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Planification (uniquement si pg_cron est disponible : Supabase l'est,
-- un Postgres local de test ne l'est pas forcément)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('kr_purge_holds',        '* * * * *',  'select app.cron_purge_holds()');
    perform cron.schedule('kr_generate_slots',     '15 2 * * *', 'select app.cron_generate_slots()');
    perform cron.schedule('kr_reminders',          '5 * * * *',  'select app.cron_enqueue_reminders()');
    perform cron.schedule('kr_expire_gift_cards',  '30 2 * * *', 'select app.cron_expire_gift_cards()');
    perform cron.schedule('kr_complete_bookings',  '45 2 * * *', 'select app.cron_complete_past_bookings()');
    perform cron.schedule('kr_prune_outbox',       '0 3 * * 0',  'select app.cron_prune_outbox()');
    -- Le job d'envoi des emails (pg_net → Edge Function) est ajouté en phase 3.
  else
    raise notice 'pg_cron indisponible : tâches planifiées non créées.';
  end if;
end;
$$;
