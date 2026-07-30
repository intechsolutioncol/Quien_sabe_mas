import { NextResponse } from 'next/server';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { obtenerJuegoPorCodigo, obtenerBancoPreguntas } from '@/lib/juego/datos';
import { seleccionarPreguntasDeBanco, formatearPreguntaCliente } from '@/lib/juego/distribucion';

// Un estudiante entra con el código del juego (equivalente a
// unirseConCodigo de Code.js). El modo "en vivo" se agrega en la
// siguiente fase de la migración.
export async function POST(request) {
  const { codigo, nombreEstudiante } = await request.json();
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  if (!codigoNormalizado) {
    return NextResponse.json({ error: 'Escribe el código del juego.' }, { status: 400 });
  }

  const admin = crearClienteAdmin();
  const juego = await obtenerJuegoPorCodigo(admin, codigoNormalizado);
  if (!juego) {
    return NextResponse.json({ error: 'El código ingresado no existe. Verifícalo con tu profesor.' }, { status: 404 });
  }
  if (!juego.activo) {
    return NextResponse.json({ error: 'Este juego está inactivo. Consulta a tu profesor.' }, { status: 403 });
  }

  if (juego.modo === 'vivo') {
    return NextResponse.json(
      { error: 'El modo "en vivo" todavía no está disponible en la nueva plataforma. Vuelve pronto.' },
      { status: 501 }
    );
  }

  const banco = await obtenerBancoPreguntas(admin, juego.id);
  const preguntasPartida = seleccionarPreguntasDeBanco(banco, juego.cantidad_preguntas);
  if (preguntasPartida.length === 0) {
    return NextResponse.json({ error: 'Este juego todavía no tiene preguntas cargadas. Consulta a tu profesor.' }, { status: 409 });
  }

  const nombre = (nombreEstudiante || '').toString().trim().substring(0, 40) || 'Jugador';

  const { data: sesion, error } = await admin
    .from('sesiones_individuales')
    .insert({
      juego_id: juego.id,
      nombre_jugador: nombre,
      ayudas_activas: juego.ayudas,
      preguntas: preguntasPartida,
      pregunta_actual: 0,
      correctas: 0,
      modo_tiempo: juego.modo_tiempo,
      segundos_por_pregunta: juego.segundos_por_pregunta,
      duracion_total_segundos: juego.duracion_total_segundos,
    })
    .select('session_id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    modo: 'individual',
    sessionId: sesion.session_id,
    nombreJugador: nombre,
    nombreJuego: juego.nombre_juego,
    tematica: juego.tematica,
    totalPreguntas: preguntasPartida.length,
    ayudasActivas: juego.ayudas,
    modoTiempo: juego.modo_tiempo,
    segundosPorPregunta: juego.segundos_por_pregunta,
    duracionTotalSegundos: juego.duracion_total_segundos,
    pregunta: formatearPreguntaCliente(preguntasPartida[0], 0),
  });
}
