import { NextResponse } from 'next/server';
import { marcarAyudaVivoUsada } from '@/lib/juego/vivo-ayudas';
import { calcularEliminacion5050 } from '@/lib/juego/ayudas';

// Equivalente a usarCincuentaVivo de Vivo.js.
export async function POST(request) {
  const { codigo, sessionId } = await request.json();
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();

  const { data, error } = await marcarAyudaVivoUsada(codigoNormalizado, sessionId, 'cincuenta');
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  return NextResponse.json({ eliminar: calcularEliminacion5050(data.respuestaCorrecta) });
}
