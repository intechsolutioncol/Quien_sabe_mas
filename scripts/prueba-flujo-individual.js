// Script de prueba manual (no forma parte de la app): crea un profesor +
// juego + preguntas de prueba directo en la base de datos, luego ejercita
// el flujo completo de un estudiante contra el servidor local corriendo
// en http://localhost:3000, y al final borra todo lo que creó.
const { createClient } = require('@supabase/supabase-js');

const BASE = 'http://localhost:3000';
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function jsonFetch(url, opciones) {
  const respuesta = await fetch(url, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(opciones && opciones.headers) },
  });
  const cuerpo = await respuesta.json().catch(() => null);
  return { status: respuesta.status, cuerpo };
}

function assert(cond, mensaje) {
  if (!cond) throw new Error('FALLÓ: ' + mensaje);
  console.log('OK:', mensaje);
}

(async () => {
  const correo = `prueba-${Date.now()}@example.com`;
  const { data: creado, error: errorUsuario } = await admin.auth.admin.createUser({
    email: correo,
    password: 'contraseña-de-prueba-123',
    email_confirm: true,
  });
  if (errorUsuario) throw errorUsuario;
  const profesorId = creado.user.id;

  try {
    const codigo = 'PRU' + Math.floor(Math.random() * 900 + 100);
    const { data: juego, error: errorJuego } = await admin
      .from('juegos')
      .insert({
        codigo,
        profesor_id: profesorId,
        nombre_juego: 'Juego de prueba automática',
        cantidad_preguntas: 2,
        modo: 'individual',
        ayudas: { cincuenta: true, llamada: true, publico: true },
        modo_tiempo: 'porPregunta',
        segundos_por_pregunta: 45,
        duracion_total_segundos: 600,
      })
      .select()
      .single();
    if (errorJuego) throw errorJuego;

    const preguntas = [1, 2, 3, 4, 5].map((nivel) => ({
      juego_id: juego.id,
      nivel,
      pregunta: `¿Pregunta de prueba nivel ${nivel}?`,
      opcion_a: 'A',
      opcion_b: 'B',
      opcion_c: 'C',
      opcion_d: 'D',
      respuesta_correcta: 'B',
    }));
    const { error: errorPreguntas } = await admin.from('preguntas').insert(preguntas);
    if (errorPreguntas) throw errorPreguntas;

    // 1. Unirse
    const unirse = await jsonFetch(`${BASE}/api/partidas/unirse`, {
      method: 'POST',
      body: JSON.stringify({ codigo, nombreEstudiante: 'Estudiante Prueba' }),
    });
    assert(unirse.status === 200, `unirse responde 200 (fue ${unirse.status}: ${JSON.stringify(unirse.cuerpo)})`);
    assert(unirse.cuerpo.totalPreguntas === 2, 'la partida seleccionó 2 preguntas según cantidadPreguntas');
    const sessionId = unirse.cuerpo.sessionId;

    // 2. Ayuda 50/50
    const cincuenta = await jsonFetch(`${BASE}/api/partidas/ayudas/cincuenta`, {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
    assert(cincuenta.status === 200, `ayuda 50/50 responde 200 (fue ${cincuenta.status})`);
    assert(cincuenta.cuerpo.eliminar.length === 2, 'la ayuda 50/50 elimina 2 opciones incorrectas');
    assert(!cincuenta.cuerpo.eliminar.includes('B'), 'la ayuda 50/50 nunca elimina la respuesta correcta');

    const cincuentaDeNuevo = await jsonFetch(`${BASE}/api/partidas/ayudas/cincuenta`, {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
    assert(cincuentaDeNuevo.status === 409, 'usar la misma ayuda dos veces da error 409');

    // 3. Responder correctamente la primera pregunta
    const respuesta1 = await jsonFetch(`${BASE}/api/partidas/responder`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, opcionSeleccionada: 'B' }),
    });
    assert(respuesta1.status === 200, `responder responde 200 (fue ${respuesta1.status})`);
    assert(respuesta1.cuerpo.esCorrecta === true, 'la primera respuesta se marca correcta');
    assert(respuesta1.cuerpo.juegoTerminado === false, 'el juego sigue tras acertar (quedaba 1 pregunta más)');

    // 4. Fallar la segunda pregunta -> termina el juego (modoTiempo porPregunta)
    const respuesta2 = await jsonFetch(`${BASE}/api/partidas/responder`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, opcionSeleccionada: 'A' }),
    });
    assert(respuesta2.status === 200, `responder (2) responde 200 (fue ${respuesta2.status})`);
    assert(respuesta2.cuerpo.juegoTerminado === true, 'fallar termina la partida en modo porPregunta');
    assert(respuesta2.cuerpo.motivo === 'fallo', 'el motivo de fin es "fallo"');
    assert(respuesta2.cuerpo.puntajeFinal === 1, 'el puntaje final quedó en 1 (acertó la primera)');

    // 5. Responder de nuevo tras terminar -> debe rechazar
    const respuestaTrasFin = await jsonFetch(`${BASE}/api/partidas/responder`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, opcionSeleccionada: 'B' }),
    });
    assert(respuestaTrasFin.status === 410, 'responder tras terminar la partida da error 410');

    // 6. El resultado quedó guardado en la tabla resultados
    const { data: resultados } = await admin.from('resultados').select('*').eq('juego_id', juego.id);
    assert(resultados.length === 1, 'se guardó exactamente 1 resultado en la tabla resultados');
    assert(resultados[0].resultado === 'perdió', 'el resultado guardado dice "perdió"');

    console.log('\n✅ Flujo individual completo verificado sin errores.');
  } finally {
    await admin.auth.admin.deleteUser(profesorId); // cascada: borra juego/preguntas/resultados de prueba
    console.log('Limpieza: usuario y datos de prueba eliminados.');
  }
})().catch((err) => {
  console.error('\n❌', err.message);
  process.exitCode = 1;
});
