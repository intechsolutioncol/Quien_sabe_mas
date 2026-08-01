// Validación de una pregunta individual, compartida por el importador de
// CSV (lib/juego/csv.js) y por los endpoints de agregar/editar una sola
// pregunta (app/api/juegos/[codigo]/preguntas/**).
export function validarCamposPregunta({ nivel, pregunta, opcionA, opcionB, opcionC, opcionD, respuestaCorrecta }) {
  const problemas = [];
  if (!(nivel >= 1 && nivel <= 5)) problemas.push('el nivel debe ser un número de 1 a 5');
  if (!pregunta) problemas.push('falta el texto de la pregunta');
  if (!opcionA || !opcionB || !opcionC || !opcionD) problemas.push('faltan una o más opciones');
  if (['A', 'B', 'C', 'D'].indexOf(respuestaCorrecta) === -1) problemas.push('la respuesta correcta debe ser A, B, C o D');
  return problemas;
}

// Convierte la entrada cruda (de un formulario o del JSON de la API) a la
// misma forma que ya usa el resto del sistema para una pregunta.
export function normalizarEntradaPregunta(datos) {
  datos = datos || {};
  return {
    nivel: parseInt(datos.nivel, 10),
    pregunta: (datos.pregunta || '').toString().trim(),
    opcionA: (datos.opcionA || '').toString().trim(),
    opcionB: (datos.opcionB || '').toString().trim(),
    opcionC: (datos.opcionC || '').toString().trim(),
    opcionD: (datos.opcionD || '').toString().trim(),
    respuestaCorrecta: (datos.respuestaCorrecta || '').toString().trim().toUpperCase(),
  };
}
