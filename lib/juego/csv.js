import { validarCamposPregunta } from './preguntas';

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
    const candidata = {
      nivel: parseInt(fila[0], 10),
      pregunta: (fila[1] || '').trim(),
      opcionA: (fila[2] || '').trim(),
      opcionB: (fila[3] || '').trim(),
      opcionC: (fila[4] || '').trim(),
      opcionD: (fila[5] || '').trim(),
      respuestaCorrecta: (fila[6] || '').trim().toUpperCase(),
    };

    const problemas = validarCamposPregunta(candidata);
    if (problemas.length) {
      errores.push(`Fila ${numeroFila}: ${problemas.join('; ')}`);
    } else {
      preguntas.push(candidata);
    }
  });

  if (preguntas.length === 0) {
    throw new Error(`Ninguna fila es válida. ${errores.join(' | ')}`);
  }

  return { totalFilas: datos.length, preguntas, errores };
}
