import { NextResponse } from 'next/server';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { guardarResultado } from '@/lib/juego/datos';
import { formatearPreguntaCliente } from '@/lib/juego/distribucion';

// Equivalente a responderPregunta de Code.js.
export async function POST(request) {
  const { sessionId, opcionSeleccionada } = await request.json();
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

  const indice = estado.pregunta_actual;
  const preguntaActual = estado.preguntas[indice];
  const correcta = preguntaActual.respuestaCorrecta;
  const esCorrecta = opcionSeleccionada === correcta;
  const correctas = estado.correctas + (esCorrecta ? 1 : 0);

  const resultado = { esCorrecta, respuestaCorrecta: correcta, numero: indice + 1 };
  const siguienteIndice = indice + 1;
  const hayMasPreguntas = siguienteIndice < estado.preguntas.length;
  const cambios = { correctas };

  if (!hayMasPreguntas) {
    // Se acabaron las preguntas del banco de esta partida: es una prueba,
    // no "Millonario" — fallar una no la corta, solo se llega hasta acá
    // habiendo respondido todas (bien o mal) y se muestra el desglose.
    cambios.terminado = true;
    cambios.pregunta_actual = siguienteIndice;
    resultado.juegoTerminado = true;
    resultado.motivo = correctas === estado.preguntas.length ? 'perfecto' : 'completado';
    resultado.puntajeFinal = correctas;
    resultado.totalPreguntas = estado.preguntas.length;
    resultado.preguntasRespondidas = siguienteIndice;
    await guardarResultado(admin, estado.juego_id, estado.nombre_jugador, correctas, estado.preguntas.length, 'completado');
  } else {
    cambios.pregunta_actual = siguienteIndice;
    resultado.juegoTerminado = false;
    resultado.siguientePregunta = formatearPreguntaCliente(estado.preguntas[siguienteIndice], siguienteIndice);
  }

  const { error: errorUpdate } = await admin.from('sesiones_individuales').update(cambios).eq('session_id', sessionId);
  if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 500 });

  return NextResponse.json(resultado);
}
