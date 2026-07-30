-- Esquema inicial de "¿Quién Sabe Más?" en Supabase/Postgres.
-- Reemplaza: hoja de cálculo (Juegos/Preguntas/Resultados) + CacheService
-- (sesiones individuales y en vivo) + LockService (bloqueo de fila) del
-- proyecto original en Google Apps Script (ver legacy-apps-script/).

-- ---------------------------------------------------------------------
-- Juegos (antes: hoja "Juegos")
-- ---------------------------------------------------------------------
create table public.juegos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  profesor_id uuid not null references auth.users(id) on delete cascade,
  nombre_juego text not null,
  profesor_nombre text not null default '',
  tematica text not null default '',
  cantidad_preguntas int not null check (cantidad_preguntas between 1 and 100),
  modo text not null default 'individual' check (modo in ('individual', 'vivo')),
  ayudas jsonb not null default '{"cincuenta": true, "llamada": true, "publico": true}',
  modo_tiempo text not null default 'porPregunta' check (modo_tiempo in ('porPregunta', 'total')),
  avance_vivo text not null default 'automatico' check (avance_vivo in ('automatico', 'manual')),
  segundos_por_pregunta int not null default 45 check (segundos_por_pregunta between 5 and 300),
  duracion_total_segundos int not null default 600,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create index juegos_profesor_id_idx on public.juegos (profesor_id);

alter table public.juegos enable row level security;

create policy "profesor administra sus juegos" on public.juegos
  for all
  using (profesor_id = auth.uid())
  with check (profesor_id = auth.uid());

-- ---------------------------------------------------------------------
-- Preguntas (antes: hoja "Preguntas"). Nunca accesible directo para
-- estudiantes: la selección/servido de preguntas siempre pasa por un
-- Route Handler con la service role key, igual que hacía Code.js.
-- ---------------------------------------------------------------------
create table public.preguntas (
  id uuid primary key default gen_random_uuid(),
  juego_id uuid not null references public.juegos(id) on delete cascade,
  nivel int not null check (nivel between 1 and 5),
  pregunta text not null,
  opcion_a text not null,
  opcion_b text not null,
  opcion_c text not null,
  opcion_d text not null,
  respuesta_correcta text not null check (respuesta_correcta in ('A', 'B', 'C', 'D'))
);

create index preguntas_juego_id_idx on public.preguntas (juego_id);

alter table public.preguntas enable row level security;

create policy "profesor administra las preguntas de sus juegos" on public.preguntas
  for all
  using (exists (select 1 from public.juegos j where j.id = juego_id and j.profesor_id = auth.uid()))
  with check (exists (select 1 from public.juegos j where j.id = juego_id and j.profesor_id = auth.uid()));

-- ---------------------------------------------------------------------
-- Resultados (antes: hoja "Resultados"). Los estudiantes nunca leen esta
-- tabla; el servidor inserta con la service role key al terminar una
-- partida (individual o en vivo).
-- ---------------------------------------------------------------------
create table public.resultados (
  id uuid primary key default gen_random_uuid(),
  juego_id uuid not null references public.juegos(id) on delete cascade,
  nombre_estudiante text not null,
  puntaje int not null,
  total_preguntas int not null,
  resultado text not null,
  creado_en timestamptz not null default now()
);

create index resultados_juego_id_idx on public.resultados (juego_id);

alter table public.resultados enable row level security;

create policy "profesor ve los resultados de sus juegos" on public.resultados
  for select
  using (exists (select 1 from public.juegos j where j.id = juego_id and j.profesor_id = auth.uid()));

