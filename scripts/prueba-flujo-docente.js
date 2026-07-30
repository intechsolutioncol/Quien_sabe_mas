// Script de prueba manual: crea un profesor de prueba, inicia sesión de
// verdad contra Supabase Auth (usando @supabase/ssr para generar las
// mismas cookies que usaría un navegador real) y ejercita las rutas de
// API del panel docente contra el servidor local. Limpia todo al final.
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
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
      ...(opciones && opciones.headers),
    },
  });
  const cuerpo = await respuesta.json().catch(() => null);
  return { status: respuesta.status, cuerpo };
}

(async () => {
  const correo = `profesor-prueba-${Date.now()}@example.com`;
  const password = 'contraseña-de-prueba-123';

  const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
    email: correo,
    password,
    email_confirm: true,
  });
  if (errorCrear) throw errorCrear;

  try {
    // Inicia sesión con el cliente "anon" normal para obtener el session real...
    const anon = createClient(URL_SUPABASE, ANON_KEY);
    const { data: signIn, error: errorSignIn } = await anon.auth.signInWithPassword({ email: correo, password });
    if (errorSignIn) throw errorSignIn;

    // ...y se lo pasamos a un cliente @supabase/ssr con un "cookie jar" que
    // solo captura lo que la librería escribiría de verdad en el navegador.
    let cookiesEscritas = [];
    const ssrClient = createServerClient(URL_SUPABASE, ANON_KEY, {
      cookies: {
        getAll: () => [],
        setAll: (cookies) => {
          cookiesEscritas = cookies;
        },
      },
    });
    await ssrClient.auth.setSession({
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    });
    const cookieHeader = cookiesEscritas.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join('; ');
    assert(cookieHeader.length > 0, 'se generaron cookies de sesión reales para el profesor de prueba');

    // 1. Crear juego
    const crear = await jsonFetch(
      `${BASE}/api/juegos`,
      {
        method: 'POST',
        body: JSON.stringify({
          nombreJuego: 'Juego docente de prueba',
          tematica: 'Pruebas automáticas',
          cantidadPreguntas: 5,
          modo: 'individual',
          modoTiempo: 'porPregunta',
          segundosPorPregunta: 30,
          ayudas: { cincuenta: true, llamada: false, publico: true },
        }),
      },
      cookieHeader
    );
    assert(crear.status === 201, `crear juego responde 201 (fue ${crear.status}: ${JSON.stringify(crear.cuerpo)})`);
    const codigo = crear.cuerpo.codigo;
    assert(/^[A-Z0-9]{6}$/.test(codigo), `el código generado tiene 6 caracteres válidos (fue "${codigo}")`);

    // 2. Listar juegos: debe aparecer el recién creado con 0 preguntas cargadas
    const listar = await jsonFetch(`${BASE}/api/juegos`, { method: 'GET' }, cookieHeader);
    assert(listar.status === 200, `listar juegos responde 200 (fue ${listar.status})`);
    const propio = listar.cuerpo.find((j) => j.codigo === codigo);
    assert(!!propio, 'el juego recién creado aparece en "Mis juegos"');
    assert(propio.preguntasCargadas === 0, 'todavía no tiene preguntas cargadas');

    // 3. Importar preguntas por CSV
    const csv = [
      'Nivel,Pregunta,Opcion A,Opcion B,Opcion C,Opcion D,Respuesta',
      '1,Pregunta uno,A,B,C,D,A',
      '2,Pregunta dos,A,B,C,D,B',
      '3,Pregunta tres,A,B,C,D,C',
      '4,Pregunta cuatro,A,B,C,D,D',
      '5,Pregunta cinco,A,B,C,D,A',
    ].join('\n');
    const importar = await jsonFetch(
      `${BASE}/api/juegos/${codigo}/preguntas/csv`,
      { method: 'POST', body: JSON.stringify({ textoCsv: csv }) },
      cookieHeader
    );
    assert(importar.status === 200, `importar CSV responde 200 (fue ${importar.status}: ${JSON.stringify(importar.cuerpo)})`);
    assert(importar.cuerpo.importadas === 5, 'se importaron las 5 preguntas del CSV');

    // 4. Editar el juego (cambia nombre y cantidad de preguntas)
    const editar = await jsonFetch(
      `${BASE}/api/juegos/${codigo}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          nombreJuego: 'Juego docente de prueba (editado)',
          tematica: 'Pruebas automáticas',
          cantidadPreguntas: 3,
          modo: 'individual',
          modoTiempo: 'porPregunta',
          segundosPorPregunta: 30,
          ayudas: { cincuenta: true, llamada: false, publico: true },
        }),
      },
      cookieHeader
    );
    assert(editar.status === 200, `editar juego responde 200 (fue ${editar.status}: ${JSON.stringify(editar.cuerpo)})`);
    assert(editar.cuerpo.codigo === codigo, 'editar conserva el mismo código');
    assert(editar.cuerpo.nombreJuego === 'Juego docente de prueba (editado)', 'el nombre quedó actualizado');

    // 5. Desactivar el juego
    const desactivar = await jsonFetch(
      `${BASE}/api/juegos/${codigo}/activo`,
      { method: 'PATCH', body: JSON.stringify({ activo: false }) },
      cookieHeader
    );
    assert(desactivar.status === 200, `desactivar juego responde 200 (fue ${desactivar.status})`);

    // 6. Un estudiante ya no puede unirse a un juego inactivo
    const unirseInactivo = await jsonFetch(`${BASE}/api/partidas/unirse`, {
      method: 'POST',
      body: JSON.stringify({ codigo, nombreEstudiante: 'Alguien' }),
    });
    assert(unirseInactivo.status === 403, `unirse a juego inactivo da 403 (fue ${unirseInactivo.status})`);

    // 7. Resultados: todavía vacío
    const resultados = await jsonFetch(`${BASE}/api/juegos/${codigo}/resultados`, { method: 'GET' }, cookieHeader);
    assert(resultados.status === 200, `obtener resultados responde 200 (fue ${resultados.status})`);
    assert(Array.isArray(resultados.cuerpo) && resultados.cuerpo.length === 0, 'todavía no hay resultados de estudiantes');

    // 8. Otro profesor no puede editar el juego de este (aislamiento por dueño)
    const { data: creadoOtro } = await admin.auth.admin.createUser({
      email: `otro-${Date.now()}@example.com`,
      password,
      email_confirm: true,
    });
    try {
      const anonOtro = createClient(URL_SUPABASE, ANON_KEY);
      const { data: signInOtro } = await anonOtro.auth.signInWithPassword({ email: creadoOtro.user.email, password });
      let cookiesOtro = [];
      const ssrOtro = createServerClient(URL_SUPABASE, ANON_KEY, {
        cookies: { getAll: () => [], setAll: (c) => { cookiesOtro = c; } },
      });
      await ssrOtro.auth.setSession({
        access_token: signInOtro.session.access_token,
        refresh_token: signInOtro.session.refresh_token,
      });
      const cookieHeaderOtro = cookiesOtro.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join('; ');

      const editarAjeno = await jsonFetch(
        `${BASE}/api/juegos/${codigo}`,
        { method: 'PUT', body: JSON.stringify({ nombreJuego: 'Hackeado', cantidadPreguntas: 1 }) },
        cookieHeaderOtro
      );
      assert(editarAjeno.status === 404, `otro profesor NO puede editar este juego (fue ${editarAjeno.status})`);
    } finally {
      await admin.auth.admin.deleteUser(creadoOtro.user.id);
    }

    console.log('\n✅ Flujo docente completo verificado sin errores.');
  } finally {
    await admin.auth.admin.deleteUser(creado.user.id); // cascada: borra juego/preguntas de prueba
    console.log('Limpieza: usuario(s) y datos de prueba eliminados.');
  }
})().catch((err) => {
  console.error('\n❌', err.message);
  process.exitCode = 1;
});
