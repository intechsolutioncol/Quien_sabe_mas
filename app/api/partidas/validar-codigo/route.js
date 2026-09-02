import { NextResponse } from 'next/server';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { obtenerJuegoPorCodigo } from '@/lib/juego/datos';

// Paso 1 del ingreso del estudiante: valida el código ANTES de pedirle
// el nombre (para no hacerlo escribir su nombre si el código está mal),
// sin crear ninguna sesión todavía. Mismos mensajes de error que ya usa
// unirseConCodigo en /api/partidas/unirse.
export async function GET(request) {
  const codigo = new URL(request.url).searchParams.get('codigo');
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  if (!codigoNormalizado) {
    return NextResponse.json({ error: 'Escribe el código del juego.' }, { status: 400 });
  }

  const admin = crearClienteAdmin();
  const juego = await obtenerJuegoPorCodigo(admin, codigoNormalizado);
  if (!juego) {
    return NextResponse.json({ error: 'El código ingresado no existe. Verifícalo con tu profesor.' }, { status: 404 });
  }
  if (!juego.activo) {
    return NextResponse.json({ error: 'Este juego está inactivo. Consulta a tu profesor.' }, { status: 403 });
  }

  return NextResponse.json({
    codigo: juego.codigo,
    nombreJuego: juego.nombre_juego,
    tematica: juego.tematica,
    modo: juego.modo,
  });
}
