import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { obtenerJuegoDelProfesor } from '@/lib/juego/datos';
import { mapearPreguntaEditable } from '@/lib/juego/mapeo';
import { normalizarEntradaPregunta, validarCamposPregunta } from '@/lib/juego/preguntas';

// Edita o elimina una pregunta puntual (por ejemplo, corregir una que
// generó la IA). El filtro `juego_id` además de `id` evita que un
// profesor pueda tocar una pregunta de un juego que no es el indicado
// en la URL, aunque conociera el id.
export async function PUT(request, { params }) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { codigo, id } = await params;
  const admin = crearClienteAdmin();

  let juego;
  try {
    juego = await obtenerJuegoDelProfesor(admin, codigo, user.id);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }

  const datos = normalizarEntradaPregunta(await request.json());
  const problemas = validarCamposPregunta(datos);
  if (problemas.length) return NextResponse.json({ error: problemas.join('; ') }, { status: 400 });

  const { data, error } = await admin
    .from('preguntas')
    .update({
      nivel: datos.nivel,
      pregunta: datos.pregunta,
      opcion_a: datos.opcionA,
      opcion_b: datos.opcionB,
      opcion_c: datos.opcionC,
      opcion_d: datos.opcionD,
      respuesta_correcta: datos.respuestaCorrecta,
    })
    .eq('id', id)
    .eq('juego_id', juego.id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'No se encontró la pregunta indicada.' }, { status: 404 });

  return NextResponse.json(mapearPreguntaEditable(data));
}

export async function DELETE(_request, { params }) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { codigo, id } = await params;
  const admin = crearClienteAdmin();

  let juego;
  try {
    juego = await obtenerJuegoDelProfesor(admin, codigo, user.id);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }

  const { data, error } = await admin.from('preguntas').delete().eq('id', id).eq('juego_id', juego.id).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'No se encontró la pregunta indicada.' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
