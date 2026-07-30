import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Refresca la sesión de Supabase Auth en cada request (los tokens expiran
// y deben renovarse) y protege /profesor/panel: sin sesión, redirige a
// /profesor/login. Reemplaza al hostToken/validarTokenDocente_ de Code.js.
export async function middleware(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const esRutaProtegida = request.nextUrl.pathname.startsWith('/profesor/panel');

  if (esRutaProtegida && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/profesor/login';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/profesor/panel/:path*'],
};
