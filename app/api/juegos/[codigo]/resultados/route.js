import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { mapearResultado } from '@/lib/juego/mapeo';

// Resultados de estudiantes de un juego (equivalente a
// obtenerResultadosDocente de Code.js).
export async function GET(_request, { params }) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { codigo } = await params;
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();

  const admin = crearClienteAdmin();
  const { data: juego } = await admin
    .from('juegos')
    .select('id')
    .eq('codigo', codigoNormalizado)
    .eq('profesor_id', user.id)
    .maybeSingle();
  if (!juego) return NextResponse.json({ error: 'No se encontró el juego indicado.' }, { status: 404 });

  const { data: resultados, error } = await admin
    .from('resultados')
    .select('*')
    .eq('juego_id', juego.id)
    .order('creado_en', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(resultados.map(mapearResultado));
}
