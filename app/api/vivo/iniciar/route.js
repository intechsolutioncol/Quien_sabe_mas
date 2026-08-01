import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { obtenerBancoPreguntas } from '@/lib/juego/datos';
import { seleccionarPreguntasDeBanco } from '@/lib/juego/distribucion';
import { obtenerJuegoVivoDelProfesor, mapearSesionVivoPublica } from '@/lib/juego/vivo-datos';

// El profesor inicia (o reinicia) una sesión en vivo desde el panel.
// Equivalente a iniciarSesionVivo de Vivo.js; ya no se genera un
// hostToken ad-hoc: la autorización del host es la propia sesión de
// Supabase Auth (profesor_id = auth.uid()).
export async function POST(request) {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const { codigo } = await request.json();
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  const admin = crearClienteAdmin();

  let juego;
  try {
    juego = await obtenerJuegoVivoDelProfesor(admin, codigoNormalizado, user.id);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (!juego.activo) {
    return NextResponse.json({ error: 'Este juego está inactivo. Actívalo primero.' }, { status: 403 });
  }

  const banco = await obtenerBancoPreguntas(admin, juego.id);
  const preguntas = seleccionarPreguntasDeBanco(banco, juego.cantidad_preguntas);
  if (preguntas.length === 0) {
    return NextResponse.json({ error: 'Este juego todavía no tiene preguntas cargadas.' }, { status: 409 });
  }

  // Reinicia cualquier partida previa con este código (limpio, sin jugadores).
  await admin.from('sesiones_vivo_jugadores').delete().eq('codigo', codigoNormalizado);

  const { error: errorPublico } = await admin.from('sesiones_vivo').upsert({
    codigo: codigoNormalizado,
    juego_id: juego.id,
    nombre_juego: juego.nombre_juego,
    tematica: juego.tematica,
    estado_juego: 'lobby',
    indice_actual: -1,
    total_preguntas: preguntas.length,
    avance: juego.avance_vivo,
    segundos_por_pregunta: juego.segundos_por_pregunta,
    ayudas_activas: juego.ayudas,
    numero_jugadores: 0,
    nombres_jugadores: [],
    pregunta_actual: null,
    respuestas_recibidas: 0,
    respuesta_correcta_revelada: null,
    distribucion_respuestas: null,
    ranking: [],
    agrupacion: juego.agrupacion_vivo,
    cantidad_equipos: juego.agrupacion_vivo === 'equipos' ? juego.cantidad_equipos : null,
    ranking_equipos: null,
    fin_pregunta_programado: null,
    fin_revelando_programado: null,
  });
  if (errorPublico) return NextResponse.json({ error: errorPublico.message }, { status: 500 });

  const { error: errorPrivado } = await admin
    .from('sesiones_vivo_privado')
    .upsert({ codigo: codigoNormalizado, preguntas, resultados_guardados: false });
  if (errorPrivado) return NextResponse.json({ error: errorPrivado.message }, { status: 500 });

  const { data: fila, error: errorLeer } = await admin
    .from('sesiones_vivo')
    .select('*')
    .eq('codigo', codigoNormalizado)
    .single();
  if (errorLeer) return NextResponse.json({ error: errorLeer.message }, { status: 500 });

  return NextResponse.json(mapearSesionVivoPublica(fila));
}
