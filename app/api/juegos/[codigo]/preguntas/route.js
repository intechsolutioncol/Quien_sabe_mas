import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { obtenerJuegoDelProfesor } from '@/lib/juego/datos';
import { mapearPreguntaEditable } from '@/lib/juego/mapeo';
import { normalizarEntradaPregunta, validarCamposPregunta } from '@/lib/juego/preguntas';

// Lista (GET) o agrega una (POST) pregunta individual de un juego, para
// la pantalla de edición del profesor. El reemplazo completo del banco
// sigue existiendo aparte (CSV/IA/banco demo, en las rutas hermanas).
export async function GET(_request, { params }) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { codigo } = await params;
  const admin = crearClienteAdmin();

  let juego;
  try {
    juego = await obtenerJuegoDelProfesor(admin, codigo, user.id);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }

  const { data, error } = await admin
    .from('preguntas')
    .select('*')
    .eq('juego_id', juego.id)
    .order('nivel')
    .order('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data.map(mapearPreguntaEditable));
}

export async function POST(request, { params }) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { codigo } = await params;
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
    .insert({
      juego_id: juego.id,
      nivel: datos.nivel,
      pregunta: datos.pregunta,
      opcion_a: datos.opcionA,
      opcion_b: datos.opcionB,
      opcion_c: datos.opcionC,
      opcion_d: datos.opcionD,
      respuesta_correcta: datos.respuestaCorrecta,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(mapearPreguntaEditable(data), { status: 201 });
}
