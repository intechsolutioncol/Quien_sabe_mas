import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { obtenerJuegoVivoDelProfesor } from '@/lib/juego/vivo-datos';

// Lista de jugadores conectados CON su sessionId, solo para el host
// (autenticado y dueño del juego). A diferencia de cualquier endpoint
// que consuma un estudiante, aquí sí es seguro exponer el sessionId de
// cada jugador: lo usan el botón de expulsar y la asignación de equipos,
// ambos exclusivos del profesor.
export async function GET(request) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const codigo = new URL(request.url).searchParams.get('codigo');
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();

  const admin = crearClienteAdmin();
  try {
    await obtenerJuegoVivoDelProfesor(admin, codigoNormalizado, user.id);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }

  const { data, error } = await admin
    .from('sesiones_vivo_jugadores')
    .select('session_id, nombre, equipo')
    .eq('codigo', codigoNormalizado)
    .order('nombre');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data.map((j) => ({ sessionId: j.session_id, nombre: j.nombre, equipo: j.equipo })));
}
