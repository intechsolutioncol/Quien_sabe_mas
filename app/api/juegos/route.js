import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { validarYNormalizarDatosJuego } from '@/lib/juego/validacion';
import { generarCodigoJuego } from '@/lib/juego/codigo';
import { mapearJuego } from '@/lib/juego/mapeo';

// Lista los juegos del profesor autenticado (equivalente a
// listarJuegosDocente de Code.js). El aislamiento por dueño ya lo impone
// la política RLS de la tabla, pero aquí se filtra explícito además para
// que el conteo de preguntas por juego (más abajo) sea correcto.
export async function GET() {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const admin = crearClienteAdmin();
  const { data: juegos, error } = await admin
    .from('juegos')
    .select('*')
    .eq('profesor_id', user.id)
    .order('creado_en', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = juegos.map((j) => j.id);
  let conteos = {};
  if (ids.length) {
    const { data: filas, error: errorPreguntas } = await admin.from('preguntas').select('juego_id').in('juego_id', ids);
    if (errorPreguntas) return NextResponse.json({ error: errorPreguntas.message }, { status: 500 });
    conteos = filas.reduce((acc, f) => {
      acc[f.juego_id] = (acc[f.juego_id] || 0) + 1;
      return acc;
    }, {});
  }

  return NextResponse.json(juegos.map((j) => mapearJuego(j, conteos[j.id] || 0)));
}

// Crea un juego nuevo (equivalente a crearJuego de Code.js).
export async function POST(request) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  let datos;
  try {
    datos = validarYNormalizarDatosJuego(await request.json());
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const admin = crearClienteAdmin();
  const codigo = await generarCodigoJuego(admin);

  const { data: juego, error } = await admin
    .from('juegos')
    .insert({
      codigo,
      profesor_id: user.id,
      nombre_juego: datos.nombreJuego,
      profesor_nombre: datos.profesorNombre,
      tematica: datos.tematica,
      cantidad_preguntas: datos.cantidadPreguntas,
      modo: datos.modo,
      ayudas: datos.ayudas,
      modo_tiempo: datos.modoTiempo,
      avance_vivo: datos.avanceVivo,
      segundos_por_pregunta: datos.segundosPorPregunta,
      duracion_total_segundos: datos.duracionTotalSegundos,
      agrupacion_vivo: datos.agrupacionVivo,
      cantidad_equipos: datos.cantidadEquipos,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(mapearJuego(juego, 0), { status: 201 });
}
