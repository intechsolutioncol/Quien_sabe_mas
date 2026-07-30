import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { crearClienteAdmin } from '@/lib/supabase/admin';

// Activa/desactiva un juego (equivalente a alternarActivoJuego de Code.js).
export async function PATCH(request, { params }) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { codigo } = await params;
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  const { activo } = await request.json();

  const admin = crearClienteAdmin();
  const { data, error } = await admin
    .from('juegos')
    .update({ activo: !!activo })
    .eq('codigo', codigoNormalizado)
    .eq('profesor_id', user.id)
    .select('codigo')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'No se encontró el juego indicado.' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
