import { crearClienteAdmin } from '@/lib/supabase/admin';

// Compartido por las 3 rutas de ayudas del modo en vivo: valida y marca
// la ayuda como usada de forma atómica en la base de datos (función
// vivo_marcar_ayuda_usada) y devuelve { respuestaCorrecta, nivel } para
// que cada ruta calcule su resultado con las mismas funciones puras que
// usa el modo individual (lib/juego/ayudas.js).
export async function marcarAyudaVivoUsada(codigo, sessionId, nombreAyuda) {
  const admin = crearClienteAdmin();
  return admin.rpc('vivo_marcar_ayuda_usada', {
    p_codigo: codigo,
    p_session_id: sessionId,
    p_nombre_ayuda: nombreAyuda,
  });
}
