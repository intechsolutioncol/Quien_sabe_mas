-- Modo grupal (equipos) dentro del modo en vivo. Cada integrante sigue
-- respondiendo individual (sin tocar vivo_responder); el puntaje de
-- equipo es la suma de sus integrantes, calculado solo para mostrar el
-- ranking. La racha/robar/escudo siguen siendo por persona, sin cambios.

alter table public.juegos add column if not exists agrupacion_vivo text not null default 'individual' check (agrupacion_vivo in ('individual', 'equipos'));
alter table public.juegos add column if not exists cantidad_equipos int;

alter table public.sesiones_vivo_jugadores add column if not exists equipo int;

alter table public.sesiones_vivo add column if not exists agrupacion text not null default 'individual';
alter table public.sesiones_vivo add column if not exists cantidad_equipos int;
alter table public.sesiones_vivo add column if not exists ranking_equipos jsonb;

-- ---------------------------------------------------------------------
-- Arma los equipos al azar, lo más balanceados posible.
-- ---------------------------------------------------------------------
create or replace function public.vivo_formar_equipos_aleatorio(p_codigo text, p_cantidad_equipos int)
returns void
language plpgsql
as $$
declare
  v_estado text;
  v_jugador record;
  v_indice int := 0;
begin
  select estado_juego into v_estado from public.sesiones_vivo where codigo = p_codigo for update;
  if v_estado is null then
    raise exception 'Esta sesión en vivo ya no existe.';
  end if;
  if p_cantidad_equipos < 1 then
    raise exception 'La cantidad de equipos debe ser al menos 1.';
  end if;

  for v_jugador in
    select session_id from public.sesiones_vivo_jugadores where codigo = p_codigo order by random()
  loop
    update public.sesiones_vivo_jugadores
      set equipo = (v_indice % p_cantidad_equipos) + 1
      where codigo = p_codigo and session_id = v_jugador.session_id;
    v_indice := v_indice + 1;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Asigna a un jugador puntual a un equipo (arrastrar y soltar en el lobby).
-- ---------------------------------------------------------------------
create or replace function public.vivo_asignar_equipo(p_codigo text, p_session_id uuid, p_equipo int)
returns void
language plpgsql
as $$
begin
  update public.sesiones_vivo_jugadores
    set equipo = p_equipo
    where codigo = p_codigo and session_id = p_session_id;
  if not found then
    raise exception 'No se encontró a ese jugador en la sala.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- vivo_transicionar_a_revelando / vivo_finalizar: se reemplazan para
-- agregar ranking_equipos (suma de puntaje_total por equipo) cuando la
-- sesión está en modo "equipos". El ranking individual (con racha) no
-- cambia.
-- ---------------------------------------------------------------------
create or replace function public.vivo_transicionar_a_revelando(p_codigo text)
returns void
language plpgsql
as $$
declare
  v_sesion record;
  v_privado record;
  v_correcta text;
  v_distribucion jsonb;
  v_ranking jsonb;
  v_ranking_equipos jsonb;
