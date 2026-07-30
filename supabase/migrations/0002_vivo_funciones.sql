-- Modo "en vivo y sincronizado": funciones Postgres que reemplazan el
-- LockService + conSesionVivo_ de legacy-apps-script/Vivo.js. Cada función
-- hace su lectura-modificación-escritura dentro de UNA transacción con
-- "SELECT ... FOR UPDATE" sobre la fila de sesiones_vivo, así dos
-- peticiones concurrentes (dos estudiantes, o un estudiante y el host)
-- nunca se pisan, igual que garantizaba el LockService antes.
--
-- Se restringe el EXECUTE a service_role: aunque alguien intentara llamar
-- estas funciones desde el navegador con la anon key, además de no tener
-- permiso de ejecución, las tablas privadas (sesiones_vivo_privado,
-- sesiones_vivo_jugadores) tienen RLS cerrado sin políticas, así que sus
-- lecturas/escrituras fallarían igual.

alter table public.sesiones_vivo_privado add column if not exists resultados_guardados boolean not null default false;

-- ---------------------------------------------------------------------
-- Unirse a una sesión en vivo (solo mientras está en "lobby").
-- ---------------------------------------------------------------------
create or replace function public.vivo_unirse(p_codigo text, p_nombre text)
returns uuid
language plpgsql
as $$
declare
  v_estado text;
  v_session_id uuid := gen_random_uuid();
begin
  select estado_juego into v_estado from public.sesiones_vivo where codigo = p_codigo for update;
  if v_estado is null then
    raise exception 'Tu profesor todavía no ha iniciado esta sesión en vivo.';
  end if;
  if v_estado <> 'lobby' then
    raise exception 'Esta partida en vivo ya comenzó. Espera a que el profesor inicie una nueva ronda.';
  end if;

  insert into public.sesiones_vivo_jugadores (codigo, session_id, nombre)
  values (p_codigo, v_session_id, p_nombre);

  update public.sesiones_vivo
    set numero_jugadores = numero_jugadores + 1,
        nombres_jugadores = nombres_jugadores || to_jsonb(p_nombre),
        actualizado_en = now()
    where codigo = p_codigo;

  return v_session_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Transición interna pregunta -> revelando (calcula distribución de
-- respuestas y ranking). No falla si no aplica: se usa tanto desde el
-- botón manual "Revelar ahora" como desde el avance perezoso por reloj.
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

  select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'puntaje', puntaje_total)), '[]'::jsonb)
  into v_ranking
  from (
    select nombre, puntaje_total from public.sesiones_vivo_jugadores
    where codigo = p_codigo
    order by puntaje_total desc
    limit 5
  ) t;

  update public.sesiones_vivo
    set estado_juego = 'revelando',
        respuesta_correcta_revelada = v_correcta,
        distribucion_respuestas = v_distribucion,
        ranking = v_ranking,
        fin_revelando_programado = now() + interval '8 seconds',
        actualizado_en = now()
  where codigo = p_codigo;
end;
$$;

-- ---------------------------------------------------------------------
-- Guarda los resultados finales en la tabla "resultados" (una sola vez,
-- protegido por resultados_guardados) y marca la sesión como finalizada.
-- ---------------------------------------------------------------------
create or replace function public.vivo_finalizar(p_codigo text)
returns void
language plpgsql
as $$
declare
  v_sesion record;
  v_privado record;
  v_ranking jsonb;
  v_jugador record;
  v_correctas int;
begin
  select * into v_sesion from public.sesiones_vivo where codigo = p_codigo for update;
  if v_sesion is null then
    raise exception 'Esta sesión en vivo ya no existe.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'puntaje', puntaje_total)), '[]'::jsonb)
  into v_ranking
  from (
    select nombre, puntaje_total from public.sesiones_vivo_jugadores
    where codigo = p_codigo
    order by puntaje_total desc
  ) t;

  update public.sesiones_vivo
    set estado_juego = 'finalizado',
        ranking = v_ranking,
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

-- ---------------------------------------------------------------------
-- Arranca la primera pregunta (desde "lobby") o la siguiente (desde
-- "revelando"); si ya no quedan preguntas, finaliza. Usado tanto por el
-- botón del host como por el avance automático por reloj.
-- ---------------------------------------------------------------------
create or replace function public.vivo_iniciar_pregunta(p_codigo text)
returns void
language plpgsql
as $$
declare
  v_sesion record;
  v_privado record;
  v_siguiente int;
  v_pregunta jsonb;
