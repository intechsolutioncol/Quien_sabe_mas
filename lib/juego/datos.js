import { mapearPreguntaBanco } from './mapeo';

// Helpers de acceso a datos compartidos entre las rutas de estudiante y de
// profesor. Siempre reciben un cliente Supabase con service role (admin):
// estas consultas deben poder leer/escribir sin las restricciones de RLS
// (los estudiantes no tienen sesión de Supabase Auth).

export async function obtenerJuegoPorCodigo(admin, codigo) {
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  const { data, error } = await admin.from('juegos').select('*').eq('codigo', codigoNormalizado).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Busca un juego por código verificando que pertenezca al profesor dado
// (sin importar el modo). Lanza un Error legible si no existe o no es
// suyo, para que la ruta solo tenga que traducirlo a un 404.
export async function obtenerJuegoDelProfesor(admin, codigo, profesorId) {
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  const { data, error } = await admin
    .from('juegos')
    .select('*')
    .eq('codigo', codigoNormalizado)
    .eq('profesor_id', profesorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('No se encontró el juego indicado.');
  return data;
}

export async function obtenerBancoPreguntas(admin, juegoId) {
  const { data, error } = await admin.from('preguntas').select('*').eq('juego_id', juegoId);
  if (error) throw new Error(error.message);
  return data.map(mapearPreguntaBanco);
}

export async function guardarResultado(admin, juegoId, nombreEstudiante, puntaje, totalPreguntas, resultado) {
  const { error } = await admin.from('resultados').insert({
    juego_id: juegoId,
    nombre_estudiante: nombreEstudiante,
    puntaje,
    total_preguntas: totalPreguntas,
    resultado,
  });
  if (error) throw new Error(error.message);
}
