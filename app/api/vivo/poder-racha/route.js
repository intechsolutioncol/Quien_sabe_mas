import { NextResponse } from 'next/server';
import { crearClienteAdmin } from '@/lib/supabase/admin';

// Usa el poder de racha (robar puntos a alguien de la sala, o
// protegerse con un escudo). El objetivo de "robar" se identifica por
// NOMBRE, nunca por sessionId (ver lib/juego/vivo-datos.js y la función
// SQL vivo_usar_poder_racha para el porqué).
export async function POST(request) {
  const { codigo, sessionId, accion, nombreObjetivo } = await request.json();
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  const admin = crearClienteAdmin();

  const { data, error } = await admin.rpc('vivo_usar_poder_racha', {
    p_codigo: codigoNormalizado,
    p_session_id: sessionId,
    p_accion: accion,
    p_nombre_objetivo: nombreObjetivo || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  return NextResponse.json(data);
}
