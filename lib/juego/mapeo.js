// Traduce entre las columnas snake_case de Postgres y la forma camelCase
// que espera el cliente (misma forma que ya devolvía Code.js/Datos.js).
export function mapearJuego(fila, preguntasCargadas) {
  const resultado = {
    codigo: fila.codigo,
    nombreJuego: fila.nombre_juego,
    profesor: fila.profesor_nombre,
    tematica: fila.tematica,
    cantidadPreguntas: fila.cantidad_preguntas,
    modo: fila.modo,
    ayudas: fila.ayudas,
    modoTiempo: fila.modo_tiempo,
    avanceVivo: fila.avance_vivo,
    segundosPorPregunta: fila.segundos_por_pregunta,
    duracionTotalSegundos: fila.duracion_total_segundos,
    fechaCreacion: fila.creado_en,
    activo: fila.activo,
  };
  if (preguntasCargadas !== undefined) {
    resultado.preguntasCargadas = preguntasCargadas;
  }
  return resultado;
}

export function mapearPreguntaBanco(fila) {
  return {
    nivel: fila.nivel,
    pregunta: fila.pregunta,
    opciones: { A: fila.opcion_a, B: fila.opcion_b, C: fila.opcion_c, D: fila.opcion_d },
    respuestaCorrecta: fila.respuesta_correcta,
  };
}

export function mapearResultado(fila) {
  return {
    nombreEstudiante: fila.nombre_estudiante,
    puntaje: fila.puntaje,
    totalPreguntas: fila.total_preguntas,
    resultado: fila.resultado,
    fecha: fila.creado_en,
  };
}
