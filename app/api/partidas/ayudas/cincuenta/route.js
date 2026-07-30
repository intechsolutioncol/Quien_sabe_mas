import { NextResponse } from 'next/server';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { validarAyuda } from '@/lib/juego/validar-ayuda';
import { calcularEliminacion5050 } from '@/lib/juego/ayudas';

// Equivalente a usarCincuenta de Code.js.
export async function POST(request) {
  const { sessionId } = await request.json();
  const admin = crearClienteAdmin();

  const { data: estado, error } = await admin.from('sesiones_individuales').select('*').eq('session_id', sessionId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    validarAyuda(estado, 'cincuenta');
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }

  const correcta = estado.preguntas[estado.pregunta_actual].respuestaCorrecta;
  const eliminar = calcularEliminacion5050(correcta);

  const ayudasUsadas = { ...estado.ayudas_usadas, cincuenta: true };
  const { error: errorUpdate } = await admin
    .from('sesiones_individuales')
    .update({ ayudas_usadas: ayudasUsadas })
    .eq('session_id', sessionId);
  if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 500 });

  return NextResponse.json({ eliminar });
}
