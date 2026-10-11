// EL ESTADO DE LA s04, INVENTADO EN SU FORMA, para ensayar el SQL de permisos
// (pruebas/sim-001.mjs y pruebas/sim-001b.mjs parten de exactamente lo mismo).
// Hechos del resumen de la s04 (4-oct-2026, sql/APLICADOS.md): RLS en las 9
// tablas, politicas ALL auth.uid() = user_id en las 7 del simulador, profiles y
// messages solo SELECT, anon y authenticated con todos los grants en las 7,
// session_chart_config.session_id sin FK, user_id nulable en tres tablas,
// session_id nulable en sim_trades, sin indices. Y de la salida real (CTO,
// 4-oct): sim_trades y session_drawings → sim_sessions ON DELETE CASCADE.
export const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b'
export const S1 = '10000000-0000-0000-0000-000000000001', S2 = '10000000-0000-0000-0000-000000000002'
export const SIETE = ['sim_sessions', 'sim_trades', 'session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config']

export const ESTADO = `
create extension if not exists pgcrypto;
do $r$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $r$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
create table public.profiles (id uuid primary key, email text, rol_global text default 'user', simulador_activo boolean default false);
create table public.messages (id uuid primary key default gen_random_uuid(), user_id uuid, texto text);
alter table public.profiles enable row level security;
alter table public.messages enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (auth.uid() = id);
create policy messages_select on public.messages for select to authenticated using (auth.uid() = user_id);
create table public.sim_sessions (id uuid primary key default gen_random_uuid(), user_id uuid, name text, capital numeric, balance numeric);
create table public.sim_trades (id uuid primary key default gen_random_uuid(), user_id uuid,
  session_id uuid references public.sim_sessions(id) on delete cascade, pnl numeric, closed_at timestamptz);
create table public.session_drawings (id uuid primary key default gen_random_uuid(), user_id uuid not null,
  session_id uuid references public.sim_sessions(id) on delete cascade, pair text, data jsonb);
create table public.session_chart_config (id uuid primary key default gen_random_uuid(), user_id uuid not null, session_id uuid, config jsonb);
create table public.sim_drawing_templates (id uuid primary key default gen_random_uuid(), user_id uuid, name text, data text);
create table public.user_chart_config (user_id uuid primary key, config jsonb);
create table public.user_tool_config (user_id uuid primary key, config jsonb);
${SIETE.map(t => `alter table public.${t} enable row level security;
create policy ${t}_policy on public.${t} for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant all on public.${t} to anon, authenticated, service_role;`).join('\n')}
`
export const DATOS = `
insert into sim_sessions (id, user_id, name, capital, balance) values ('${S1}', '${A}', 'uno', 10000, 10000), ('${S2}', '${B}', 'dos', 10000, 10000);
insert into sim_trades (user_id, session_id, pnl, closed_at) values ('${A}', '${S1}', 100, now()), ('${B}', '${S2}', -50, now());
insert into session_drawings (user_id, session_id, pair) values ('${A}', '${S1}', 'EURUSD');
insert into session_chart_config (user_id, session_id, config) values ('${A}', '${S1}', '{}'), ('${B}', '${S2}', '{}');
insert into sim_drawing_templates (user_id, name) values ('${A}', 'plantilla');
insert into user_chart_config values ('${A}', '{}'); insert into user_tool_config values ('${A}', '{}');
`

