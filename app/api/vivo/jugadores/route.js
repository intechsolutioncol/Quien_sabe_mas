import { NextResponse } from 'next/server';
import { crearClienteAdmin } from '@/lib/supabase/admin';

// Lista de NOMBRES (sin sessionId) de los jugadores conectados, para que
// un estudiante elija a quién quitarle puntos. A diferencia de
// /api/vivo/jugadores-host (solo para el profesor autenticado), esta
// ruta es pública porque la usan estudiantes anónimos, así que nunca
// debe exponer el sessionId de nadie más (es el "token" con el que se
// puede responder/usar ayudas en nombre de otro jugador).
export async function GET(request) {
  const codigo = new URL(request.url).searchParams.get('codigo');
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  if (!codigoNormalizado) return NextResponse.json({ error: 'Falta el código.' }, { status: 400 });

  const admin = crearClienteAdmin();
  const { data, error } = await admin
    .from('sesiones_vivo_jugadores')
    .select('nombre')
    .eq('codigo', codigoNormalizado)
    .order('nombre');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data.map((j) => j.nombre));
}
