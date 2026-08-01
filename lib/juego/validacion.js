// Port literal de validarYNormalizarDatosJuego_ de Code.js: valida y
// normaliza los datos de un formulario de juego (crear o editar), para no
// duplicar las reglas en los dos lugares.
export function validarYNormalizarDatosJuego(datos) {
  datos = datos || {};

  const nombreJuego = (datos.nombreJuego || '').toString().trim().substring(0, 60);
  const profesorNombre = (datos.profesor || '').toString().trim().substring(0, 60);
  const tematica = (datos.tematica || '').toString().trim().substring(0, 60);
  const cantidadPreguntas = parseInt(datos.cantidadPreguntas, 10);
  const modo = datos.modo === 'vivo' ? 'vivo' : 'individual';
  const modoTiempo = datos.modoTiempo === 'total' ? 'total' : 'porPregunta';
  const avanceVivo = datos.avanceVivo === 'manual' ? 'manual' : 'automatico';
  const segundosPorPregunta = parseInt(datos.segundosPorPregunta, 10) || 45;
  const duracionTotalSegundos = (parseInt(datos.duracionTotalMinutos, 10) || 10) * 60;
  const agrupacionVivo = datos.agrupacionVivo === 'equipos' ? 'equipos' : 'individual';
  const cantidadEquipos = parseInt(datos.cantidadEquipos, 10) || 2;
  const ayudas = {
    cincuenta: !!(datos.ayudas && datos.ayudas.cincuenta),
    llamada: !!(datos.ayudas && datos.ayudas.llamada),
    publico: !!(datos.ayudas && datos.ayudas.publico),
  };

  if (!nombreJuego) throw new Error('El nombre del juego es obligatorio.');
  if (!(cantidadPreguntas >= 1 && cantidadPreguntas <= 100)) {
    throw new Error('La cantidad de preguntas debe ser un número entre 1 y 100.');
  }
  if (!(segundosPorPregunta >= 5 && segundosPorPregunta <= 300)) {
    throw new Error('El tiempo por pregunta debe estar entre 5 y 300 segundos.');
  }
  if (modo === 'individual' && modoTiempo === 'total' && !(duracionTotalSegundos >= 60 && duracionTotalSegundos <= 7200)) {
    throw new Error('La duración total debe estar entre 1 y 120 minutos.');
  }
  if (modo === 'vivo' && agrupacionVivo === 'equipos' && !(cantidadEquipos >= 2 && cantidadEquipos <= 20)) {
    throw new Error('La cantidad de equipos debe ser un número entre 2 y 20.');
  }

  return {
    nombreJuego,
    profesorNombre,
    tematica,
    cantidadPreguntas,
    modo,
    ayudas,
    modoTiempo,
    avanceVivo,
    segundosPorPregunta,
    duracionTotalSegundos,
    agrupacionVivo,
    cantidadEquipos,
  };
}
