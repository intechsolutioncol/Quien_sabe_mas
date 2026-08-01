import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { obtenerJuegoVivoDelProfesor, obtenerSesionVivoPublica } from '@/lib/juego/vivo-datos';

// Expulsa a un estudiante del lobby (host-only). El cambio en
// numero_jugadores/nombres_jugadores llega a todos por Realtime, igual
// que cualquier otro cambio de la sesión pública.
export async function POST(request) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { codigo, sessionIdJugador } = await request.json();
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  const admin = crearClienteAdmin();

  try {
    await obtenerJuegoVivoDelProfesor(admin, codigoNormalizado, user.id);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }

  const { error } = await admin.rpc('vivo_expulsar_jugador', {
    p_codigo: codigoNormalizado,
    p_session_id: sessionIdJugador,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  const estado = await obtenerSesionVivoPublica(admin, codigoNormalizado);
  return NextResponse.json(estado);
}
