import { NextResponse } from 'next/server';
import { aplicarAyudaIndividual } from '@/lib/juego/ayuda-individual';
import { calcularRespuestaAmigo } from '@/lib/juego/ayudas';

// Equivalente a usarLlamadaAmigo de Code.js.
export async function POST(request) {
  const { sessionId } = await request.json();

  let pregunta;
  try {
    pregunta = await aplicarAyudaIndividual(sessionId, 'llamada');
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }

  return NextResponse.json(calcularRespuestaAmigo(pregunta.respuestaCorrecta, pregunta.nivel));
}
