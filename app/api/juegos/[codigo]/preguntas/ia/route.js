import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { distribuirPorNiveles } from '@/lib/juego/distribucion';
import { generarPreguntasGemini, validarPreguntaGenerada } from '@/lib/juego/gemini';

// Genera (y reemplaza) el banco de preguntas de un juego con IA
// (equivalente a generarPreguntasConIA de Code.js).
export async function POST(request, { params }) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { codigo } = await params;
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  const { edadEstudiantes } = await request.json();

  const admin = crearClienteAdmin();
  const { data: juego } = await admin
    .from('juegos')
    .select('*')
    .eq('codigo', codigoNormalizado)
    .eq('profesor_id', user.id)
    .maybeSingle();
  if (!juego) return NextResponse.json({ error: 'Juego no encontrado.' }, { status: 404 });
  if (!juego.tematica) {
    return NextResponse.json(
      { error: 'Este juego no tiene una temática definida. Edítalo y agrega una temática antes de generar preguntas con IA.' },
      { status: 400 }
    );
  }

  const edad = parseInt(edadEstudiantes, 10);
  if (!(edad >= 5 && edad <= 25)) {
    return NextResponse.json({ error: 'Ingresa una edad válida (entre 5 y 25 años).' }, { status: 400 });
  }

  const distribucion = distribuirPorNiveles(juego.cantidad_preguntas);

  let preguntasGeneradas;
  try {
    preguntasGeneradas = await generarPreguntasGemini(juego.tematica, edad, distribucion);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const errores = [];
  const preguntasValidas = [];
  preguntasGeneradas.forEach((p, idx) => {
    const problemas = validarPreguntaGenerada(p);
    if (problemas.length) {
      errores.push(`Pregunta ${idx + 1}: ${problemas.join('; ')}`);
      return;
    }
    preguntasValidas.push({
      juego_id: juego.id,
      nivel: Number(p.nivel),
      pregunta: p.pregunta.toString().trim(),
      opcion_a: p.opciones.A.toString().trim(),
      opcion_b: p.opciones.B.toString().trim(),
      opcion_c: p.opciones.C.toString().trim(),
      opcion_d: p.opciones.D.toString().trim(),
      respuesta_correcta: p.respuestaCorrecta.toString().trim().toUpperCase(),
    });
  });

  if (preguntasValidas.length === 0) {
    return NextResponse.json(
      { error: `La IA no devolvió preguntas con un formato válido. Intenta de nuevo. ${errores.join(' | ')}` },
      { status: 502 }
    );
  }

  const { error: errorBorrar } = await admin.from('preguntas').delete().eq('juego_id', juego.id);
  if (errorBorrar) return NextResponse.json({ error: errorBorrar.message }, { status: 500 });

  const { error: errorInsertar } = await admin.from('preguntas').insert(preguntasValidas);
  if (errorInsertar) return NextResponse.json({ error: errorInsertar.message }, { status: 500 });

  return NextResponse.json({
    totalFilas: preguntasGeneradas.length,
    importadas: preguntasValidas.length,
    errores,
  });
}