// ── PRODUCCION SEGUN s04 Y s05 DEL 10-oct-2026 (para sim-003) ───────────────
// Reconstruido del resumen que transmitio el CTO el 11-oct (no filas
// literales): columnas, NOT NULL, defaults, FK y ON DELETE, indices, el
// disparador del cupo, RLS y grants de sim_sessions/sim_trades, profiles con
// plan y simulador_activo (columna 09, boolean nulable, default false),
// pgcrypto 1.3 en el esquema extensions. INVENTADO, porque el resumen no lo
// dice: el texto del RAISE del cupo (solo se sabe P0001), el tipo de
// opened_at/closed_at/created_at (aqui timestamptz), la funcion del trigger
// de plataformas_activas (aqui no hace nada), la RLS de las 5 tablas sin
// sesion economica y si sim_trades.session_id admite nulos. Al final, los
// privilegios por defecto de Supabase en public (todo a anon, authenticated y
// service_role en tablas, funciones y secuencias NUEVAS): sim-003 tiene que
// quitarlos el mismo. Despues se aplica sql/sim-002 tal cual (sus funciones
// existen en produccion, dueño postgres).
export const PRODUCCION = `
do $r$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $r$;
create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, email text,
  rol_global text default 'user', plataformas_activas jsonb, plan text not null default 'basic' check (plan in ('basic', 'extra')),
  simulador_activo boolean default false);
create function public.is_admin() returns boolean language sql stable security definer set search_path = public
  as $$ select exists (select 1 from profiles where id = auth.uid() and rol_global = 'admin') $$;
create function public.sync_plataformas_activas() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger profiles_sync_plataformas_activas before insert or update on public.profiles for each row execute function public.sync_plataformas_activas();
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (auth.uid() = id or is_admin());

create table public.sim_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, pair text not null, timeframe text not null,
  date_from date not null, date_to date not null,
  capital numeric not null default 10000, balance numeric not null default 10000,
  status text default 'active', created_at timestamptz default now(), last_timestamp bigint,
  challenge_type text, challenge_phase integer,
  challenge_parent_id uuid references public.sim_sessions(id) on delete set null);
create index sim_sessions_user_id_idx on public.sim_sessions (user_id);
create function public.enforce_sim_session_limit() returns trigger language plpgsql security definer set search_path = public as $$
declare n integer; lim integer;
begin
  if new.challenge_parent_id is not null then return new; end if;
  select count(*) into n from sim_sessions where user_id = new.user_id and challenge_parent_id is null;
  select case when plan = 'extra' then 12 else 6 end into lim from profiles where id = new.user_id;
  lim := coalesce(lim, 6);
  if n >= lim then raise exception 'limite de sesiones (max %) [texto inventado: s04 solo dice P0001]', lim using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger trg_enforce_sim_session_limit before insert on public.sim_sessions for each row execute function public.enforce_sim_session_limit();

create table public.sim_trades (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sim_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  pair text not null, side text not null check (side in ('BUY', 'SELL')),
  entry_price numeric(10,5) not null, exit_price numeric(10,5), sl_price numeric(10,5), tp_price numeric(10,5),
  lots numeric(10,2) not null, risk_percent numeric(5,2), risk_amount numeric(10,2), rr numeric(10,2), pnl numeric(10,2),
  result text check (result in ('WIN', 'LOSS', 'BREAKEVEN', 'OPEN')),
  session_type text check (session_type in ('asia', 'london', 'nyam', 'nypm')),
  tags text[], notes text, opened_at timestamptz not null, closed_at timestamptz, created_at timestamptz default now());
create index sim_trades_session_id_idx on public.sim_trades (session_id);
create index sim_trades_user_id_closed_idx on public.sim_trades (user_id, closed_at);

create table public.session_drawings (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sim_sessions(id) on delete cascade, pair text, data jsonb);
create table public.session_chart_config (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sim_sessions(id) on delete cascade, config jsonb);
create table public.user_chart_config (user_id uuid primary key references auth.users(id) on delete cascade, config jsonb);
create table public.user_tool_config (user_id uuid primary key references auth.users(id) on delete cascade, config jsonb);
create table public.sim_drawing_templates (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, name text, data text);

alter table public.sim_sessions enable row level security;
alter table public.sim_trades enable row level security;
create policy sim_sessions_propias on public.sim_sessions as permissive for all to public using (auth.uid() = user_id);
create policy sim_trades_propios on public.sim_trades as permissive for all to public using (auth.uid() = user_id);
${['session_drawings', 'session_chart_config', 'sim_drawing_templates', 'user_chart_config', 'user_tool_config'].map(t => `alter table public.${t} enable row level security;
create policy ${t}_propios on public.${t} for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);`).join('\n')}
revoke all on public.sim_sessions, public.sim_trades, public.session_drawings, public.session_chart_config, public.sim_drawing_templates,
  public.user_chart_config, public.user_tool_config from anon, authenticated;
grant select, insert, update, delete on public.sim_sessions, public.sim_trades, public.session_drawings, public.session_chart_config,
  public.sim_drawing_templates, public.user_chart_config, public.user_tool_config to authenticated;
grant all on public.sim_sessions, public.sim_trades, public.session_drawings, public.session_chart_config, public.sim_drawing_templates,
  public.user_chart_config, public.user_tool_config, public.profiles to service_role;
grant select on public.profiles to authenticated;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`