begin
  select * into v_sesion from public.sesiones_vivo where codigo = p_codigo for update;
  if v_sesion is null then
    raise exception 'Esta sesión en vivo ya no existe.';
  end if;
  if v_sesion.estado_juego not in ('lobby', 'revelando') then
    raise exception 'No se puede iniciar una pregunta en este momento.';
  end if;

  v_siguiente := v_sesion.indice_actual + 1;

  if v_siguiente >= v_sesion.total_preguntas then
    perform public.vivo_finalizar(p_codigo);
    return;
  end if;

  select * into v_privado from public.sesiones_vivo_privado where codigo = p_codigo;
  v_pregunta := v_privado.preguntas -> v_siguiente;

  update public.sesiones_vivo
    set estado_juego = 'pregunta',
        indice_actual = v_siguiente,
        pregunta_actual = jsonb_build_object(
          'numero', v_siguiente + 1,
          'nivel', v_pregunta -> 'nivel',
          'pregunta', v_pregunta -> 'pregunta',
          'opciones', v_pregunta -> 'opciones'
        ),
        respuestas_recibidas = 0,
        respuesta_correcta_revelada = null,
        distribucion_respuestas = null,
        fin_pregunta_programado = now() + (v_sesion.segundos_por_pregunta || ' seconds')::interval,
        fin_revelando_programado = null,
        actualizado_en = now()
    where codigo = p_codigo;
end;
$$;

-- ---------------------------------------------------------------------
-- Revelar antes de que se acabe el reloj (acción manual del host).
-- ---------------------------------------------------------------------
create or replace function public.vivo_revelar_ahora(p_codigo text)
returns void
language plpgsql
as $$
declare
  v_estado text;
begin
  select estado_juego into v_estado from public.sesiones_vivo where codigo = p_codigo for update;
  if v_estado is null then
    raise exception 'Esta sesión en vivo ya no existe.';
  end if;
  if v_estado <> 'pregunta' then
    raise exception 'No hay una pregunta activa para revelar.';
  end if;
  perform public.vivo_transicionar_a_revelando(p_codigo);
end;
$$;

-- ---------------------------------------------------------------------
-- Avanza el estado tantas veces como haga falta según el reloj (evaluado
-- de forma perezosa en cada consulta de estado, sin necesidad de un cron).
-- ---------------------------------------------------------------------
create or replace function public.vivo_avanzar_si_corresponde(p_codigo text)
returns void
language plpgsql
as $$
declare
  v_sesion record;
  v_limite int := 0;
begin
  loop
    v_limite := v_limite + 1;
    exit when v_limite > 200; -- salvaguarda contra bucles infinitos

    select * into v_sesion from public.sesiones_vivo where codigo = p_codigo for update;
    if v_sesion is null then
      return;
    end if;

    if v_sesion.estado_juego = 'pregunta' and v_sesion.fin_pregunta_programado is not null and now() >= v_sesion.fin_pregunta_programado then
      perform public.vivo_transicionar_a_revelando(p_codigo);
      continue;
    end if;

    if v_sesion.estado_juego = 'revelando' and v_sesion.avance = 'automatico'
       and v_sesion.fin_revelando_programado is not null and now() >= v_sesion.fin_revelando_programado then
      perform public.vivo_iniciar_pregunta(p_codigo);
      continue;
    end if;

    exit;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Un estudiante responde la pregunta actual (puntaje estilo concurso:
-- más rápido = más puntos; niveles difíciles valen más de entrada).
-- ---------------------------------------------------------------------
create or replace function public.vivo_responder(p_codigo text, p_session_id uuid, p_opcion text)
returns void
language plpgsql
as $$
declare
  v_sesion record;
  v_privado record;
  v_jugador record;
  v_pregunta jsonb;
  v_correcta text;
  v_es_correcta boolean;
  v_nivel int;
  v_segundos_transcurridos numeric;
  v_puntos_base jsonb := '{"1":500,"2":750,"3":1000,"4":1250,"5":1500}'::jsonb;
  v_base int;
  v_fraccion numeric;
  v_puntos int;
  v_total_jugadores int;
  v_total_respuestas int;
begin
  select * into v_sesion from public.sesiones_vivo where codigo = p_codigo for update;
  if v_sesion is null then
    raise exception 'Esta sesión en vivo ya no existe.';
  end if;
  if v_sesion.estado_juego <> 'pregunta' then
    raise exception 'Ya no se puede responder esta pregunta.';
  end if;

  select * into v_jugador from public.sesiones_vivo_jugadores
    where codigo = p_codigo and session_id = p_session_id for update;
  if v_jugador is null then
    raise exception 'Tu sesión ya no es válida. Vuelve a ingresar con el código.';
  end if;
  if v_jugador.respuestas ? (v_sesion.indice_actual::text) then
    raise exception 'Ya respondiste esta pregunta.';
  end if;

  select * into v_privado from public.sesiones_vivo_privado where codigo = p_codigo;
  v_pregunta := v_privado.preguntas -> v_sesion.indice_actual;
  v_correcta := v_pregunta ->> 'respuestaCorrecta';
  v_nivel := (v_pregunta ->> 'nivel')::int;
  v_es_correcta := (p_opcion = v_correcta);

  v_segundos_transcurridos := greatest(0, v_sesion.segundos_por_pregunta - extract(epoch from (v_sesion.fin_pregunta_programado - now())));

  if v_es_correcta then
    v_base := coalesce((v_puntos_base ->> (v_nivel::text))::int, 1000);
    v_fraccion := greatest(0, least(1, 1 - (v_segundos_transcurridos / v_sesion.segundos_por_pregunta)));
    v_puntos := round(v_base * (0.5 + v_fraccion * 0.5));
  else
    v_puntos := 0;
  end if;

  update public.sesiones_vivo_jugadores
    set respuestas = respuestas || jsonb_build_object(
          v_sesion.indice_actual::text,
          jsonb_build_object('opcion', p_opcion, 'esCorrecta', v_es_correcta, 'puntosGanados', v_puntos)
        ),
        puntaje_total = puntaje_total + v_puntos
    where codigo = p_codigo and session_id = p_session_id;

  select count(*) into v_total_jugadores from public.sesiones_vivo_jugadores where codigo = p_codigo;
  select count(*) into v_total_respuestas from public.sesiones_vivo_jugadores
    where codigo = p_codigo and respuestas ? (v_sesion.indice_actual::text);

  update public.sesiones_vivo
    set respuestas_recibidas = v_total_respuestas,
        fin_pregunta_programado = case
          when v_total_jugadores > 0 and v_total_respuestas >= v_total_jugadores
            then least(fin_pregunta_programado, now() + interval '1 second')
          else fin_pregunta_programado
        end,
        actualizado_en = now()
    where codigo = p_codigo;
