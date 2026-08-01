-- Mecánica de "racha" (solo modo en vivo): 3+ aciertos seguidos
-- desbloquean un poder opcional (quitar puntos a un rival o protegerse
-- con un escudo). No aplica al modo individual (no hay a quién
-- quitarle puntos ni de quién protegerse).

alter table public.sesiones_vivo_jugadores add column if not exists racha_actual int not null default 0;
alter table public.sesiones_vivo_jugadores add column if not exists ultimo_umbral_racha int not null default 0;
alter table public.sesiones_vivo_jugadores add column if not exists poder_disponible boolean not null default false;
alter table public.sesiones_vivo_jugadores add column if not exists escudo_activo boolean not null default false;

-- ---------------------------------------------------------------------
-- vivo_responder: se reemplaza para llevar la cuenta de la racha además
-- de la respuesta/puntaje (misma lógica de antes + lo nuevo).
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
  v_racha_nueva int;
  v_umbral_nuevo int;
  v_poder_nuevo boolean;
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

    v_racha_nueva := v_jugador.racha_actual + 1;
    v_umbral_nuevo := v_jugador.ultimo_umbral_racha;
    v_poder_nuevo := v_jugador.poder_disponible;
    -- No se apilan poderes: solo se concede uno nuevo si no tenía ya uno
    -- disponible sin usar, y cada nuevo poder exige 3 aciertos MÁS
    -- desde el último umbral premiado.
    if v_racha_nueva >= v_umbral_nuevo + 3 and not v_poder_nuevo then
      v_poder_nuevo := true;
      v_umbral_nuevo := v_racha_nueva;
    end if;
  else
    v_puntos := 0;
    v_racha_nueva := 0;
    v_umbral_nuevo := 0;
    -- Un poder ya ganado y sin usar NO se pierde por fallar después.
    v_poder_nuevo := v_jugador.poder_disponible;
  end if;

  update public.sesiones_vivo_jugadores
    set respuestas = respuestas || jsonb_build_object(
          v_sesion.indice_actual::text,
          jsonb_build_object('opcion', p_opcion, 'esCorrecta', v_es_correcta, 'puntosGanados', v_puntos)
        ),
        puntaje_total = puntaje_total + v_puntos,
        racha_actual = v_racha_nueva,
        ultimo_umbral_racha = v_umbral_nuevo,
        poder_disponible = v_poder_nuevo
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
-- vivo_transicionar_a_revelando y vivo_finalizar: se reemplazan solo
-- para agregar "racha" al ranking (dato público, no revela nada
-- sensible; permite mostrar un 🔥 junto a quien va en racha).
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

  select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'puntaje', puntaje_total, 'racha', racha_actual)), '[]'::jsonb)
  into v_ranking
  from (
    select nombre, puntaje_total, racha_actual from public.sesiones_vivo_jugadores
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

  select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'puntaje', puntaje_total, 'racha', racha_actual)), '[]'::jsonb)
  into v_ranking
  from (
    select nombre, puntaje_total, racha_actual from public.sesiones_vivo_jugadores
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
-- vivo_usar_poder_racha: consume el poder disponible del jugador y
-- aplica su efecto. "robar" busca al objetivo POR NOMBRE (nunca por
-- sessionId: un estudiante nunca debe conocer el sessionId de otro,
-- porque ese id es el "token" que permite responder/usar ayudas en su
-- nombre). Bloquea las filas involucradas en orden por session_id para
-- evitar interbloqueos si dos jugadores se atacan entre sí a la vez.
-- ---------------------------------------------------------------------
create or replace function public.vivo_usar_poder_racha(p_codigo text, p_session_id uuid, p_accion text, p_nombre_objetivo text default null)
returns jsonb
language plpgsql
as $$
declare
  v_atacante record;
  v_objetivo record;
  v_puntos_quitados constant int := 300;
begin
  if p_accion not in ('robar', 'escudo') then
    raise exception 'Acción de poder inválida.';
  end if;

  perform 1 from public.sesiones_vivo_jugadores
    where codigo = p_codigo and (session_id = p_session_id or (p_accion = 'robar' and nombre = p_nombre_objetivo))
    order by session_id
    for update;

  select * into v_atacante from public.sesiones_vivo_jugadores where codigo = p_codigo and session_id = p_session_id;
  if v_atacante is null then
    raise exception 'Tu sesión ya no es válida. Vuelve a ingresar con el código.';
  end if;
  if not v_atacante.poder_disponible then
    raise exception 'Todavía no tienes un poder disponible (necesitas 3 respuestas correctas seguidas).';
  end if;

  -- Se valida el objetivo ANTES de consumir el poder: un intento
  -- inválido (nombre inexistente o uno mismo) no debe costarle el
  -- poder al jugador.
  if p_accion = 'robar' then
    select * into v_objetivo from public.sesiones_vivo_jugadores where codigo = p_codigo and nombre = p_nombre_objetivo limit 1;
    if v_objetivo is null then
      raise exception 'No se encontró a ese jugador en la sala.';
    end if;
    if v_objetivo.session_id = p_session_id then
      raise exception 'No puedes robarte puntos a ti mismo.';
    end if;
  end if;

  update public.sesiones_vivo_jugadores set poder_disponible = false where codigo = p_codigo and session_id = p_session_id;

  if p_accion = 'escudo' then
    update public.sesiones_vivo_jugadores set escudo_activo = true where codigo = p_codigo and session_id = p_session_id;
    return jsonb_build_object('accion', 'escudo', 'bloqueado', false);
  end if;

  if v_objetivo.escudo_activo then
    update public.sesiones_vivo_jugadores set escudo_activo = false where codigo = p_codigo and session_id = v_objetivo.session_id;
    return jsonb_build_object('accion', 'robar', 'bloqueado', true, 'objetivo', v_objetivo.nombre);
  end if;

  update public.sesiones_vivo_jugadores
    set puntaje_total = greatest(0, puntaje_total - v_puntos_quitados)
    where codigo = p_codigo and session_id = v_objetivo.session_id;

  return jsonb_build_object('accion', 'robar', 'bloqueado', false, 'objetivo', v_objetivo.nombre, 'puntosQuitados', v_puntos_quitados);
end;
$$;

revoke all on function public.vivo_usar_poder_racha(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.vivo_usar_poder_racha(text, uuid, text, text) to service_role;
