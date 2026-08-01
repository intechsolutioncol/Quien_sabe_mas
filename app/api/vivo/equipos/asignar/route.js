import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { obtenerJuegoVivoDelProfesor } from '@/lib/juego/vivo-datos';

// Asigna a un jugador puntual a un equipo (host-only). Lo usa el
// arrastrar-y-soltar del lobby cuando el profesor mueve una tarjeta.
export async function POST(request) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { codigo, sessionIdJugador, equipo } = await request.json();
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  const admin = crearClienteAdmin();

  try {
    await obtenerJuegoVivoDelProfesor(admin, codigoNormalizado, user.id);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }

  const { error } = await admin.rpc('vivo_asignar_equipo', {
    p_codigo: codigoNormalizado,
    p_session_id: sessionIdJugador,
    p_equipo: equipo,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  return NextResponse.json({ ok: true });
}
