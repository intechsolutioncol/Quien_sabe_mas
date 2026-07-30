import { crearClienteServidor } from '@/lib/supabase/server';

// Lee la sesión del profesor desde las cookies (Supabase Auth). Devuelve
// el usuario autenticado o null. Reemplaza validarTokenDocente_ de Code.js:
// antes se validaba un token de CacheService a mano, ahora lo maneja
// Supabase Auth y esto solo lee el resultado.
export async function requerirProfesor() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
