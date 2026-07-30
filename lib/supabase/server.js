import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Cliente para usar en Server Components, Server Actions y Route Handlers.
// Lee/escribe la sesión del profesor desde las cookies; respeta RLS según
// auth.uid(). NUNCA usar este cliente para leer datos sensibles de
// estudiantes anónimos (preguntas con respuesta correcta, sesiones en
// vivo privadas): para eso existe clienteAdmin() en admin.js.
export async function crearClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Se llama desde un Server Component sin permiso de escritura;
            // el proxy.js se encarga de refrescar la sesión en ese caso.
          }
        },
      },
    }
  );
}
