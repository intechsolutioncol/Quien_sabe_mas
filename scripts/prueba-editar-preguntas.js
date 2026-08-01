// Prueba listar, agregar, editar y eliminar preguntas individuales de un
// juego, y que un profesor no pueda tocar preguntas de un juego ajeno.
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
  const { data: creado } = await admin.auth.admin.createUser({ email: `profesor-editar-preg-${Date.now()}@example.com`, password, email_confirm: true });

  try {
    const cookieHost = await cookieDeSesion(creado.user.email, password);

    const crear = await jsonFetch(
      `${BASE}/api/juegos`,
      { method: 'POST', body: JSON.stringify({ nombreJuego: 'Prueba editar preguntas', cantidadPreguntas: 5, modo: 'individual', modoTiempo: 'porPregunta', segundosPorPregunta: 30, ayudas: {} }) },
      cookieHost
    );
    const codigo = crear.cuerpo.codigo;

    const listaVacia = await jsonFetch(`${BASE}/api/juegos/${codigo}/preguntas`, { method: 'GET' }, cookieHost);
    assert(listaVacia.status === 200 && listaVacia.cuerpo.length === 0, 'un juego nuevo no tiene preguntas todavía');

    // Agregar
    const nueva = {
      nivel: 3,
      pregunta: '¿Cuál es la capital de Francia?',
      opcionA: 'Madrid', opcionB: 'Roma', opcionC: 'París', opcionD: 'Berlín',
      respuestaCorrecta: 'C',
    };
    const agregar = await jsonFetch(`${BASE}/api/juegos/${codigo}/preguntas`, { method: 'POST', body: JSON.stringify(nueva) }, cookieHost);
    assert(agregar.status === 201, `agregar pregunta responde 201 (fue ${agregar.status}: ${JSON.stringify(agregar.cuerpo)})`);
    const id = agregar.cuerpo.id;
    assert(!!id, 'la pregunta agregada tiene id');

    // Agregar con datos inválidos debe rechazarse
    const invalida = await jsonFetch(`${BASE}/api/juegos/${codigo}/preguntas`, { method: 'POST', body: JSON.stringify({ ...nueva, respuestaCorrecta: 'Z' }) }, cookieHost);
    assert(invalida.status === 400, `agregar con respuesta inválida da 400 (fue ${invalida.status})`);

    // Listar
    const lista = await jsonFetch(`${BASE}/api/juegos/${codigo}/preguntas`, { method: 'GET' }, cookieHost);
    assert(lista.cuerpo.length === 1, 'ahora aparece 1 pregunta en la lista');

    // Editar
    const editar = await jsonFetch(
      `${BASE}/api/juegos/${codigo}/preguntas/${id}`,
      { method: 'PUT', body: JSON.stringify({ ...nueva, pregunta: '¿Cuál es la capital de Francia? (corregida)' }) },
      cookieHost
    );
    assert(editar.status === 200, `editar responde 200 (fue ${editar.status})`);
    assert(editar.cuerpo.pregunta === '¿Cuál es la capital de Francia? (corregida)', 'el texto quedó actualizado');

    // Otro profesor no puede editar ni eliminar preguntas de este juego
    const { data: creadoOtro } = await admin.auth.admin.createUser({ email: `otro-editar-preg-${Date.now()}@example.com`, password, email_confirm: true });
    const cookieOtro = await cookieDeSesion(creadoOtro.user.email, password);
    const editarAjeno = await jsonFetch(`${BASE}/api/juegos/${codigo}/preguntas/${id}`, { method: 'PUT', body: JSON.stringify(nueva) }, cookieOtro);
    assert(editarAjeno.status === 404, `otro profesor no puede editar esta pregunta (fue ${editarAjeno.status})`);
    const eliminarAjeno = await jsonFetch(`${BASE}/api/juegos/${codigo}/preguntas/${id}`, { method: 'DELETE' }, cookieOtro);
    assert(eliminarAjeno.status === 404, `otro profesor no puede eliminar esta pregunta (fue ${eliminarAjeno.status})`);
    await admin.auth.admin.deleteUser(creadoOtro.user.id);

    // Eliminar (el dueño sí puede)
    const eliminar = await jsonFetch(`${BASE}/api/juegos/${codigo}/preguntas/${id}`, { method: 'DELETE' }, cookieHost);
    assert(eliminar.status === 200, `eliminar responde 200 (fue ${eliminar.status})`);

    const listaFinal = await jsonFetch(`${BASE}/api/juegos/${codigo}/preguntas`, { method: 'GET' }, cookieHost);
    assert(listaFinal.cuerpo.length === 0, 'la lista quedó vacía después de eliminar');

    console.log('\n✅ Editar/agregar/eliminar preguntas individuales verificado sin errores.');
  } finally {
    await admin.auth.admin.deleteUser(creado.user.id);
    console.log('Limpieza: usuario(s) y datos de prueba eliminados.');
  }
})().catch((err) => {
  console.error('\n❌', err.message);
  process.exitCode = 1;
});
