import { createBrowserClient } from '@supabase/ssr';

// Cliente para usar en Client Components (navegador). Usa la anon key:
// respeta siempre las políticas de RLS según la sesión del usuario logueado.
export function crearClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
