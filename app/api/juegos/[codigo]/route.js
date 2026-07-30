import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { validarYNormalizarDatosJuego } from '@/lib/juego/validacion';
import { mapearJuego } from '@/lib/juego/mapeo';

// Edita un juego existente (mismo código, para no romper los enlaces que
// ya tienen los estudiantes). Las partidas ya iniciadas no se ven
// afectadas: cada una guarda su propia copia de la configuración al
// entrar con el código. Equivalente a actualizarJuego de Code.js.
export async function PUT(request, { params }) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { codigo } = await params;
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();

  const admin = crearClienteAdmin();
  const { data: existente } = await admin
    .from('juegos')
    .select('*')
    .eq('codigo', codigoNormalizado)
    .eq('profesor_id', user.id)
    .maybeSingle();
  if (!existente) return NextResponse.json({ error: 'No se encontró el juego indicado.' }, { status: 404 });

  let datos;
  try {
    datos = validarYNormalizarDatosJuego(await request.json());
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const { data: actualizado, error } = await admin
    .from('juegos')
    .update({
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
    })
    .eq('codigo', codigoNormalizado)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(mapearJuego(actualizado));
}
