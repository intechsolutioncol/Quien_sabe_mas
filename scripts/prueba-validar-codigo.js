// Prueba el paso 1 del ingreso en dos pasos: GET /api/partidas/validar-codigo
// debe confirmar el código (y devolver datos del juego) ANTES de que se
// pida el nombre, sin crear ninguna sesión — código inexistente, juego
// inactivo, y caso válido.
const { createClient } = require('@supabase/supabase-js');

const BASE = 'http://localhost:3000';
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function jsonFetch(url) {
  const respuesta = await fetch(url);
  const cuerpo = await respuesta.json().catch(() => null);
  return { status: respuesta.status, cuerpo };
}

function assert(cond, mensaje) {
  if (!cond) throw new Error('FALLÓ: ' + mensaje);
  console.log('OK:', mensaje);
}

(async () => {
  const { data: creado, error: errorUsuario } = await admin.auth.admin.createUser({
    email: `prueba-validar-${Date.now()}@example.com`,
    password: 'contraseña-de-prueba-123',
    email_confirm: true,
  });
  if (errorUsuario) throw errorUsuario;
  const profesorId = creado.user.id;

  try {
    // Código que no existe.
    const inexistente = await jsonFetch(`${BASE}/api/partidas/validar-codigo?codigo=ZZZZZZ`);
    assert(inexistente.status === 404, `código inexistente da 404 (fue ${inexistente.status})`);

    const codigo = 'VAL' + Math.floor(Math.random() * 900 + 100);
    const { data: juego } = await admin
      .from('juegos')
      .insert({
        codigo,
        profesor_id: profesorId,
        nombre_juego: 'Juego para validar código',
        tematica: 'Pruebas automáticas',
        cantidad_preguntas: 5,
        modo: 'individual',
        ayudas: {},
        modo_tiempo: 'porPregunta',
        segundos_por_pregunta: 45,
        duracion_total_segundos: 600,
        activo: false,
      })
      .select()
      .single();

    // Juego inactivo.
    const inactivo = await jsonFetch(`${BASE}/api/partidas/validar-codigo?codigo=${codigo}`);
    assert(inactivo.status === 403, `juego inactivo da 403 (fue ${inactivo.status})`);

    // Se activa: ahora sí debe validar bien, sin crear ninguna sesión.
    await admin.from('juegos').update({ activo: true }).eq('id', juego.id);
    const valido = await jsonFetch(`${BASE}/api/partidas/validar-codigo?codigo=${codigo.toLowerCase()}`);
    assert(valido.status === 200, `código válido (en minúsculas) responde 200 (fue ${valido.status}: ${JSON.stringify(valido.cuerpo)})`);
    assert(valido.cuerpo.codigo === codigo, 'devuelve el código normalizado en mayúsculas');
    assert(valido.cuerpo.nombreJuego === 'Juego para validar código', 'devuelve el nombre del juego');
    assert(valido.cuerpo.tematica === 'Pruebas automáticas', 'devuelve la temática del juego');
    assert(valido.cuerpo.modo === 'individual', 'devuelve el modo del juego');

    const { count } = await admin
      .from('sesiones_individuales')
      .select('*', { count: 'exact', head: true })
      .eq('juego_id', juego.id);
    assert(count === 0, 'validar el código NO crea ninguna sesión de partida');

    console.log('\n✅ Validación de código (paso 1 del ingreso) verificada sin errores.');
  } finally {
    await admin.auth.admin.deleteUser(profesorId);
    console.log('Limpieza: usuario y datos de prueba eliminados.');
  }
})().catch((err) => {
  console.error('\n❌', err.message);
  process.exitCode = 1;
});
