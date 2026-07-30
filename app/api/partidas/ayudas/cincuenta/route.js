import { NextResponse } from 'next/server';
import { aplicarAyudaIndividual } from '@/lib/juego/ayuda-individual';
import { calcularEliminacion5050 } from '@/lib/juego/ayudas';

// Equivalente a usarCincuenta de Code.js.
export async function POST(request) {
  const { sessionId } = await request.json();

  let pregunta;
  try {
    pregunta = await aplicarAyudaIndividual(sessionId, 'cincuenta');
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }

  return NextResponse.json({ eliminar: calcularEliminacion5050(pregunta.respuestaCorrecta) });
}
