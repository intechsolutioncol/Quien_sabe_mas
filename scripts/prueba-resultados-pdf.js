// Prueba el nuevo DELETE /api/juegos/[codigo]/resultados (la parte de
// "borrar resultados al descargar el PDF" que sí corre en el servidor;
// la generación del PDF en sí es 100% del navegador y se prueba a ojo).
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');

const BASE = 'http://localhost:3000';
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_SUPABASE, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function assert(cond, mensaje) {
  if (!cond) throw new Error('FALLÓ: ' + mensaje);
  console.log('OK:', mensaje);
}

async function jsonFetch(url, opciones, cookieHeader) {
  const respuesta = await fetch(url, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(cookieHeader ? { Cookie: cookieHeader } : {}), ...(opciones && opciones.headers) },
  });
  const cuerpo = await respuesta.json().catch(() => null);
  return { status: respuesta.status, cuerpo };
}

async function cookieDeSesion(email, password) {
  const anon = createClient(URL_SUPABASE, ANON_KEY);
  const { data: signIn, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  let cookies = [];
  const ssr = createServerClient(URL_SUPABASE, ANON_KEY, { cookies: { getAll: () => [], setAll: (c) => { cookies = c; } } });
  await ssr.auth.setSession({ access_token: signIn.session.access_token, refresh_token: signIn.session.refresh_token });
  return cookies.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join('; ');
}

(async () => {
  const password = 'contraseña-de-prueba-123';
  const { data: creado } = await admin.auth.admin.createUser({ email: `profesor-pdf-${Date.now()}@example.com`, password, email_confirm: true });

  try {
    const cookieHost = await cookieDeSesion(creado.user.email, password);

    const crear = await jsonFetch(
      `${BASE}/api/juegos`,
      { method: 'POST', body: JSON.stringify({ nombreJuego: 'Prueba PDF', cantidadPreguntas: 1, modo: 'individual', modoTiempo: 'porPregunta', segundosPorPregunta: 30, ayudas: {} }) },
      cookieHost
    );
    assert(crear.status === 201, `crear juego responde 201 (fue ${crear.status})`);
    const codigo = crear.cuerpo.codigo;
    await jsonFetch(`${BASE}/api/juegos/${codigo}/preguntas/demo`, { method: 'POST' }, cookieHost);

    // Genera un resultado real jugando una partida (falla a propósito).
    const unirse = await jsonFetch(`${BASE}/api/partidas/unirse`, { method: 'POST', body: JSON.stringify({ codigo, nombreEstudiante: 'Estudiante PDF' }) });
    await jsonFetch(`${BASE}/api/partidas/responder`, { method: 'POST', body: JSON.stringify({ sessionId: unirse.cuerpo.sessionId, opcionSeleccionada: 'Z' }) });

    const antes = await jsonFetch(`${BASE}/api/juegos/${codigo}/resultados`, { method: 'GET' }, cookieHost);
    assert(antes.status === 200 && antes.cuerpo.length === 1, `hay 1 resultado antes de borrar (fue ${JSON.stringify(antes.cuerpo)})`);

    // Otro profesor no puede borrar los resultados de este juego.
    const { data: creadoOtro } = await admin.auth.admin.createUser({ email: `otro-pdf-${Date.now()}@example.com`, password, email_confirm: true });
    const cookieOtro = await cookieDeSesion(creadoOtro.user.email, password);
    const borradoAjeno = await jsonFetch(`${BASE}/api/juegos/${codigo}/resultados`, { method: 'DELETE' }, cookieOtro);
    assert(borradoAjeno.status === 404, `otro profesor no puede borrar estos resultados (fue ${borradoAjeno.status})`);
    await admin.auth.admin.deleteUser(creadoOtro.user.id);

    const borrar = await jsonFetch(`${BASE}/api/juegos/${codigo}/resultados`, { method: 'DELETE' }, cookieHost);
    assert(borrar.status === 200, `borrar resultados responde 200 (fue ${borrar.status})`);

    const despues = await jsonFetch(`${BASE}/api/juegos/${codigo}/resultados`, { method: 'GET' }, cookieHost);
    assert(despues.cuerpo.length === 0, 'los resultados quedaron vacíos después de borrar');

    console.log('\n✅ Borrar resultados verificado sin errores.');
  } finally {
    await admin.auth.admin.deleteUser(creado.user.id);
    console.log('Limpieza: usuario(s) y datos de prueba eliminados.');
  }
})().catch((err) => {
  console.error('\n❌', err.message);
  process.exitCode = 1;
});
