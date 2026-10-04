// EL POSTGRESQL DE ENSAYO de las pruebas de sql/: un cluster 17 DESECHABLE (en
// el tmp del sistema, solo socket, sin TCP, se borra al acabar). Copiado del
// arnes del journal.
// ⚠️ El esquema de abajo es un STUB INVENTADO con la forma que el codigo usa: el
//    simulador no tiene SQL versionado (hallazgo S04) y por eso se pide la
//    consulta s04. No describe produccion. Nada de esto toca Supabase.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const BIN = '/opt/homebrew/opt/postgresql@17/bin'
export const hayPostgres = () => existsSync(BIN + '/initdb')

export const STUB = `
create extension if not exists pgcrypto;
do $r$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $r$;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, email text, nombre text,
  rol_global text default 'user', simulador_activo boolean default false, plan text);
create function public.is_admin() returns boolean language sql stable security definer set search_path = public
  as $$ select exists (select 1 from profiles where id = auth.uid() and rol_global = 'admin') $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public
  as $$ begin insert into profiles (id, email) values (new.id, new.email); return new; end $$;
create table public.messages (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id), texto text);
create table public.sim_sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  name text, pair text, capital numeric, balance numeric, status text default 'active', challenge_parent_id uuid references public.sim_sessions(id));
create function public.limite_sesiones() returns trigger language plpgsql as $$ begin return new; end $$;
create trigger sim_sessions_limite before insert on public.sim_sessions for each row execute function public.limite_sesiones();
create table public.sim_trades (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id),
  session_id uuid references public.sim_sessions(id) on delete cascade, pnl numeric, closed_at timestamptz);
create index sim_trades_session on public.sim_trades (session_id);
create table public.session_drawings (id uuid primary key default gen_random_uuid(), user_id uuid, session_id uuid references public.sim_sessions(id) on delete cascade, pair text, data jsonb);
create table public.session_chart_config (id uuid primary key default gen_random_uuid(), user_id uuid, session_id uuid, config jsonb);
create table public.sim_drawing_templates (id uuid primary key default gen_random_uuid(), user_id uuid, name text, data text);
create table public.user_chart_config (user_id uuid primary key, config jsonb);
-- una tabla de FUERA del simulador que apunta a sim_sessions (FK entrante)
create table public.hub_lectura (id serial primary key, sesion uuid references public.sim_sessions(id) on delete set null);
-- user_tool_config NO se crea: la consulta tiene que decir que falta
alter table public.sim_sessions enable row level security;
alter table public.sim_trades enable row level security;
create policy sesiones_propias on public.sim_sessions for all to authenticated using (auth.uid() = user_id or is_admin()) with check (auth.uid() = user_id);
create policy trades_propios on public.sim_trades for select to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on public.sim_sessions, public.sim_trades to authenticated;
grant update (nombre) on public.profiles to authenticated;
grant all on all tables in schema public to service_role;
-- Storage: la forma minima de storage.buckets / storage.objects
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
alter table storage.objects enable row level security;
insert into storage.buckets (id, name, public) values ('forex-data', 'forex-data', true), ('otro', 'otro', false);
create policy "lectura forex" on storage.objects for select to public using (bucket_id = 'forex-data');
create policy "subidas propias" on storage.objects for insert to authenticated with check (owner = auth.uid());
`

export function cluster() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'simpg-'))
  const puerto = String(54900 + Math.floor(Math.random() * 90))
  const ENV = { PATH: process.env.PATH, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' }
  const corre = (bin, args) => spawnSync(path.join(BIN, bin), args, { env: ENV, encoding: 'utf8' })
  const psql = (texto, db = 'sim') => {
    const f = path.join(dir, 'q.sql'); writeFileSync(f, texto)
    const r = corre('psql', ['-h', dir, '-p', puerto, '-U', 'postgres', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-d', db, '-f', f])
    return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }
  }
  const arranca = () => {
    const init = corre('initdb', ['-D', path.join(dir, 'd'), '-U', 'postgres', '--auth=trust'])
    if (init.status !== 0) throw new Error('initdb: ' + init.stderr)
    const arr = corre('pg_ctl', ['-D', path.join(dir, 'd'), '-l', path.join(dir, 'log'), '-w', '-o', `-k ${dir} -c listen_addresses='' -p ${puerto}`, 'start'])
    if (arr.status !== 0) throw new Error('pg_ctl start: ' + arr.stderr)
  }
  const cierra = () => { corre('pg_ctl', ['-D', path.join(dir, 'd'), '-m', 'immediate', 'stop']); rmSync(dir, { recursive: true, force: true }) }
  const base = nombre => { psql(`create database ${nombre}`, 'postgres'); return psql(STUB, nombre) }
  return { psql, arranca, cierra, base, dir }
}
