// Helpers de acceso a datos del modo en vivo. La fila de sesiones_vivo es
// exactamente lo que se transmite por Supabase Realtime a host y
// estudiantes: nunca contiene la respuesta correcta mientras la pregunta
// está activa (ver supabase/migrations/0001_init.sql para el porqué de
// separar la tabla pública de las privadas).
export function mapearSesionVivoPublica(fila) {
  return {
    codigo: fila.codigo,
    nombreJuego: fila.nombre_juego,
    tematica: fila.tematica,
    estadoJuego: fila.estado_juego,
    indiceActual: fila.indice_actual,
    totalPreguntas: fila.total_preguntas,
    avance: fila.avance,
    segundosPorPregunta: fila.segundos_por_pregunta,
    ayudasActivas: fila.ayudas_activas,
    numeroJugadores: fila.numero_jugadores,
    nombresJugadores: fila.nombres_jugadores,
    pregunta: fila.pregunta_actual,
    respuestasRecibidas: fila.respuestas_recibidas,
    respuestaCorrecta: fila.respuesta_correcta_revelada,
    distribucionRespuestas: fila.distribucion_respuestas,
    ranking: fila.ranking,
    agrupacion: fila.agrupacion,
    cantidadEquipos: fila.cantidad_equipos,
    rankingEquipos: fila.ranking_equipos,
    finPreguntaProgramado: fila.fin_pregunta_programado,
    finRevelandoProgramado: fila.fin_revelando_programado,
  };
}

export async function obtenerSesionVivoPublica(admin, codigo) {
  const { data, error } = await admin.from('sesiones_vivo').select('*').eq('codigo', codigo).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapearSesionVivoPublica(data) : null;
}

// Verifica que el juego con este código pertenezca al profesor
// autenticado y esté en modo "vivo". Lanza un Error legible si no.
export async function obtenerJuegoVivoDelProfesor(admin, codigo, profesorId) {
  const { data: juego, error } = await admin
    .from('juegos')
    .select('*')
    .eq('codigo', codigo)
    .eq('profesor_id', profesorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!juego) throw new Error('No se encontró el juego indicado.');
  if (juego.modo !== 'vivo') throw new Error('Este juego no está configurado en modo "en vivo".');
  return juego;
}
