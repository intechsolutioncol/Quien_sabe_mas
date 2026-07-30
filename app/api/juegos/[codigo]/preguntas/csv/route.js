import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { analizarPreguntasCsv } from '@/lib/juego/csv';

// Importa/reemplaza el banco de preguntas de un juego desde un CSV
// (equivalente a importarPreguntasExcel de Code.js).
export async function POST(request, { params }) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { codigo } = await params;
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  const { textoCsv } = await request.json();

  const admin = crearClienteAdmin();
  const { data: juego } = await admin
    .from('juegos')
    .select('id')
    .eq('codigo', codigoNormalizado)
    .eq('profesor_id', user.id)
    .maybeSingle();
  if (!juego) return NextResponse.json({ error: 'Juego no encontrado.' }, { status: 404 });

  let resultado;
  try {
    resultado = analizarPreguntasCsv(textoCsv);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const { error: errorBorrar } = await admin.from('preguntas').delete().eq('juego_id', juego.id);
  if (errorBorrar) return NextResponse.json({ error: errorBorrar.message }, { status: 500 });

  const filasNuevas = resultado.preguntas.map((p) => ({
    juego_id: juego.id,
    nivel: p.nivel,
    pregunta: p.pregunta,
    opcion_a: p.opcionA,
    opcion_b: p.opcionB,
    opcion_c: p.opcionC,
    opcion_d: p.opcionD,
    respuesta_correcta: p.respuestaCorrecta,
  }));
  const { error: errorInsertar } = await admin.from('preguntas').insert(filasNuevas);
  if (errorInsertar) return NextResponse.json({ error: errorInsertar.message }, { status: 500 });

  return NextResponse.json({
    totalFilas: resultado.totalFilas,
    importadas: resultado.preguntas.length,
    errores: resultado.errores,
  });
}
