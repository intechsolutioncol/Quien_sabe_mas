// Prueba de extremo a extremo del modo "en vivo": crea un profesor+juego
// real, un estudiante real (dos "clientes" fetch distintos, como dos
// pestañas del navegador), y ejercita todo el ciclo: iniciar, unirse,
// avanzar, responder, avance automático por reloj, revelar, ranking,
// terminar, y que los resultados queden guardados. Limpia todo al final.
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

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  const correo = `profesor-vivo-${Date.now()}@example.com`;
  const password = 'contraseña-de-prueba-123';
  const { data: creado } = await admin.auth.admin.createUser({ email: correo, password, email_confirm: true });

  try {
    const cookieHost = await cookieDeSesion(correo, password);

    // 1. Crear juego en modo vivo, avance automático, 2 segundos por pregunta (rápido para la prueba)
    const crear = await jsonFetch(
      `${BASE}/api/juegos`,
      {
        method: 'POST',
        body: JSON.stringify({
          nombreJuego: 'Prueba en vivo',
          cantidadPreguntas: 3,
          modo: 'vivo',
          avanceVivo: 'automatico',
          segundosPorPregunta: 5,
          ayudas: { cincuenta: true, llamada: false, publico: false },
        }),
      },
      cookieHost
    );
    assert(crear.status === 201, `crear juego vivo responde 201 (fue ${crear.status}: ${JSON.stringify(crear.cuerpo)})`);
    const codigo = crear.cuerpo.codigo;
    assert(crear.cuerpo.modo === 'vivo', 'el juego quedó en modo "vivo"');

    const demo = await jsonFetch(`${BASE}/api/juegos/${codigo}/preguntas/demo`, { method: 'POST' }, cookieHost);
    assert(demo.status === 200, `cargar banco demo responde 200 (fue ${demo.status})`);

    // 2. Host inicia la sesión en vivo (lobby)
    const iniciar = await jsonFetch(`${BASE}/api/vivo/iniciar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);
    assert(iniciar.status === 200, `iniciar sesión en vivo responde 200 (fue ${iniciar.status}: ${JSON.stringify(iniciar.cuerpo)})`);
    assert(iniciar.cuerpo.estadoJuego === 'lobby', 'la sesión arranca en "lobby"');
    assert(iniciar.cuerpo.totalPreguntas === 3, 'la sesión trae 3 preguntas');

    // 3. Un profesor distinto NO puede controlar esta sesión (aislamiento)
    const { data: creadoOtro } = await admin.auth.admin.createUser({ email: `otro-vivo-${Date.now()}@example.com`, password, email_confirm: true });
    const cookieOtro = await cookieDeSesion(creadoOtro.user.email, password);
    const avanzarAjeno = await jsonFetch(`${BASE}/api/vivo/avanzar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieOtro);
    assert(avanzarAjeno.status === 404, `otro profesor no puede avanzar esta sesión (fue ${avanzarAjeno.status})`);
    await admin.auth.admin.deleteUser(creadoOtro.user.id);

    // 4. Dos estudiantes se unen desde el lobby
    const unirse1 = await jsonFetch(`${BASE}/api/partidas/unirse`, { method: 'POST', body: JSON.stringify({ codigo, nombreEstudiante: 'Estudiante Uno' }) });
    assert(unirse1.status === 200, `estudiante 1 se une (fue ${unirse1.status}: ${JSON.stringify(unirse1.cuerpo)})`);
    assert(unirse1.cuerpo.modo === 'vivo', 'la respuesta de unirse indica modo "vivo"');
    const sessionId1 = unirse1.cuerpo.sessionId;

    const unirse2 = await jsonFetch(`${BASE}/api/partidas/unirse`, { method: 'POST', body: JSON.stringify({ codigo, nombreEstudiante: 'Estudiante Dos' }) });
    assert(unirse2.status === 200, `estudiante 2 se une (fue ${unirse2.status})`);
    const sessionId2 = unirse2.cuerpo.sessionId;

    const estadoLobby = await jsonFetch(`${BASE}/api/vivo/estado?codigo=${codigo}`, { method: 'GET' });
    assert(estadoLobby.cuerpo.numeroJugadores === 2, 'el estado público refleja 2 jugadores conectados');

    // 5. Host arranca la primera pregunta
    const avanzar1 = await jsonFetch(`${BASE}/api/vivo/avanzar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);
    assert(avanzar1.status === 200, `avanzar a la pregunta 1 responde 200 (fue ${avanzar1.status}: ${JSON.stringify(avanzar1.cuerpo)})`);
    assert(avanzar1.cuerpo.estadoJuego === 'pregunta', 'el estado pasó a "pregunta"');
    assert(!avanzar1.cuerpo.respuestaCorrecta, 'el estado público NO expone la respuesta correcta mientras la pregunta está activa');
    assert(!!avanzar1.cuerpo.pregunta && !!avanzar1.cuerpo.pregunta.opciones, 'el estado público sí trae el enunciado y las opciones');

    // 6. Necesitamos la respuesta correcta solo para la prueba (nunca vía la API pública)
    const { data: privado1 } = await admin.from('sesiones_vivo_privado').select('preguntas').eq('codigo', codigo).single();
    const correcta1 = privado1.preguntas[0].respuestaCorrecta;
    const incorrecta1 = ['A', 'B', 'C', 'D'].find((o) => o !== correcta1);

    // 7. Estudiante 1 usa 50/50 (debe conservar la correcta)
    const cincuenta = await jsonFetch(`${BASE}/api/vivo/ayudas/cincuenta`, { method: 'POST', body: JSON.stringify({ codigo, sessionId: sessionId1 }) });
    assert(cincuenta.status === 200, `ayuda 50/50 en vivo responde 200 (fue ${cincuenta.status})`);
    assert(!cincuenta.cuerpo.eliminar.includes(correcta1), 'la ayuda 50/50 en vivo nunca elimina la respuesta correcta');

    // 8. Ambos responden (uno bien, uno mal)
    const responder1 = await jsonFetch(`${BASE}/api/vivo/responder`, { method: 'POST', body: JSON.stringify({ codigo, sessionId: sessionId1, opcion: correcta1 }) });
    assert(responder1.status === 200, `estudiante 1 responde bien (fue ${responder1.status}: ${JSON.stringify(responder1.cuerpo)})`);

    const responderRepetido = await jsonFetch(`${BASE}/api/vivo/responder`, { method: 'POST', body: JSON.stringify({ codigo, sessionId: sessionId1, opcion: correcta1 }) });
    assert(responderRepetido.status === 409, `responder dos veces la misma pregunta da error (fue ${responderRepetido.status})`);

    const responder2 = await jsonFetch(`${BASE}/api/vivo/responder`, { method: 'POST', body: JSON.stringify({ codigo, sessionId: sessionId2, opcion: incorrecta1 }) });
    assert(responder2.status === 200, `estudiante 2 responde mal (fue ${responder2.status})`);

    // Como ya respondieron todos, el fin de la pregunta se adelantó a ~1s.
    const miEstado1TrasResponder = await jsonFetch(`${BASE}/api/vivo/mi-estado?codigo=${codigo}&sessionId=${sessionId1}`, { method: 'GET' });
    assert(miEstado1TrasResponder.cuerpo.yaRespondio === true, 'mi-estado refleja que el estudiante 1 ya respondió');

    // 9. Avance automático por reloj: sin que el host haga nada, /api/vivo/estado
    //    debe revelar solo cuando se cumple el tiempo (probamos el "tick").
    await esperar(1500);
    const estadoTrasEsperar = await jsonFetch(`${BASE}/api/vivo/estado?codigo=${codigo}`, { method: 'GET' });
    assert(estadoTrasEsperar.cuerpo.estadoJuego === 'revelando', `el avance automático reveló solo (fue "${estadoTrasEsperar.cuerpo.estadoJuego}")`);
    assert(estadoTrasEsperar.cuerpo.respuestaCorrecta === correcta1, 'una vez revelado, el estado público SÍ trae la respuesta correcta');
    assert(estadoTrasEsperar.cuerpo.distribucionRespuestas[correcta1] === 1, 'la distribución cuenta 1 voto correcto');
    assert(estadoTrasEsperar.cuerpo.ranking[0].nombre === 'Estudiante Uno', 'el ranking pone primero a quien acertó');

    // 10. mi-estado del estudiante 1 confirma que acertó y ganó puntos
    const miEstado1 = await jsonFetch(`${BASE}/api/vivo/mi-estado?codigo=${codigo}&sessionId=${sessionId1}`, { method: 'GET' });
    assert(miEstado1.cuerpo.esCorrecta === true, 'mi-estado confirma que el estudiante 1 acertó');
    assert(miEstado1.cuerpo.puntosGanados > 0, 'el estudiante 1 ganó puntos por acertar');
    assert(miEstado1.cuerpo.tuPosicion === 1, 'el estudiante 1 quedó de primeras en el ranking');

    // 11. Avance automático también debe pasar solo de "revelando" a la siguiente pregunta
    await esperar(8500);
    const estadoPregunta2 = await jsonFetch(`${BASE}/api/vivo/estado?codigo=${codigo}`, { method: 'GET' });
    assert(estadoPregunta2.cuerpo.estadoJuego === 'pregunta', `avanzó solo a la pregunta 2 (fue "${estadoPregunta2.cuerpo.estadoJuego}")`);
    assert(estadoPregunta2.cuerpo.indiceActual === 1, 'el índice avanzó a 1 (segunda pregunta)');

    // 12. El host termina el juego manualmente antes de la 3ª pregunta
    const terminar = await jsonFetch(`${BASE}/api/vivo/terminar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);
    assert(terminar.status === 200, `terminar responde 200 (fue ${terminar.status})`);
    assert(terminar.cuerpo.estadoJuego === 'finalizado', 'el estado quedó "finalizado"');
    assert(terminar.cuerpo.ranking.length === 2, 'el ranking final trae a los 2 jugadores');

    // 13. Los resultados quedaron guardados en la tabla resultados (una vez cada uno)
    const { data: juegoFila } = await admin.from('juegos').select('id').eq('codigo', codigo).single();
    const { data: resultados } = await admin.from('resultados').select('*').eq('juego_id', juegoFila.id);
    assert(resultados.length === 2, `se guardaron 2 resultados (fueron ${resultados.length})`);
    assert(resultados.every((r) => r.resultado === 'en vivo'), 'ambos resultados dicen "en vivo"');

    // 14. Terminar dos veces no debe duplicar los resultados guardados
    await jsonFetch(`${BASE}/api/vivo/terminar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);
    const { data: resultadosTrasRepetir } = await admin.from('resultados').select('*').eq('juego_id', juegoFila.id);
    assert(resultadosTrasRepetir.length === 2, 'llamar terminar de nuevo no duplica los resultados');

    console.log('\n✅ Flujo en vivo completo verificado sin errores.');
  } finally {
    await admin.auth.admin.deleteUser(creado.user.id);
    console.log('Limpieza: usuario(s) y datos de prueba eliminados.');
  }
})().catch((err) => {
  console.error('\n❌', err.message);
  process.exitCode = 1;
});
