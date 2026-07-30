import { NextResponse } from 'next/server';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { validarAyuda } from '@/lib/juego/validar-ayuda';
import { calcularPorcentajesPublico } from '@/lib/juego/ayudas';

// Equivalente a usarPreguntaPublico de Code.js.
export async function POST(request) {
  const { sessionId } = await request.json();
  const admin = crearClienteAdmin();

  const { data: estado, error } = await admin.from('sesiones_individuales').select('*').eq('session_id', sessionId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    validarAyuda(estado, 'publico');
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }

  const preguntaActual = estado.preguntas[estado.pregunta_actual];
  const porcentajes = calcularPorcentajesPublico(preguntaActual.respuestaCorrecta, preguntaActual.nivel);

  const ayudasUsadas = { ...estado.ayudas_usadas, publico: true };
  const { error: errorUpdate } = await admin
    .from('sesiones_individuales')
    .update({ ayudas_usadas: ayudasUsadas })
    .eq('session_id', sessionId);
  if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 500 });

  return NextResponse.json({ porcentajes });
}
