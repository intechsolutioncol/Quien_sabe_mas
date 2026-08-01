// Prueba el modo grupal (equipos) del modo en vivo: formar equipos al
// azar, asignar manualmente, y que el ranking por equipo sume bien los
// puntajes de sus integrantes. La respuesta sigue siendo individual.
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

async function responderCorrecto(codigo, sessionId) {
  const { data: sesion } = await admin.from('sesiones_vivo').select('indice_actual').eq('codigo', codigo).single();
  const { data: privado } = await admin.from('sesiones_vivo_privado').select('preguntas').eq('codigo', codigo).single();
  const correcta = privado.preguntas[sesion.indice_actual].respuestaCorrecta;
  return jsonFetch(`${BASE}/api/vivo/responder`, { method: 'POST', body: JSON.stringify({ codigo, sessionId, opcion: correcta }) });
}

(async () => {
  const password = 'contraseña-de-prueba-123';
  const { data: creado } = await admin.auth.admin.createUser({ email: `profesor-equipos-${Date.now()}@example.com`, password, email_confirm: true });

  try {
    const cookieHost = await cookieDeSesion(creado.user.email, password);

    const crear = await jsonFetch(
      `${BASE}/api/juegos`,
      {
        method: 'POST',
        body: JSON.stringify({
          nombreJuego: 'Prueba equipos', cantidadPreguntas: 2, modo: 'vivo', avanceVivo: 'manual',
          segundosPorPregunta: 30, agrupacionVivo: 'equipos', cantidadEquipos: 2, ayudas: {},
        }),
      },
      cookieHost
    );
    assert(crear.status === 201 && crear.cuerpo.agrupacionVivo === 'equipos', `crear juego en equipos responde 201 (fue ${crear.status}: ${JSON.stringify(crear.cuerpo)})`);
    const codigo = crear.cuerpo.codigo;
    await jsonFetch(`${BASE}/api/juegos/${codigo}/preguntas/demo`, { method: 'POST' }, cookieHost);

    const iniciar = await jsonFetch(`${BASE}/api/vivo/iniciar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);
    assert(iniciar.cuerpo.agrupacion === 'equipos' && iniciar.cuerpo.cantidadEquipos === 2, 'la sesión copió agrupación=equipos y cantidadEquipos=2 del juego');

    const nombres = ['P1', 'P2', 'P3', 'P4'];
    const sesiones = {};
    for (const nombre of nombres) {
      const r = await jsonFetch(`${BASE}/api/partidas/unirse`, { method: 'POST', body: JSON.stringify({ codigo, nombreEstudiante: nombre }) });
      sesiones[nombre] = r.cuerpo.sessionId;
    }

    // Otro profesor no puede formar/asignar equipos en este juego.
    const { data: creadoOtro } = await admin.auth.admin.createUser({ email: `otro-equipos-${Date.now()}@example.com`, password, email_confirm: true });
    const cookieOtro = await cookieDeSesion(creadoOtro.user.email, password);
    const aleatorioAjeno = await jsonFetch(`${BASE}/api/vivo/equipos/aleatorio`, { method: 'POST', body: JSON.stringify({ codigo, cantidadEquipos: 2 }) }, cookieOtro);
    assert(aleatorioAjeno.status === 404, `otro profesor no puede formar equipos aquí (fue ${aleatorioAjeno.status})`);
    await admin.auth.admin.deleteUser(creadoOtro.user.id);

    // Antes de asignar, jugadores-host muestra a todos sin equipo.
    const listaAntes = await jsonFetch(`${BASE}/api/vivo/jugadores-host?codigo=${codigo}`, { method: 'GET' }, cookieHost);
    assert(listaAntes.cuerpo.every((j) => j.equipo === null), 'todos empiezan sin equipo asignado');

    // Formar equipos al azar: balanceado (2 y 2).
    const aleatorio = await jsonFetch(`${BASE}/api/vivo/equipos/aleatorio`, { method: 'POST', body: JSON.stringify({ codigo, cantidadEquipos: 2 }) }, cookieHost);
    assert(aleatorio.status === 200, `formar equipos al azar responde 200 (fue ${aleatorio.status})`);
    const { data: filasTrasAzar } = await admin.from('sesiones_vivo_jugadores').select('nombre, equipo').eq('codigo', codigo);
    const conteoPorEquipo = filasTrasAzar.reduce((acc, f) => { acc[f.equipo] = (acc[f.equipo] || 0) + 1; return acc; }, {});
    assert(conteoPorEquipo[1] === 2 && conteoPorEquipo[2] === 2, `el azar reparte 2 y 2 (fue ${JSON.stringify(conteoPorEquipo)})`);

    // Asignación manual: mover a P1 al equipo 2 a mano (simula el drag-and-drop).
    const asignar = await jsonFetch(`${BASE}/api/vivo/equipos/asignar`, { method: 'POST', body: JSON.stringify({ codigo, sessionIdJugador: sesiones.P1, equipo: 2 }) }, cookieHost);
    assert(asignar.status === 200, `asignar manualmente responde 200 (fue ${asignar.status})`);
    const { data: filaP1 } = await admin.from('sesiones_vivo_jugadores').select('equipo').eq('codigo', codigo).eq('session_id', sesiones.P1).single();
    assert(filaP1.equipo === 2, 'P1 quedó asignado al equipo 2 manualmente');

    // Todos al equipo 1 excepto P4, para verificar la suma del ranking por equipo.
    await jsonFetch(`${BASE}/api/vivo/equipos/asignar`, { method: 'POST', body: JSON.stringify({ codigo, sessionIdJugador: sesiones.P1, equipo: 1 }) }, cookieHost);
    await jsonFetch(`${BASE}/api/vivo/equipos/asignar`, { method: 'POST', body: JSON.stringify({ codigo, sessionIdJugador: sesiones.P2, equipo: 1 }) }, cookieHost);
    await jsonFetch(`${BASE}/api/vivo/equipos/asignar`, { method: 'POST', body: JSON.stringify({ codigo, sessionIdJugador: sesiones.P3, equipo: 1 }) }, cookieHost);
    await jsonFetch(`${BASE}/api/vivo/equipos/asignar`, { method: 'POST', body: JSON.stringify({ codigo, sessionIdJugador: sesiones.P4, equipo: 2 }) }, cookieHost);

    // Ronda 1: P1, P2 y P3 (equipo 1) aciertan; P4 (equipo 2) no responde.
    await jsonFetch(`${BASE}/api/vivo/avanzar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);
    await responderCorrecto(codigo, sesiones.P1);
    await responderCorrecto(codigo, sesiones.P2);
    await responderCorrecto(codigo, sesiones.P3);
    const revelar = await jsonFetch(`${BASE}/api/vivo/revelar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);

    assert(Array.isArray(revelar.cuerpo.rankingEquipos), `el estado de "revelando" trae rankingEquipos (fue ${JSON.stringify(revelar.cuerpo.rankingEquipos)})`);
    const equipo1 = revelar.cuerpo.rankingEquipos.find((r) => r.equipo === 1);
    const equipo2 = revelar.cuerpo.rankingEquipos.find((r) => r.equipo === 2);
    assert(equipo1.puntaje > 0, 'el equipo 1 (con 3 aciertos) tiene puntaje mayor a 0');
    assert(equipo2.puntaje === 0, 'el equipo 2 (nadie acertó ni respondió) tiene puntaje 0');
    assert(equipo1.puntaje > equipo2.puntaje, 'el equipo 1 va ganando');

    // El estudiante ve su propio equipo en mi-estado.
    const miEstadoP1 = await jsonFetch(`${BASE}/api/vivo/mi-estado?codigo=${codigo}&sessionId=${sesiones.P1}`, { method: 'GET' });
    assert(miEstadoP1.cuerpo.equipo === 1, 'mi-estado de P1 refleja que está en el equipo 1');

    // Terminar y verificar el ranking final por equipo también.
    const terminar = await jsonFetch(`${BASE}/api/vivo/terminar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);
    assert(Array.isArray(terminar.cuerpo.rankingEquipos) && terminar.cuerpo.rankingEquipos.length === 2, 'el ranking final por equipo trae los 2 equipos');

    console.log('\n✅ Modo grupal (equipos) verificado sin errores.');
  } finally {
    await admin.auth.admin.deleteUser(creado.user.id);
    console.log('Limpieza: usuario(s) y datos de prueba eliminados.');
  }
})().catch((err) => {
  console.error('\n❌', err.message);
  process.exitCode = 1;
});
