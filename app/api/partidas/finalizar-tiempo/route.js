import { NextResponse } from 'next/server';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { guardarResultado } from '@/lib/juego/datos';

// Usado en modo "tiempo total" cuando se agota el reloj de toda la
// sesión. Equivalente a finalizarPorTiempo de Code.js.
export async function POST(request) {
  const { sessionId } = await request.json();
  const admin = crearClienteAdmin();

  const { data: estado, error } = await admin
    .from('sesiones_individuales')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!estado || estado.terminado) {
    return NextResponse.json({ error: 'La sesión no es válida o la partida ya terminó.' }, { status: 410 });
  }

  await guardarResultado(admin, estado.juego_id, estado.nombre_jugador, estado.correctas, estado.preguntas.length, 'tiempo agotado');

  const { error: errorUpdate } = await admin
    .from('sesiones_individuales')
    .update({ terminado: true })
    .eq('session_id', sessionId);
  if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 500 });

  return NextResponse.json({
    puntajeFinal: estado.correctas,
    totalPreguntas: estado.preguntas.length,
    preguntasRespondidas: estado.pregunta_actual,
  });
}
