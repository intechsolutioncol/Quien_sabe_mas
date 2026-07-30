import { NextResponse } from 'next/server';
import { marcarAyudaVivoUsada } from '@/lib/juego/vivo-ayudas';
import { calcularRespuestaAmigo } from '@/lib/juego/ayudas';

// Equivalente a usarLlamadaAmigoVivo de Vivo.js.
export async function POST(request) {
  const { codigo, sessionId } = await request.json();
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();

  const { data, error } = await marcarAyudaVivoUsada(codigoNormalizado, sessionId, 'llamada');
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  return NextResponse.json(calcularRespuestaAmigo(data.respuestaCorrecta, data.nivel));
}
