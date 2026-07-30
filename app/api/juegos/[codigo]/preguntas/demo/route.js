import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import preguntasDemo from '@/supabase/seed/preguntas_demo.json';

// Carga el banco de 100 preguntas de cultura general (portado de
// legacy-apps-script/Questions.js) en un juego, para poder probar sin
// escribir preguntas propias. Reemplaza cualquier pregunta que ya tuviera.
export async function POST(_request, { params }) {
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
  if (!juego) return NextResponse.json({ error: 'Juego no encontrado.' }, { status: 404 });

  const filas = preguntasDemo.map((p) => ({
    juego_id: juego.id,
    nivel: p.nivel,
    pregunta: p.pregunta,
    opcion_a: p.opciones.A,
    opcion_b: p.opciones.B,
    opcion_c: p.opciones.C,
    opcion_d: p.opciones.D,
    respuesta_correcta: p.respuestaCorrecta,
  }));

  const { error: errorBorrar } = await admin.from('preguntas').delete().eq('juego_id', juego.id);
  if (errorBorrar) return NextResponse.json({ error: errorBorrar.message }, { status: 500 });

  const { error: errorInsertar } = await admin.from('preguntas').insert(filas);
  if (errorInsertar) return NextResponse.json({ error: errorInsertar.message }, { status: 500 });

  return NextResponse.json({ totalFilas: filas.length, importadas: filas.length, errores: [] });
}
