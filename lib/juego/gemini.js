// Port de la integración con Gemini de Code.js (generación de preguntas
// con IA + chequeo de conexión). Google renombra/retira modelos de Gemini
// con frecuencia, así que en vez de depender de un nombre fijo se consulta
// la lista real de modelos disponibles para esta clave y se elige uno de
// tipo "flash" (rápido/económico) que soporte generateContent. Si se fija
// GEMINI_MODEL en las variables de entorno, ese valor manda siempre.

const GEMINI_MODELO_POR_DEFECTO = 'gemini-2.5-flash';

async function listarModelosGeminiCrudo(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const respuesta = await fetch(url);
  return respuesta;
}

function elegirModeloDesdeListado(datos) {
  const nombres = (datos.models || [])
    .filter((m) => m.supportedGenerationMethods && m.supportedGenerationMethods.indexOf('generateContent') !== -1)
    .map((m) => m.name.replace('models/', ''));

  // Prioriza modelos "flash" estables (evita variantes experimentales o de
  // vista previa, que pueden desaparecer sin aviso); si no hay, relaja el filtro.
  let candidatos = nombres.filter((n) => /flash/i.test(n) && !/exp|preview|thinking/i.test(n));
  if (candidatos.length === 0) candidatos = nombres.filter((n) => /flash/i.test(n));
  if (candidatos.length === 0) candidatos = nombres;

  candidatos.sort().reverse(); // los nombres más nuevos suelen ordenar más alto
  return candidatos[0] || GEMINI_MODELO_POR_DEFECTO;
}

async function obtenerModeloGemini(apiKey) {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;

  const respuesta = await listarModelosGeminiCrudo(apiKey);
  if (!respuesta.ok) return GEMINI_MODELO_POR_DEFECTO;
  const datos = await respuesta.json();
  return elegirModeloDesdeListado(datos);
}

// Chequeo rápido para el panel docente: confirma si GEMINI_API_KEY está
// configurada y responde correctamente, sin exponer nunca la clave ni
// gastar cuota de generación (solo consulta el listado de modelos).
export async function probarConexionIA() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { valida: false, mensaje: 'No se ha configurado GEMINI_API_KEY en las variables de entorno del servidor.' };
  }

  const respuesta = await listarModelosGeminiCrudo(apiKey);

  if (respuesta.ok) {
    const datos = await respuesta.json();
    const modelo = process.env.GEMINI_MODEL || elegirModeloDesdeListado(datos);
    return {
      valida: true,
      mensaje: `La clave de Gemini está configurada y funciona correctamente. Modelo que se usará: ${modelo}.`,
    };
  }

  let detalle = '';
  try {
    const errJson = await respuesta.json();
    if (errJson.error && errJson.error.message) detalle = errJson.error.message;
  } catch {
    /* noop */
  }
  return { valida: false, mensaje: `La clave está configurada pero la API respondió con error ${respuesta.status}. ${detalle}` };
}

function construirPrompt(tematica, edad, distribucion) {
  const totalPreguntas = distribucion.reduce((a, b) => a + b, 0);
  const descripcionNiveles = [1, 2, 3, 4, 5]
    .filter((n) => distribucion[n - 1] > 0)
    .map((n) => `nivel ${n}: ${distribucion[n - 1]} pregunta(s)`)
    .join(', ');

  return [
    'Eres un experto diseñador de evaluaciones educativas en Colombia, especializado en el estilo de las Pruebas Saber del ICFES: preguntas por competencias, con enunciados contextualizados que requieren interpretar, analizar, argumentar o resolver, no solo memorizar un dato aislado.',
    '',
    `Genera exactamente ${totalPreguntas} preguntas de opción múltiple con única respuesta (A, B, C, D) sobre el tema: "${tematica}", apropiadas para estudiantes de aproximadamente ${edad} años.`,
    '',
    `Distribúyelas exactamente así por nivel de dificultad (1 = muy fácil, 5 = muy difícil): ${descripcionNiveles}.`,
    '',
    'Reglas:',
    '- Cada pregunta debe tener un enunciado claro y, cuando aplique, un contexto breve (situación, caso, texto corto o dato descrito en palabras) que obligue a razonar, no solo a recordar.',
    '- Exactamente 4 opciones (A, B, C, D), una sola correcta; los otros 3 distractores deben ser errores plausibles, no absurdos ni obviamente descartables.',
    '- No repitas la misma pregunta ni la misma estructura de enunciado en todas.',
    '- Usa español neutro apropiado para Colombia.',
    '- El campo "nivel" debe coincidir con la distribución pedida.',
    '- El campo "respuestaCorrecta" debe ser exactamente "A", "B", "C" o "D".',
  ].join('\n');
}

const ESQUEMA_PREGUNTAS = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      nivel: { type: 'INTEGER' },
      pregunta: { type: 'STRING' },
      opciones: {
        type: 'OBJECT',
        properties: {
          A: { type: 'STRING' },
          B: { type: 'STRING' },
          C: { type: 'STRING' },
          D: { type: 'STRING' },
        },
        required: ['A', 'B', 'C', 'D'],
      },
      respuestaCorrecta: { type: 'STRING' },
    },
    required: ['nivel', 'pregunta', 'opciones', 'respuestaCorrecta'],
  },
};

export async function generarPreguntasGemini(tematica, edad, distribucion) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('No se ha configurado la clave de la IA (GEMINI_API_KEY). Pide al administrador que la configure.');
  }
  const modelo = await obtenerModeloGemini(apiKey);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const cuerpo = {
    contents: [{ parts: [{ text: construirPrompt(tematica, edad, distribucion) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: ESQUEMA_PREGUNTAS,
      temperature: 0.9,
    },
  };

  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });

  if (!respuesta.ok) {
    let mensajeError = `La IA no pudo generar las preguntas (código ${respuesta.status}).`;
    try {
      const errJson = await respuesta.json();
      if (errJson.error && errJson.error.message) mensajeError += ` ${errJson.error.message}`;
    } catch {
      /* noop */
    }
    throw new Error(mensajeError);
  }

  const datos = await respuesta.json();
  const candidato = datos.candidates && datos.candidates[0];
  const texto = candidato?.content?.parts?.[0]?.text;
  if (!texto) {
    throw new Error('La IA respondió sin contenido utilizable. Intenta de nuevo.');
  }

  let preguntas;
  try {
    preguntas = JSON.parse(texto);
  } catch {
    throw new Error('La respuesta de la IA no tiene un formato válido. Intenta de nuevo.');
  }
  if (!Array.isArray(preguntas)) {
    throw new Error('La respuesta de la IA no tiene el formato esperado. Intenta de nuevo.');
  }
  return preguntas;
}

export function validarPreguntaGenerada(p) {
  const problemas = [];
  if (!p || typeof p !== 'object') {
    problemas.push('formato inválido');
    return problemas;
  }

  const nivel = Number(p.nivel);
  if (!(nivel >= 1 && nivel <= 5)) problemas.push('nivel inválido');
  if (!p.pregunta || !p.pregunta.toString().trim()) problemas.push('falta el enunciado');

  const opciones = p.opciones || {};
  ['A', 'B', 'C', 'D'].forEach((letra) => {
    if (!opciones[letra] || !opciones[letra].toString().trim()) problemas.push(`falta la opción ${letra}`);
  });

  const respuesta = (p.respuestaCorrecta || '').toString().trim().toUpperCase();
  if (['A', 'B', 'C', 'D'].indexOf(respuesta) === -1) problemas.push('respuesta correcta inválida');

  return problemas;
}
