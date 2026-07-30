// Port literal de analizarCsv_ de Code.js: parser CSV (comas, campos entre
// comillas) sin dependencias externas.
export function analizarCsv(texto) {
  texto = (texto || '').toString();
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.substring(1); // quitar BOM si viene del navegador

  const filas = [];
  let fila = [];
  let campo = '';
  let dentroComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto.charAt(i);
    if (dentroComillas) {
      if (c === '"') {
        if (texto.charAt(i + 1) === '"') {
          campo += '"';
          i++;
        } else {
          dentroComillas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      dentroComillas = true;
    } else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\r') {
      // ignorar
    } else if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas.filter((f) => f.some((v) => v.trim() !== ''));
}

// Valida cada fila del CSV subido por el profesor. Devuelve las preguntas
// válidas (listas para guardar) y los mensajes de error de las inválidas.
export function analizarPreguntasCsv(textoCsv) {
  const filas = analizarCsv(textoCsv);
  if (filas.length < 2) {
    throw new Error('El archivo no tiene filas de preguntas (solo encabezado o está vacío).');
  }

  const datos = filas.slice(1);
  const preguntas = [];
  const errores = [];

  datos.forEach((fila, idx) => {
    const numeroFila = idx + 2;
    const nivel = parseInt(fila[0], 10);
    const pregunta = (fila[1] || '').trim();
    const opcionA = (fila[2] || '').trim();
    const opcionB = (fila[3] || '').trim();
    const opcionC = (fila[4] || '').trim();
    const opcionD = (fila[5] || '').trim();
    const respuesta = (fila[6] || '').trim().toUpperCase();

    const problemas = [];
    if (!(nivel >= 1 && nivel <= 5)) problemas.push('el nivel debe ser un número de 1 a 5');
    if (!pregunta) problemas.push('falta el texto de la pregunta');
    if (!opcionA || !opcionB || !opcionC || !opcionD) problemas.push('faltan una o más opciones');
    if (['A', 'B', 'C', 'D'].indexOf(respuesta) === -1) problemas.push('la respuesta correcta debe ser A, B, C o D');

    if (problemas.length) {
      errores.push(`Fila ${numeroFila}: ${problemas.join('; ')}`);
    } else {
      preguntas.push({
        nivel,
        pregunta,
        opcionA,
        opcionB,
        opcionC,
        opcionD,
        respuestaCorrecta: respuesta,
      });
    }
  });

  if (preguntas.length === 0) {
    throw new Error(`Ninguna fila es válida. ${errores.join(' | ')}`);
  }

  return { totalFilas: datos.length, preguntas, errores };
}