end;
$$;

-- ---------------------------------------------------------------------
-- Marca una ayuda como usada (validación + bloqueo atómico) y devuelve la
-- respuesta correcta + nivel de la pregunta actual para que el servidor
-- calcule el resultado de la ayuda en JS, reutilizando las mismas
-- funciones puras que el modo individual (lib/juego/ayudas.js).
-- ---------------------------------------------------------------------
create or replace function public.vivo_marcar_ayuda_usada(p_codigo text, p_session_id uuid, p_nombre_ayuda text)
returns jsonb
language plpgsql
as $$
declare
  v_sesion record;
  v_jugador record;
  v_privado record;
  v_pregunta jsonb;
begin
  select * into v_sesion from public.sesiones_vivo where codigo = p_codigo for update;
  if v_sesion is null then
    raise exception 'Esta sesión en vivo ya no existe.';
  end if;
  if v_sesion.estado_juego <> 'pregunta' then
    raise exception 'Solo puedes usar ayudas mientras la pregunta está activa.';
  end if;
  if not (v_sesion.ayudas_activas ? p_nombre_ayuda) or not (v_sesion.ayudas_activas ->> p_nombre_ayuda)::boolean then
    raise exception 'Esta ayuda no está disponible en este juego.';
  end if;

  select * into v_jugador from public.sesiones_vivo_jugadores
    where codigo = p_codigo and session_id = p_session_id for update;
  if v_jugador is null then
    raise exception 'Tu sesión ya no es válida. Vuelve a ingresar con el código.';
  end if;
  if (v_jugador.ayudas_usadas ->> p_nombre_ayuda)::boolean then
    raise exception 'Esa ayuda ya fue utilizada en esta partida.';
  end if;

  update public.sesiones_vivo_jugadores
    set ayudas_usadas = ayudas_usadas || jsonb_build_object(p_nombre_ayuda, true)
    where codigo = p_codigo and session_id = p_session_id;

  select * into v_privado from public.sesiones_vivo_privado where codigo = p_codigo;
  v_pregunta := v_privado.preguntas -> v_sesion.indice_actual;

  return jsonb_build_object('respuestaCorrecta', v_pregunta ->> 'respuestaCorrecta', 'nivel', (v_pregunta ->> 'nivel')::int);
end;
$$;

-- ---------------------------------------------------------------------
-- Solo el servidor (service_role) puede ejecutar estas funciones.
-- ---------------------------------------------------------------------
revoke all on function public.vivo_unirse(text, text) from public, anon, authenticated;
revoke all on function public.vivo_transicionar_a_revelando(text) from public, anon, authenticated;
revoke all on function public.vivo_finalizar(text) from public, anon, authenticated;
revoke all on function public.vivo_iniciar_pregunta(text) from public, anon, authenticated;
revoke all on function public.vivo_revelar_ahora(text) from public, anon, authenticated;
revoke all on function public.vivo_avanzar_si_corresponde(text) from public, anon, authenticated;
revoke all on function public.vivo_responder(text, uuid, text) from public, anon, authenticated;
revoke all on function public.vivo_marcar_ayuda_usada(text, uuid, text) from public, anon, authenticated;

grant execute on function public.vivo_unirse(text, text) to service_role;
grant execute on function public.vivo_transicionar_a_revelando(text) to service_role;
grant execute on function public.vivo_finalizar(text) to service_role;
grant execute on function public.vivo_iniciar_pregunta(text) to service_role;
grant execute on function public.vivo_revelar_ahora(text) to service_role;
grant execute on function public.vivo_avanzar_si_corresponde(text) to service_role;
grant execute on function public.vivo_responder(text, uuid, text) to service_role;
grant execute on function public.vivo_marcar_ayuda_usada(text, uuid, text) to service_role;
