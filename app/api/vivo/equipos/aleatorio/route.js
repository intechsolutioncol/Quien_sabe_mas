import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { obtenerJuegoVivoDelProfesor } from '@/lib/juego/vivo-datos';

// Reparte a los jugadores conectados en N equipos balanceados al azar
// (host-only, solo tiene sentido mientras están en el lobby).
export async function POST(request) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { codigo, cantidadEquipos } = await request.json();
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  const admin = crearClienteAdmin();

  try {
    await obtenerJuegoVivoDelProfesor(admin, codigoNormalizado, user.id);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }

  const { error } = await admin.rpc('vivo_formar_equipos_aleatorio', {
    p_codigo: codigoNormalizado,
    p_cantidad_equipos: parseInt(cantidadEquipos, 10) || 2,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  return NextResponse.json({ ok: true });
}
