// Prueba la mecánica de racha en modo en vivo: 3 aciertos seguidos
// desbloquean un poder (robar puntos / escudo), el poder persiste si
// falla la siguiente, el escudo bloquea un robo, un robo exitoso resta
// una cantidad fija, no se puede usar sin poder ni contra uno mismo, y
// el nombre de otro jugador nunca expone su sessionId.
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

async function filaJugador(codigo, sessionId) {
  const { data } = await admin.from('sesiones_vivo_jugadores').select('*').eq('codigo', codigo).eq('session_id', sessionId).single();
  return data;
}

async function responderCorrecto(codigo, sessionId) {
  const { data: sesion } = await admin.from('sesiones_vivo').select('indice_actual').eq('codigo', codigo).single();
  const { data: privado } = await admin.from('sesiones_vivo_privado').select('preguntas').eq('codigo', codigo).single();
  const correcta = privado.preguntas[sesion.indice_actual].respuestaCorrecta;
  return jsonFetch(`${BASE}/api/vivo/responder`, { method: 'POST', body: JSON.stringify({ codigo, sessionId, opcion: correcta }) });
}

async function responderIncorrecto(codigo, sessionId) {
  const { data: sesion } = await admin.from('sesiones_vivo').select('indice_actual').eq('codigo', codigo).single();
  const { data: privado } = await admin.from('sesiones_vivo_privado').select('preguntas').eq('codigo', codigo).single();
  const correcta = privado.preguntas[sesion.indice_actual].respuestaCorrecta;
  const incorrecta = ['A', 'B', 'C', 'D'].find((o) => o !== correcta);
  return jsonFetch(`${BASE}/api/vivo/responder`, { method: 'POST', body: JSON.stringify({ codigo, sessionId, opcion: incorrecta }) });
}

