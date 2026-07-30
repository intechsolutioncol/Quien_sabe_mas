import { NextResponse } from 'next/server';
import { crearClienteAdmin } from '@/lib/supabase/admin';

// El detalle 100% personal de un jugador (si acertó, cuántos puntos ganó,
// su posición) nunca viaja por el canal público de Realtime: el cliente
// llama esta ruta puntualmente cuando el evento de Realtime le avisa que
// la sesión pasó a "revelando" o "finalizado".
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const codigo = (params.get('codigo') || '').toString().trim().toUpperCase();
  const sessionId = params.get('sessionId');
  if (!codigo || !sessionId) return NextResponse.json({ error: 'Faltan parámetros.' }, { status: 400 });

  const admin = crearClienteAdmin();

  const { data: sesion, error: errorSesion } = await admin
    .from('sesiones_vivo')
    .select('indice_actual, estado_juego')
    .eq('codigo', codigo)
    .maybeSingle();
  if (errorSesion) return NextResponse.json({ error: errorSesion.message }, { status: 500 });
  if (!sesion) return NextResponse.json({ error: 'Esta sesión en vivo ya no existe.' }, { status: 404 });

  const { data: jugador, error: errorJugador } = await admin
    .from('sesiones_vivo_jugadores')
    .select('*')
    .eq('codigo', codigo)
    .eq('session_id', sessionId)
    .maybeSingle();
  if (errorJugador) return NextResponse.json({ error: errorJugador.message }, { status: 500 });
  if (!jugador) return NextResponse.json({ error: 'Tu sesión ya no es válida. Vuelve a ingresar con el código.' }, { status: 404 });

  const respuestaActual = jugador.respuestas?.[String(sesion.indice_actual)];

  let tuPosicion = null;
  if (sesion.estado_juego === 'revelando' || sesion.estado_juego === 'finalizado') {
    const { data: todos, error: errorTodos } = await admin
      .from('sesiones_vivo_jugadores')
      .select('session_id, puntaje_total')
      .eq('codigo', codigo)
      .order('puntaje_total', { ascending: false });
    if (errorTodos) return NextResponse.json({ error: errorTodos.message }, { status: 500 });
    const posicion = todos.findIndex((j) => j.session_id === sessionId);
    tuPosicion = posicion === -1 ? null : posicion + 1;
  }

  return NextResponse.json({
    puntajeTotal: jugador.puntaje_total,
    ayudasUsadas: jugador.ayudas_usadas,
    yaRespondio: !!respuestaActual,
    tuRespuesta: respuestaActual?.opcion ?? null,
    esCorrecta: respuestaActual?.esCorrecta ?? false,
    puntosGanados: respuestaActual?.puntosGanados ?? 0,
    tuPosicion,
  });
}
