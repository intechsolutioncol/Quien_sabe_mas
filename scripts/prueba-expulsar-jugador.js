// Prueba expulsar a un estudiante del lobby en vivo: solo el host dueño
// puede hacerlo, solo mientras está en "lobby", y el jugador expulsado
// deja de contar en numero_jugadores/nombres_jugadores.
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
  const { data: creado } = await admin.auth.admin.createUser({ email: `profesor-expulsar-${Date.now()}@example.com`, password, email_confirm: true });

  try {
    const cookieHost = await cookieDeSesion(creado.user.email, password);

    const crear = await jsonFetch(
      `${BASE}/api/juegos`,
      { method: 'POST', body: JSON.stringify({ nombreJuego: 'Prueba expulsar', cantidadPreguntas: 2, modo: 'vivo', avanceVivo: 'manual', segundosPorPregunta: 30, ayudas: {} }) },
      cookieHost
    );
    const codigo = crear.cuerpo.codigo;
    await jsonFetch(`${BASE}/api/juegos/${codigo}/preguntas/demo`, { method: 'POST' }, cookieHost);
    await jsonFetch(`${BASE}/api/vivo/iniciar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);

    const unirse1 = await jsonFetch(`${BASE}/api/partidas/unirse`, { method: 'POST', body: JSON.stringify({ codigo, nombreEstudiante: 'Se queda' }) });
    const unirse2 = await jsonFetch(`${BASE}/api/partidas/unirse`, { method: 'POST', body: JSON.stringify({ codigo, nombreEstudiante: 'Lo expulsan' }) });

    const listaHost = await jsonFetch(`${BASE}/api/vivo/jugadores-host?codigo=${codigo}`, { method: 'GET' }, cookieHost);
    assert(listaHost.status === 200 && listaHost.cuerpo.length === 2, `jugadores-host devuelve 2 jugadores con sessionId (fue ${JSON.stringify(listaHost.cuerpo)})`);
    const objetivo = listaHost.cuerpo.find((j) => j.nombre === 'Lo expulsan');
    assert(!!objetivo && !!objetivo.sessionId, 'el jugador a expulsar tiene sessionId visible para el host');

    // Otro profesor no puede expulsar en un juego ajeno.
    const { data: creadoOtro } = await admin.auth.admin.createUser({ email: `otro-expulsar-${Date.now()}@example.com`, password, email_confirm: true });
    const cookieOtro = await cookieDeSesion(creadoOtro.user.email, password);
    const expulsarAjeno = await jsonFetch(`${BASE}/api/vivo/expulsar`, { method: 'POST', body: JSON.stringify({ codigo, sessionIdJugador: objetivo.sessionId }) }, cookieOtro);
    assert(expulsarAjeno.status === 404, `otro profesor no puede expulsar en este juego (fue ${expulsarAjeno.status})`);
    await admin.auth.admin.deleteUser(creadoOtro.user.id);

    const expulsar = await jsonFetch(`${BASE}/api/vivo/expulsar`, { method: 'POST', body: JSON.stringify({ codigo, sessionIdJugador: objetivo.sessionId }) }, cookieHost);
    assert(expulsar.status === 200, `expulsar responde 200 (fue ${expulsar.status}: ${JSON.stringify(expulsar.cuerpo)})`);
    assert(expulsar.cuerpo.numeroJugadores === 1, 'quedó 1 jugador tras expulsar al otro');
    assert(!expulsar.cuerpo.nombresJugadores.includes('Lo expulsan'), 'el nombre expulsado ya no aparece en la lista pública');
    assert(expulsar.cuerpo.nombresJugadores.includes('Se queda'), 'el jugador que no fue expulsado sigue apareciendo');

    // El jugador expulsado ya no puede responder ni nada: su fila no existe.
    const { data: filaExpulsada } = await admin.from('sesiones_vivo_jugadores').select('*').eq('codigo', codigo).eq('session_id', unirse2.cuerpo.sessionId).maybeSingle();
    assert(!filaExpulsada, 'la fila del jugador expulsado ya no existe en la base de datos');

    // Avanza el juego y confirma que ya no se puede expulsar (solo en lobby).
    await jsonFetch(`${BASE}/api/vivo/avanzar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);
    const expulsarTarde = await jsonFetch(`${BASE}/api/vivo/expulsar`, { method: 'POST', body: JSON.stringify({ codigo, sessionIdJugador: unirse1.cuerpo.sessionId }) }, cookieHost);
    assert(expulsarTarde.status === 409, `expulsar fuera del lobby da error (fue ${expulsarTarde.status})`);

    console.log('\n✅ Expulsar jugador del lobby verificado sin errores.');
  } finally {
    await admin.auth.admin.deleteUser(creado.user.id);
    console.log('Limpieza: usuario(s) y datos de prueba eliminados.');
  }
})().catch((err) => {
  console.error('\n❌', err.message);
  process.exitCode = 1;
});
