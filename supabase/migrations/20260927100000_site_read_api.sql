-- =============================================================================
-- Karting Roussillon — 12 · API de lecture du site vitrine
-- Le front ne lit la base qu'au travers de RPC : un seul appel charge tout ce
-- qui est commun au site (catalogue, contenus, paramètres publics, horaires,
-- avis). Ces fonctions n'exposent que des données publiques ou publiées.
-- =============================================================================

-- Libellé court affiché sur les visuels de kart (ex. « 22 CV », « 390 »)
alter table public.vehicle_types add column short_label text not null default '';

create or replace function public.get_site_bundle()
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'settings', (
      select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
      from public.settings s where s.is_public),
    'content', (
      select coalesce(jsonb_object_agg(c.key, jsonb_build_object('title', c.title, 'body', c.body, 'data', c.data)), '{}'::jsonb)
      from public.site_content c where c.is_published),
    'tracks', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'slug', t.slug, 'name', t.name, 'short_name', t.short_name, 'length_m', t.length_m,
               'usage', t.usage, 'min_age', t.min_age, 'description', t.description,
               'requires_booking', t.requires_booking, 'online_booking_enabled', t.online_booking_enabled,
               'display_on_circuits', t.display_on_circuits, 'image_path', t.image_path, 'sort_order', t.sort_order)
             order by t.sort_order), '[]'::jsonb)
      from public.tracks t where t.is_active),
    'vehicle_types', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', v.id, 'slug', v.slug, 'name', v.name, 'short_label', v.short_label, 'engine', v.engine,
               'description', v.description, 'min_age', v.min_age, 'min_height_cm', v.min_height_cm, 'seats', v.seats,
               'passenger_min_age', v.passenger_min_age, 'passenger_min_height_cm', v.passenger_min_height_cm,
               'is_adapted', v.is_adapted, 'image_path', v.image_path, 'sort_order', v.sort_order)
             order by v.sort_order), '[]'::jsonb)
      from public.vehicle_types v where v.is_active),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', p.id, 'slug', p.slug, 'kind', p.kind, 'name', p.name,
               'short_description', p.short_description, 'description', p.description,
               'vehicle_type_id', p.vehicle_type_id, 'request_type', p.request_type,
               'price_cents', p.price_cents, 'price_label', p.price_label, 'duration_min', p.duration_min,
               'min_age', p.min_age, 'min_height_cm', p.min_height_cm, 'age_label', p.age_label,
               'requires_chrono_validation', p.requires_chrono_validation, 'is_online_bookable', p.is_online_bookable,
               'active_months', p.active_months, 'metadata', p.metadata, 'image_path', p.image_path,
               'is_featured', p.is_featured, 'sort_order', p.sort_order,
               'track_ids', coalesce((select jsonb_agg(pt.track_id) from public.product_tracks pt where pt.product_id = p.id), '[]'::jsonb),
               'pack', (select jsonb_build_object('sessions_count', k.sessions_count, 'session_min', k.session_min,
                                                  'min_gap_min', k.min_gap_min, 'same_day', k.same_day)
                        from public.packs k where k.product_id = p.id))
             order by p.sort_order), '[]'::jsonb)
      from public.products p where p.is_active),
    'opening_hours', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'track_id', o.track_id, 'weekday', o.weekday, 'opens_at', to_char(o.opens_at, 'HH24:MI'),
               'closes_at', to_char(o.closes_at, 'HH24:MI'), 'is_closed', o.is_closed,
               'valid_from', o.valid_from, 'valid_to', o.valid_to, 'priority', o.priority, 'label', o.label)
             order by o.weekday, o.priority desc), '[]'::jsonb)
      from public.opening_hours o
      where o.valid_to is null or o.valid_to >= app.local_date(now())),
    'reviews', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id, 'author_name', r.author_name, 'rating', r.rating, 'body', r.body,
               'source', r.source, 'review_date', r.review_date)
             order by r.sort_order, r.review_date desc nulls last), '[]'::jsonb)
      from (select * from public.reviews where is_published order by sort_order, review_date desc nulls last limit 12) r)
  )
$$;

-- Classement : meilleur tour de chaque pilote, par piste et catégorie
create or replace function public.get_leaderboard(p_per_group integer default 10)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  with best as (
    select distinct on (l.track_id, l.category_label, lower(l.driver_name))
           l.track_id, l.category_label, l.driver_name, l.lap_time_ms, l.recorded_on
    from public.lap_records l
    where l.is_published
    order by l.track_id, l.category_label, lower(l.driver_name), l.lap_time_ms, l.recorded_on
  ),
  ranked as (
    select b.*, row_number() over (partition by b.track_id, b.category_label order by b.lap_time_ms, b.recorded_on) as rank
    from best b
  ),
  groups as (
    select t.id as track_id, t.slug as track_slug, t.short_name as track_name, t.length_m, t.sort_order,
           r.category_label, min(r.lap_time_ms) as best_ms,
           jsonb_agg(jsonb_build_object('rank', r.rank, 'driver_name', r.driver_name,
                                        'lap_time_ms', r.lap_time_ms, 'recorded_on', r.recorded_on)
                     order by r.rank) as records
    from ranked r
    join public.tracks t on t.id = r.track_id
    where r.rank <= least(greatest(coalesce(p_per_group, 10), 1), 50)
    group by t.id, t.slug, t.short_name, t.length_m, t.sort_order, r.category_label
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'track_id', g.track_id, 'track_slug', g.track_slug, 'track_name', g.track_name,
           'track_length_m', g.length_m, 'category_label', g.category_label, 'records', g.records)
         order by g.sort_order, g.best_ms), '[]'::jsonb)
  from groups g
$$;

revoke execute on function public.get_site_bundle(), public.get_leaderboard(integer) from public;
grant execute on function public.get_site_bundle(), public.get_leaderboard(integer) to anon, authenticated;
