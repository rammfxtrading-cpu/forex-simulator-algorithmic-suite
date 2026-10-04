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