-- ---------------------------------------------------------------------
-- Sesiones individuales (antes: CacheService, partida "a su ritmo").
-- El sessionId (uuid) actúa como bearer token: quien lo conoce puede
-- jugar esa partida, igual que con la clave de CacheService de hoy.
-- Nunca expuesta directo al cliente: todo pasa por Route Handlers con
-- la service role key.
-- ---------------------------------------------------------------------
create table public.sesiones_individuales (
  session_id uuid primary key default gen_random_uuid(),
  juego_id uuid not null references public.juegos(id) on delete cascade,
  nombre_jugador text not null,
  ayudas_activas jsonb not null,
  preguntas jsonb not null,
  pregunta_actual int not null default 0,
  correctas int not null default 0,
  ayudas_usadas jsonb not null default '{"cincuenta": false, "llamada": false, "publico": false}',
  modo_tiempo text not null,
  segundos_por_pregunta int not null,
  duracion_total_segundos int not null,
  terminado boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.sesiones_individuales enable row level security;
-- Sin políticas: cerrada del todo a anon/authenticated. Solo service_role.

-- ---------------------------------------------------------------------
-- Sesiones en vivo: divididas en pública (sin secretos, se transmite por
-- Supabase Realtime a host y estudiantes) y privada (banco de preguntas
-- con respuesta correcta + respuestas de cada jugador, jamás expuesta).
-- Reemplaza CacheService clave "vivo_<codigo>" + LockService de Vivo.js.
-- ---------------------------------------------------------------------
create table public.sesiones_vivo (
  codigo text primary key,
  juego_id uuid not null references public.juegos(id) on delete cascade,
  nombre_juego text not null,
  tematica text not null default '',
  estado_juego text not null default 'lobby' check (estado_juego in ('lobby', 'pregunta', 'revelando', 'finalizado')),
  indice_actual int not null default -1,
  total_preguntas int not null,
  avance text not null default 'automatico' check (avance in ('automatico', 'manual')),
  segundos_por_pregunta int not null,
  ayudas_activas jsonb not null,
  numero_jugadores int not null default 0,
  nombres_jugadores jsonb not null default '[]',
  pregunta_actual jsonb,
  respuestas_recibidas int not null default 0,
  respuesta_correcta_revelada text,
  distribucion_respuestas jsonb,
  ranking jsonb not null default '[]',
  fin_pregunta_programado timestamptz,
  fin_revelando_programado timestamptz,
  actualizado_en timestamptz not null default now()
);

alter table public.sesiones_vivo enable row level security;

-- Sin secretos en esta tabla: cualquiera (anon o autenticado) puede
-- suscribirse por Realtime a la fila de su código de juego.
create policy "cualquiera puede leer el estado publico de una sesion en vivo" on public.sesiones_vivo
  for select
  using (true);

-- Habilita la replicación por Realtime para esta tabla (host y
-- estudiantes se suscriben con supabase.channel(...).on('postgres_changes', ...)).
alter publication supabase_realtime add table public.sesiones_vivo;

-- Banco de preguntas de la sesión en vivo (con respuesta correcta). Solo
-- el servidor (service_role) la lee/escribe.
create table public.sesiones_vivo_privado (
  codigo text primary key references public.sesiones_vivo(codigo) on delete cascade,
  preguntas jsonb not null
);

alter table public.sesiones_vivo_privado enable row level security;
-- Sin políticas: cerrada del todo a anon/authenticated.

-- Respuestas y puntaje de cada jugador en una sesión en vivo. Solo el
-- servidor la lee/escribe; el jugador recibe su propio detalle (si
-- acertó, puntos, posición) por un Route Handler dedicado, nunca por
-- Realtime directo a esta tabla (evita que un jugador vea las
-- respuestas de los demás antes de tiempo).
create table public.sesiones_vivo_jugadores (
  codigo text not null references public.sesiones_vivo(codigo) on delete cascade,
  session_id uuid not null default gen_random_uuid(),
  nombre text not null,
  puntaje_total int not null default 0,
  respuestas jsonb not null default '{}',
  ayudas_usadas jsonb not null default '{"cincuenta": false, "llamada": false, "publico": false}',
  primary key (codigo, session_id)
);

alter table public.sesiones_vivo_jugadores enable row level security;
-- Sin políticas: cerrada del todo a anon/authenticated.
