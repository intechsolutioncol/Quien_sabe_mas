import { crearClienteAdmin } from '@/lib/supabase/admin';
import { validarAyuda } from './validar-ayuda';

// Lógica compartida por las 3 rutas de ayudas del modo individual
// (cincuenta/llamada/publico): leer el estado, validar que la ayuda se
// pueda usar, marcarla como usada, y devolver la pregunta actual para que
// cada ruta calcule su resultado específico. Lanza un Error con
// `.status` (409 si la ayuda no es válida en este momento, 500 si falló
// la base de datos) para que la ruta solo tenga que traducirlo a JSON.
export async function aplicarAyudaIndividual(sessionId, nombreAyuda) {
  const admin = crearClienteAdmin();

  const { data: estado, error } = await admin
    .from('sesiones_individuales')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) throw Object.assign(new Error(error.message), { status: 500 });

  try {
    validarAyuda(estado, nombreAyuda);
  } catch (err) {
    throw Object.assign(err, { status: 409 });
  }

  const ayudasUsadas = { ...estado.ayudas_usadas, [nombreAyuda]: true };
  const { error: errorUpdate } = await admin
    .from('sesiones_individuales')
    .update({ ayudas_usadas: ayudasUsadas })
    .eq('session_id', sessionId);
  if (errorUpdate) throw Object.assign(new Error(errorUpdate.message), { status: 500 });

  return estado.preguntas[estado.pregunta_actual];
}
