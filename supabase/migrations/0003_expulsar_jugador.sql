-- Expulsar a un estudiante del lobby de una sesión en vivo (antes de que
-- empiece el juego). Recalcula numero_jugadores y nombres_jugadores desde
-- cero tras el borrado (en vez de intentar quitar el nombre del arreglo
-- jsonb a mano) para que funcione bien incluso si hay nombres repetidos.
create or replace function public.vivo_expulsar_jugador(p_codigo text, p_session_id uuid)
returns void
language plpgsql
as $$
declare
  v_estado text;
  v_nombres jsonb;
  v_total int;
begin
  select estado_juego into v_estado from public.sesiones_vivo where codigo = p_codigo for update;
  if v_estado is null then
    raise exception 'Esta sesión en vivo ya no existe.';
  end if;
  if v_estado <> 'lobby' then
    raise exception 'Solo se puede expulsar a un jugador mientras la partida está en el lobby.';
  end if;

  delete from public.sesiones_vivo_jugadores where codigo = p_codigo and session_id = p_session_id;

  select count(*), coalesce(jsonb_agg(nombre), '[]'::jsonb) into v_total, v_nombres
  from public.sesiones_vivo_jugadores
  where codigo = p_codigo;

  update public.sesiones_vivo
    set numero_jugadores = v_total,
        nombres_jugadores = v_nombres,
        actualizado_en = now()
    where codigo = p_codigo;
end;
$$;

revoke all on function public.vivo_expulsar_jugador(text, uuid) from public, anon, authenticated;
grant execute on function public.vivo_expulsar_jugador(text, uuid) to service_role;
