import { NextResponse } from 'next/server';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { calcularEliminacion5050 } from '@/lib/juego/ayudas';

// Equivalente a usarCincuentaVivo de Vivo.js.
export async function POST(request) {
  const { codigo, sessionId } = await request.json();
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  const admin = crearClienteAdmin();

  const { data, error } = await admin.rpc('vivo_marcar_ayuda_usada', {
    p_codigo: codigoNormalizado,
    p_session_id: sessionId,
    p_nombre_ayuda: 'cincuenta',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  return NextResponse.json({ eliminar: calcularEliminacion5050(data.respuestaCorrecta) });
}
