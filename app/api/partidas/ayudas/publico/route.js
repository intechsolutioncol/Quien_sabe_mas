import { NextResponse } from 'next/server';
import { aplicarAyudaIndividual } from '@/lib/juego/ayuda-individual';
import { calcularPorcentajesPublico } from '@/lib/juego/ayudas';

// Equivalente a usarPreguntaPublico de Code.js.
export async function POST(request) {
  const { sessionId } = await request.json();

  let pregunta;
  try {
    pregunta = await aplicarAyudaIndividual(sessionId, 'publico');
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }

  return NextResponse.json({ porcentajes: calcularPorcentajesPublico(pregunta.respuestaCorrecta, pregunta.nivel) });
}
