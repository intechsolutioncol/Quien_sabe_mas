import { NextResponse } from 'next/server';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { obtenerSesionVivoPublica } from '@/lib/juego/vivo-datos';

// Sin secretos: cualquiera (host o estudiante) puede leer este estado.
// También dispara el avance perezoso por reloj (equivalente a
// avanzarSiCorresponde_): el host llama esta ruta cada pocos segundos
// mientras su pantalla está activa, y esa es la única "fuente de tics"
// que hace avanzar la partida (no hay cron ni WebSocket del lado
// servidor). Los estudiantes reciben los cambios por Supabase Realtime
// y solo usan esta ruta para la primera carga de la pantalla.
export async function GET(request) {
  const codigo = new URL(request.url).searchParams.get('codigo');
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  if (!codigoNormalizado) return NextResponse.json({ error: 'Falta el código.' }, { status: 400 });

  const admin = crearClienteAdmin();
  const { error: errorAvance } = await admin.rpc('vivo_avanzar_si_corresponde', { p_codigo: codigoNormalizado });
  if (errorAvance) return NextResponse.json({ error: errorAvance.message }, { status: 500 });

  const estado = await obtenerSesionVivoPublica(admin, codigoNormalizado);
  if (!estado) return NextResponse.json({ error: 'Esta sesión en vivo ya no existe.' }, { status: 404 });

  return NextResponse.json(estado);
}
