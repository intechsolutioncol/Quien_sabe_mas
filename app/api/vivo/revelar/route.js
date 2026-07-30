import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { obtenerJuegoVivoDelProfesor, obtenerSesionVivoPublica } from '@/lib/juego/vivo-datos';

// Corta el tiempo de la pregunta actual y revela ya. Equivalente a
// revelarAhoraVivo de Vivo.js.
export async function POST(request) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { codigo } = await request.json();
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  const admin = crearClienteAdmin();

  try {
    await obtenerJuegoVivoDelProfesor(admin, codigoNormalizado, user.id);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }

  const { error } = await admin.rpc('vivo_revelar_ahora', { p_codigo: codigoNormalizado });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  const estado = await obtenerSesionVivoPublica(admin, codigoNormalizado);
  return NextResponse.json(estado);
}