(async () => {
  const password = 'contraseña-de-prueba-123';
  const { data: creado } = await admin.auth.admin.createUser({ email: `profesor-racha-${Date.now()}@example.com`, password, email_confirm: true });

  try {
    const cookieHost = await cookieDeSesion(creado.user.email, password);

    const crear = await jsonFetch(
      `${BASE}/api/juegos`,
      { method: 'POST', body: JSON.stringify({ nombreJuego: 'Prueba racha', cantidadPreguntas: 7, modo: 'vivo', avanceVivo: 'manual', segundosPorPregunta: 30, ayudas: {} }) },
      cookieHost
    );
    const codigo = crear.cuerpo.codigo;
    await jsonFetch(`${BASE}/api/juegos/${codigo}/preguntas/demo`, { method: 'POST' }, cookieHost);
    await jsonFetch(`${BASE}/api/vivo/iniciar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);

    // Los 4 se unen desde el lobby (unirse solo funciona antes de iniciar).
    const unirseA = await jsonFetch(`${BASE}/api/partidas/unirse`, { method: 'POST', body: JSON.stringify({ codigo, nombreEstudiante: 'A' }) });
    const unirseB = await jsonFetch(`${BASE}/api/partidas/unirse`, { method: 'POST', body: JSON.stringify({ codigo, nombreEstudiante: 'B' }) });
    const unirseC = await jsonFetch(`${BASE}/api/partidas/unirse`, { method: 'POST', body: JSON.stringify({ codigo, nombreEstudiante: 'C' }) });
    const unirseD = await jsonFetch(`${BASE}/api/partidas/unirse`, { method: 'POST', body: JSON.stringify({ codigo, nombreEstudiante: 'D' }) });
    const sA = unirseA.cuerpo.sessionId;
    const sB = unirseB.cuerpo.sessionId;
    const sC = unirseC.cuerpo.sessionId;
    const sD = unirseD.cuerpo.sessionId;
    assert(!!sA && !!sB && !!sC && !!sD, 'los 4 jugadores se unieron correctamente desde el lobby');

    // Seguridad: la lista pública de nombres nunca expone sessionId.
    const listaPublica = await jsonFetch(`${BASE}/api/vivo/jugadores?codigo=${codigo}`, { method: 'GET' });
    assert(listaPublica.status === 200 && listaPublica.cuerpo.sort().join(',') === 'A,B,C,D', `lista pública trae solo nombres (fue ${JSON.stringify(listaPublica.cuerpo)})`);
    assert(JSON.stringify(listaPublica.cuerpo).indexOf('-') === -1 || !listaPublica.cuerpo.some((n) => n.length > 10), 'la lista pública no contiene ids largos tipo uuid (solo nombres cortos)');

    // Rondas 1-3: A, B y C aciertan las tres -> los tres deben quedar con racha=3 y poder disponible.
    for (let i = 0; i < 3; i++) {
      await jsonFetch(`${BASE}/api/vivo/avanzar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);
      const rA = await responderCorrecto(codigo, sA);
      const rB = await responderCorrecto(codigo, sB);
      const rC = await responderCorrecto(codigo, sC);
      assert(rA.status === 200 && rB.status === 200 && rC.status === 200, `ronda ${i + 1}: los tres responden bien (200)`);
      await jsonFetch(`${BASE}/api/vivo/revelar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);
    }

    let filaA = await filaJugador(codigo, sA);
    let filaB = await filaJugador(codigo, sB);
    let filaC = await filaJugador(codigo, sC);
    assert(filaA.racha_actual === 3 && filaA.poder_disponible === true, `A tiene racha 3 y poder disponible (fue racha=${filaA.racha_actual}, poder=${filaA.poder_disponible})`);
    assert(filaB.poder_disponible === true, 'B también tiene poder disponible');
    assert(filaC.poder_disponible === true, 'C también tiene poder disponible');

    // El ranking público (respuesta de /revelar) incluye el campo "racha".
    const estadoRevelando = await jsonFetch(`${BASE}/api/vivo/estado?codigo=${codigo}`, { method: 'GET' });
    assert(estadoRevelando.cuerpo.ranking.some((r) => typeof r.racha === 'number'), 'el ranking público incluye el campo "racha" de cada jugador');

    // No se puede usar un poder que no se tiene (D no ha construido racha).
    const sinPoder = await jsonFetch(`${BASE}/api/vivo/poder-racha`, { method: 'POST', body: JSON.stringify({ codigo, sessionId: sD, accion: 'escudo' }) });
    assert(sinPoder.status === 409, `usar un poder sin tenerlo da error (fue ${sinPoder.status})`);

    // No se puede robar a uno mismo, y esto NO debe consumir el poder de A.
    const robarseAsiMismo = await jsonFetch(`${BASE}/api/vivo/poder-racha`, { method: 'POST', body: JSON.stringify({ codigo, sessionId: sA, accion: 'robar', nombreObjetivo: 'A' }) });
    assert(robarseAsiMismo.status === 409, `robarse a uno mismo da error (fue ${robarseAsiMismo.status})`);
    filaA = await filaJugador(codigo, sA);
    assert(filaA.poder_disponible === true, 'intentar robarse a sí mismo NO consumió el poder de A');

    // A activa su escudo.
    const escudoA = await jsonFetch(`${BASE}/api/vivo/poder-racha`, { method: 'POST', body: JSON.stringify({ codigo, sessionId: sA, accion: 'escudo' }) });
    assert(escudoA.status === 200 && escudoA.cuerpo.accion === 'escudo', `A activa su escudo (fue ${escudoA.status})`);
    filaA = await filaJugador(codigo, sA);
    assert(filaA.poder_disponible === false && filaA.escudo_activo === true, 'A: poder consumido, escudo activo');

    // B intenta robarle a A -> debe ser bloqueado por el escudo.
    const puntajeAAntes = filaA.puntaje_total;
    const robarBloqueado = await jsonFetch(`${BASE}/api/vivo/poder-racha`, { method: 'POST', body: JSON.stringify({ codigo, sessionId: sB, accion: 'robar', nombreObjetivo: 'A' }) });
    assert(robarBloqueado.status === 200 && robarBloqueado.cuerpo.bloqueado === true, `el robo de B contra A queda bloqueado (fue ${JSON.stringify(robarBloqueado.cuerpo)})`);
    filaA = await filaJugador(codigo, sA);
    filaB = await filaJugador(codigo, sB);
    assert(filaA.escudo_activo === false, 'el escudo de A se consumió al bloquear el robo');
    assert(filaA.puntaje_total === puntajeAAntes, 'los puntos de A no cambiaron (el robo fue bloqueado)');
    assert(filaB.poder_disponible === false, 'el poder de B se consumió aunque el robo haya sido bloqueado');

    // Ronda 4: C falla a propósito -> su racha se reinicia mas NO pierde el poder ya ganado.
    await jsonFetch(`${BASE}/api/vivo/avanzar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);
    await responderIncorrecto(codigo, sC);
    await jsonFetch(`${BASE}/api/vivo/revelar`, { method: 'POST', body: JSON.stringify({ codigo }) }, cookieHost);
    filaC = await filaJugador(codigo, sC);
    assert(filaC.racha_actual === 0, 'la racha de C se reinició a 0 tras fallar');
    assert(filaC.poder_disponible === true, 'C conserva el poder que ya había ganado, aunque haya fallado después');

    // C usa su poder (todavía disponible) para robarle a D (sin escudo) -> debe funcionar.
    const dAntes = await filaJugador(codigo, sD);
    const robarExitoso = await jsonFetch(`${BASE}/api/vivo/poder-racha`, { method: 'POST', body: JSON.stringify({ codigo, sessionId: sC, accion: 'robar', nombreObjetivo: 'D' }) });
    assert(robarExitoso.status === 200 && robarExitoso.cuerpo.bloqueado === false, `el robo de C contra D funciona (fue ${JSON.stringify(robarExitoso.cuerpo)})`);
    assert(robarExitoso.cuerpo.puntosQuitados === 300, 'se quitaron exactamente 300 puntos (cantidad fija)');
    const dDespues = await filaJugador(codigo, sD);
    assert(dDespues.puntaje_total === Math.max(0, dAntes.puntaje_total - 300), 'los puntos de D bajaron en 300 (con piso en 0)');

    console.log('\n✅ Mecánica de racha (robar puntos / escudo) verificada sin errores.');
  } finally {
    await admin.auth.admin.deleteUser(creado.user.id);
    console.log('Limpieza: usuario(s) y datos de prueba eliminados.');
  }
})().catch((err) => {
  console.error('\n❌', err.message);
  process.exitCode = 1;
});
