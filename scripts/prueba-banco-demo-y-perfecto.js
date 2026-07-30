// Prueba: cargar el banco demo de 100 preguntas en un juego real y jugar
// una partida completa acertando todo (para ejercitar la rama "perfecto",
// no cubierta por los otros scripts de prueba).
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

(async () => {
  const correo = `prueba-demo-${Date.now()}@example.com`;
  const password = 'contraseña-de-prueba-123';
  const { data: creado } = await admin.auth.admin.createUser({ email: correo, password, email_confirm: true });

  try {
    const anon = createClient(URL_SUPABASE, ANON_KEY);
    const { data: signIn } = await anon.auth.signInWithPassword({ email: correo, password });
    let cookies = [];
    const ssr = createServerClient(URL_SUPABASE, ANON_KEY, { cookies: { getAll: () => [], setAll: (c) => { cookies = c; } } });
    await ssr.auth.setSession({ access_token: signIn.session.access_token, refresh_token: signIn.session.refresh_token });
    const cookieHeader = cookies.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join('; ');

    const crear = await jsonFetch(
      `${BASE}/api/juegos`,
      {
        method: 'POST',
        body: JSON.stringify({
          nombreJuego: 'Prueba banco demo',
          cantidadPreguntas: 5,
          modo: 'individual',
          modoTiempo: 'porPregunta',
          segundosPorPregunta: 45,
          ayudas: { cincuenta: false, llamada: false, publico: false },
        }),
      },
      cookieHeader
    );
    assert(crear.status === 201, `crear juego responde 201 (fue ${crear.status})`);
    const codigo = crear.cuerpo.codigo;

    const demo = await jsonFetch(`${BASE}/api/juegos/${codigo}/preguntas/demo`, { method: 'POST' }, cookieHeader);
    assert(demo.status === 200, `cargar banco demo responde 200 (fue ${demo.status}: ${JSON.stringify(demo.cuerpo)})`);
    assert(demo.cuerpo.importadas === 100, 'se cargaron las 100 preguntas demo');

    const { data: juegoFila } = await admin.from('juegos').select('id').eq('codigo', codigo).single();

    let unirse = await jsonFetch(`${BASE}/api/partidas/unirse`, {
      method: 'POST',
      body: JSON.stringify({ codigo, nombreEstudiante: 'Estudiante Perfecto' }),
    });
    assert(unirse.status === 200, `unirse responde 200 (fue ${unirse.status}: ${JSON.stringify(unirse.cuerpo)})`);
    assert(unirse.cuerpo.totalPreguntas === 5, 'la partida trae 5 preguntas (1 por nivel)');

    const sessionId = unirse.cuerpo.sessionId;
    let pregunta = unirse.cuerpo.pregunta;
    let ultimo;
    for (let i = 0; i < 5; i++) {
      // Necesitamos la respuesta correcta, que el cliente nunca ve: la
      // consultamos directo en la base de datos (solo para la prueba).
      const { data: sesion } = await admin.from('sesiones_individuales').select('preguntas, pregunta_actual').eq('session_id', sessionId).single();
      const correcta = sesion.preguntas[sesion.pregunta_actual].respuestaCorrecta;

      ultimo = await jsonFetch(`${BASE}/api/partidas/responder`, {
        method: 'POST',
        body: JSON.stringify({ sessionId, opcionSeleccionada: correcta }),
      });
      assert(ultimo.status === 200, `responder pregunta ${i + 1} responde 200`);
      assert(ultimo.cuerpo.esCorrecta === true, `la respuesta ${i + 1} se marcó correcta (acertamos a propósito)`);
    }

    assert(ultimo.cuerpo.juegoTerminado === true, 'el juego terminó tras la 5ª pregunta');
    assert(ultimo.cuerpo.motivo === 'perfecto', `el motivo final es "perfecto" (fue "${ultimo.cuerpo.motivo}")`);
    assert(ultimo.cuerpo.puntajeFinal === 5, 'el puntaje final es 5/5');

    const { data: resultados } = await admin.from('resultados').select('*').eq('juego_id', juegoFila.id);
    assert(resultados.length === 1 && resultados[0].resultado === 'completado', 'se guardó 1 resultado "completado"');

    console.log('\n✅ Banco demo + partida perfecta verificados sin errores.');
  } finally {
    await admin.auth.admin.deleteUser(creado.user.id);
    console.log('Limpieza: usuario y datos de prueba eliminados.');
  }
})().catch((err) => {
  console.error('\n❌', err.message);
  process.exitCode = 1;
});