begin
  select * into v_sesion from public.sesiones_vivo where codigo = p_codigo for update;
  if v_sesion is null or v_sesion.estado_juego <> 'pregunta' then
    return;
  end if;

  select * into v_privado from public.sesiones_vivo_privado where codigo = p_codigo;
  v_correcta := v_privado.preguntas -> v_sesion.indice_actual ->> 'respuestaCorrecta';

  select jsonb_build_object(
    'A', count(*) filter (where (respuestas -> (v_sesion.indice_actual::text) ->> 'opcion') = 'A'),
    'B', count(*) filter (where (respuestas -> (v_sesion.indice_actual::text) ->> 'opcion') = 'B'),
    'C', count(*) filter (where (respuestas -> (v_sesion.indice_actual::text) ->> 'opcion') = 'C'),
    'D', count(*) filter (where (respuestas -> (v_sesion.indice_actual::text) ->> 'opcion') = 'D')
  ) into v_distribucion
  from public.sesiones_vivo_jugadores where codigo = p_codigo;

  select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'puntaje', puntaje_total, 'racha', racha_actual)), '[]'::jsonb)
  into v_ranking
  from (
    select nombre, puntaje_total, racha_actual from public.sesiones_vivo_jugadores
    where codigo = p_codigo
    order by puntaje_total desc
    limit 5
  ) t;

  v_ranking_equipos := null;
  if v_sesion.agrupacion = 'equipos' then
    select coalesce(jsonb_agg(jsonb_build_object('equipo', equipo, 'puntaje', total_puntaje)), '[]'::jsonb)
    into v_ranking_equipos
    from (
      select equipo, sum(puntaje_total) as total_puntaje
      from public.sesiones_vivo_jugadores
      where codigo = p_codigo and equipo is not null
      group by equipo
      order by total_puntaje desc
    ) t;
  end if;

  update public.sesiones_vivo
    set estado_juego = 'revelando',
        respuesta_correcta_revelada = v_correcta,
        distribucion_respuestas = v_distribucion,
        ranking = v_ranking,
        ranking_equipos = v_ranking_equipos,
        fin_revelando_programado = now() + interval '8 seconds',
        actualizado_en = now()
  where codigo = p_codigo;
end;
$$;

create or replace function public.vivo_finalizar(p_codigo text)
returns void
language plpgsql
as $$
declare
  v_sesion record;
  v_privado record;
  v_ranking jsonb;
  v_ranking_equipos jsonb;
  v_jugador record;
  v_correctas int;
begin
  select * into v_sesion from public.sesiones_vivo where codigo = p_codigo for update;
  if v_sesion is null then
    raise exception 'Esta sesión en vivo ya no existe.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'puntaje', puntaje_total, 'racha', racha_actual)), '[]'::jsonb)
  into v_ranking
  from (
    select nombre, puntaje_total, racha_actual from public.sesiones_vivo_jugadores
    where codigo = p_codigo
    order by puntaje_total desc
  ) t;

  v_ranking_equipos := null;
  if v_sesion.agrupacion = 'equipos' then
    select coalesce(jsonb_agg(jsonb_build_object('equipo', equipo, 'puntaje', total_puntaje)), '[]'::jsonb)
    into v_ranking_equipos
    from (
      select equipo, sum(puntaje_total) as total_puntaje
      from public.sesiones_vivo_jugadores
      where codigo = p_codigo and equipo is not null
      group by equipo
      order by total_puntaje desc
    ) t;
  end if;

  update public.sesiones_vivo
    set estado_juego = 'finalizado',
        ranking = v_ranking,
        ranking_equipos = v_ranking_equipos,
        actualizado_en = now()
    where codigo = p_codigo;

  select * into v_privado from public.sesiones_vivo_privado where codigo = p_codigo for update;

  if v_privado is not null and not v_privado.resultados_guardados then
    for v_jugador in select * from public.sesiones_vivo_jugadores where codigo = p_codigo loop
      select count(*) into v_correctas
      from jsonb_each(v_jugador.respuestas) as r(indice, valor)
      where (valor ->> 'esCorrecta')::boolean;

      insert into public.resultados (juego_id, nombre_estudiante, puntaje, total_preguntas, resultado)
      values (v_sesion.juego_id, v_jugador.nombre, v_correctas, v_sesion.total_preguntas, 'en vivo');
    end loop;

    update public.sesiones_vivo_privado set resultados_guardados = true where codigo = p_codigo;
  end if;
end;
$$;

revoke all on function public.vivo_formar_equipos_aleatorio(text, int) from public, anon, authenticated;
revoke all on function public.vivo_asignar_equipo(text, uuid, int) from public, anon, authenticated;
grant execute on function public.vivo_formar_equipos_aleatorio(text, int) to service_role;
grant execute on function public.vivo_asignar_equipo(text, uuid, int) to service_role;
