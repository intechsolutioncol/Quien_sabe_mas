import { createClient } from '@supabase/supabase-js';

// Cliente con la service role key: IGNORA por completo las políticas de
// RLS. Solo debe usarse dentro de Route Handlers/Server Actions, nunca
// importarse desde código que corra en el navegador (por eso la env var
// no tiene el prefijo NEXT_PUBLIC_). Reemplaza el rol que hoy cumple
// CacheService + SpreadsheetApp en Code.js/Datos.js/Vivo.js: el servidor
// confía en sí mismo para leer/escribir bancos de preguntas, sesiones de
// partida y resultados sin pasar por RLS.
export function crearClienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
