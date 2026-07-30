// Verifica que Supabase Realtime realmente empuja los cambios de
// sesiones_vivo (no solo que la base de datos se actualiza): se suscribe
// con la ANON key, igual que haría el navegador de un estudiante, y
// confirma que llegan eventos cuando el host avanza el juego.
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
  const correo = `profesor-realtime-${Date.now()}@example.com`;
  const password = 'contraseña-de-prueba-123';
  const { data: creado } = await admin.auth.admin.createUser({ email: correo, password, email_confirm: true });

  // Cliente anon "como si fuera el navegador de un estudiante", solo para Realtime.
  const anonRealtime = createClient(URL_SUPABASE, ANON_KEY);

  try {
    const cookieHost = await cookieDeSesion(correo, password);

    const crear = await jsonFetch(
      `${BASE}/api/juegos`,
      {
        method: 'POST',
        body: JSON.stringify({ nombreJuego: 'Prueba Realtime', cantidadPreguntas: 2, modo: 'vivo', avanceVivo: 'manual', segundosPorPregunta: 30, ayudas: {} }),
      },
      cookieHost
    );
    assert(crear.status === 201, `crear juego responde 201 (fue ${crear.status})`);
    const codigo = crear.cuerpo.codigo;

    await jsonFetch(`${BASE}/api/juegos/${codigo}/preguntas/demo`, { method: 'POST' }, cookieHost);
    await jsonFetch(`${BASE}/api/vivo/iniciar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);

    const eventos = [];
    const canal = anonRealtime
      .channel(`prueba:${codigo}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sesiones_vivo', filter: `codigo=eq.${codigo}` }, (payload) => {
        eventos.push(payload.new.estado_juego);
      });

    await new Promise((resolve, reject) => {
      canal.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error('No se pudo suscribir al canal de Realtime: ' + status));
      });
    });
    console.log('OK: suscripción a Realtime confirmada (SUBSCRIBED)');

    // Deja un respiro para que la suscripción quede completamente activa
    // del lado del servidor antes de disparar el cambio.
    await new Promise((r) => setTimeout(r, 500));

    await jsonFetch(`${BASE}/api/vivo/avanzar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);

    // Espera a que llegue el evento por Realtime (no por polling nuestro).
    const limite = Date.now() + 8000;
    while (eventos.length === 0 && Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 200));
    }
    assert(eventos.includes('pregunta'), `Realtime empujó el cambio a "pregunta" (eventos recibidos: ${JSON.stringify(eventos)})`);

    await jsonFetch(`${BASE}/api/vivo/terminar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);
    const limite2 = Date.now() + 8000;
    while (!eventos.includes('finalizado') && Date.now() < limite2) {
      await new Promise((r) => setTimeout(r, 200));
    }
    assert(eventos.includes('finalizado'), `Realtime empujó el cambio a "finalizado" (eventos: ${JSON.stringify(eventos)})`);

    await anonRealtime.removeChannel(canal);
    console.log('\n✅ Realtime verificado: los cambios llegan por WebSocket, no solo por polling.');
  } finally {
    await admin.auth.admin.deleteUser(creado.user.id);
    console.log('Limpieza: usuario y datos de prueba eliminados.');
  }
})()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌', err.message);
    process.exit(1);
  });
