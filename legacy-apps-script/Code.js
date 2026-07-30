/**
 * "¿QUIÉN SABE MÁS?" - Plataforma de configuración (Google Apps Script)
 *
 * El profesor crea un juego (temática, cantidad de preguntas, tiempo, ayudas
 * activas), sube su banco de preguntas (CSV) y recibe un código de acceso.
 * Los estudiantes ingresan con ese código y juegan su propia partida
 * individual. No hay premios en dinero: el resultado es un puntaje (cantidad
 * de preguntas respondidas correctamente sobre el total).
 *
 * Los datos (juegos, preguntas, resultados) viven en una hoja de cálculo
 * interna auto-provisionada (ver Datos.gs) que el profesor nunca edita a mano.
 */

var DURACION_CACHE_SEGUNDOS = 1800;      // 30 min por partida en curso
var DURACION_SESION_DOCENTE_SEGUNDOS = 7200; // 2 horas de sesión de profesor
var CLAVE_PASSWORD_PROFESOR = 'PASSWORD_PROFESOR';
var PASSWORD_PROFESOR_POR_DEFECTO = 'millonario2026';

// Clave de la API de Gemini: se configura en Propiedades del script (no tiene
// valor por defecto porque es secreta). Ver instrucciones de despliegue.
var CLAVE_GEMINI_API_KEY = 'GEMINI_API_KEY';
var CLAVE_GEMINI_MODELO = 'GEMINI_MODEL';
var GEMINI_MODELO_POR_DEFECTO = 'gemini-2.5-flash';

// ---------------------------------------------------------------------
// Entrada de la Web App
// ---------------------------------------------------------------------

function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('¿Quién Sabe Más?')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ---------------------------------------------------------------------
// Sesión de partida en curso (CacheService: efímero, solo mientras se juega)
// ---------------------------------------------------------------------

function obtenerEstado_(sessionId) {
  var crudo = CacheService.getScriptCache().get(sessionId);
  return crudo ? JSON.parse(crudo) : null;
}

function guardarEstado_(sessionId, estado) {
  CacheService.getScriptCache().put(sessionId, JSON.stringify(estado), DURACION_CACHE_SEGUNDOS);
}

function tomarAleatorias_(arr, n) {
  var copia = arr.slice();
  var resultado = [];
  for (var i = 0; i < n && copia.length > 0; i++) {
    var idx = Math.floor(Math.random() * copia.length);
    resultado.push(copia[idx]);
    copia.splice(idx, 1);
  }
  return resultado;
}

// Reparte la cantidad de preguntas entre los 5 niveles de dificultad. El
// resto (cuando no es múltiplo de 5) se reparte empezando por los niveles
// más fáciles, para que cantidades pequeñas no salten directo a lo difícil.
function distribuirPorNiveles_(cantidadPreguntas) {
  var base = Math.floor(cantidadPreguntas / 5);
  var resto = cantidadPreguntas % 5;
  var distribucion = [base, base, base, base, base];
  for (var i = 0; i < resto; i++) {
    distribucion[i]++;
  }
  return distribucion;
}

function seleccionarPreguntasJuego_(codigo, cantidadPreguntas) {
  var banco = obtenerPreguntasJuego_(codigo);
  var distribucion = distribuirPorNiveles_(cantidadPreguntas);
  var seleccionadas = [];
  for (var nivel = 1; nivel <= 5; nivel++) {
    var pool = banco.filter(function (p) { return p.nivel === nivel; });
    seleccionadas = seleccionadas.concat(tomarAleatorias_(pool, distribucion[nivel - 1]));
  }
  return seleccionadas;
}

function formatearPreguntaCliente_(preguntaObj, indice) {
  return {
    numero: indice + 1,
    nivel: preguntaObj.nivel,
    pregunta: preguntaObj.pregunta,
    opciones: preguntaObj.opciones
  };
}

function validarAyuda_(estado, nombreAyuda) {
  if (!estado || estado.terminado) {
    throw new Error('La partida no está activa.');
  }
  if (!estado.ayudasActivas || !estado.ayudasActivas[nombreAyuda]) {
    throw new Error('Esta ayuda no está disponible en este juego.');
  }
  if (estado.ayudasUsadas[nombreAyuda]) {
    throw new Error('Esa ayuda ya fue utilizada en esta partida.');
  }
}

// ---------------------------------------------------------------------
// API pública para ESTUDIANTES
// ---------------------------------------------------------------------

function unirseConCodigo(codigo, nombreEstudiante) {
  var codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  if (!codigoNormalizado) throw new Error('Escribe el código del juego.');

  var juego = obtenerJuegoPorCodigo_(codigoNormalizado);
  if (!juego) throw new Error('El código ingresado no existe. Verifícalo con tu profesor.');
  if (!juego.activo) throw new Error('Este juego está inactivo. Consulta a tu profesor.');

  if (juego.modo === 'vivo') {
    return unirseSesionVivo_(juego, nombreEstudiante);
  }

  var preguntasPartida = seleccionarPreguntasJuego_(codigoNormalizado, juego.cantidadPreguntas);
  if (preguntasPartida.length === 0) {
    throw new Error('Este juego todavía no tiene preguntas cargadas. Consulta a tu profesor.');
  }

  var nombre = (nombreEstudiante || '').toString().trim().substring(0, 40) || 'Jugador';
  var sessionId = Utilities.getUuid();
  var estado = {
    codigoJuego: codigoNormalizado,
    nombreJugador: nombre,
    ayudasActivas: juego.ayudas,
    preguntas: preguntasPartida,
    preguntaActual: 0,
    correctas: 0,
    ayudasUsadas: { cincuenta: false, llamada: false, publico: false },
    modoTiempo: juego.modoTiempo,
    segundosPorPregunta: juego.segundosPorPregunta,
    duracionTotalSegundos: juego.duracionTotalSegundos,
    terminado: false
  };
  guardarEstado_(sessionId, estado);

  return {
    modo: 'individual',
    sessionId: sessionId,
    nombreJugador: nombre,
    nombreJuego: juego.nombreJuego,
    tematica: juego.tematica,
    totalPreguntas: preguntasPartida.length,
    ayudasActivas: juego.ayudas,
    modoTiempo: juego.modoTiempo,
    segundosPorPregunta: juego.segundosPorPregunta,
    duracionTotalSegundos: juego.duracionTotalSegundos,
    pregunta: formatearPreguntaCliente_(preguntasPartida[0], 0)
  };
}

function responderPregunta(sessionId, opcionSeleccionada) {
  var estado = obtenerEstado_(sessionId);
  if (!estado || estado.terminado) {
    throw new Error('La sesión no es válida o la partida ya terminó.');
  }

  var indice = estado.preguntaActual;
  var preguntaActual = estado.preguntas[indice];
  var correcta = preguntaActual.respuestaCorrecta;
  var esCorrecta = (opcionSeleccionada === correcta);
  if (esCorrecta) estado.correctas++;

  var resultado = {
    esCorrecta: esCorrecta,
    respuestaCorrecta: correcta,
    numero: indice + 1
  };

  var siguienteIndice = indice + 1;
  var hayMasPreguntas = siguienteIndice < estado.preguntas.length;

  if (estado.modoTiempo === 'porPregunta' && !esCorrecta) {
    // Modo clásico: una respuesta incorrecta termina la partida.
    estado.terminado = true;
    resultado.juegoTerminado = true;
    resultado.motivo = 'fallo';
    resultado.puntajeFinal = estado.correctas;
    resultado.totalPreguntas = estado.preguntas.length;
    guardarResultado_(estado.codigoJuego, estado.nombreJugador, estado.correctas, estado.preguntas.length, 'perdió');
  } else if (!hayMasPreguntas) {
    // Se acabaron las preguntas del banco de esta partida.
    estado.terminado = true;
    estado.preguntaActual = siguienteIndice;
    resultado.juegoTerminado = true;
    resultado.motivo = (estado.correctas === estado.preguntas.length) ? 'perfecto' : 'completado';
    resultado.puntajeFinal = estado.correctas;
    resultado.totalPreguntas = estado.preguntas.length;
    guardarResultado_(estado.codigoJuego, estado.nombreJugador, estado.correctas, estado.preguntas.length, 'completado');
  } else {
    estado.preguntaActual = siguienteIndice;
    resultado.juegoTerminado = false;
    resultado.siguientePregunta = formatearPreguntaCliente_(estado.preguntas[siguienteIndice], siguienteIndice);
  }

  guardarEstado_(sessionId, estado);
  return resultado;
}

// Usado en modo "tiempo total" cuando se agota el reloj de toda la sesión.
function finalizarPorTiempo(sessionId) {
  var estado = obtenerEstado_(sessionId);
  if (!estado || estado.terminado) {
    throw new Error('La sesión no es válida o la partida ya terminó.');
  }
  estado.terminado = true;
  guardarResultado_(estado.codigoJuego, estado.nombreJugador, estado.correctas, estado.preguntas.length, 'tiempo agotado');
  guardarEstado_(sessionId, estado);
  return { puntajeFinal: estado.correctas, totalPreguntas: estado.preguntas.length };
}

// El estudiante decide terminar antes de tiempo y ver su puntaje actual.
function terminarPartida(sessionId) {
  var estado = obtenerEstado_(sessionId);
  if (!estado || estado.terminado) {
    throw new Error('La sesión no es válida o la partida ya terminó.');
  }
  estado.terminado = true;
  guardarResultado_(estado.codigoJuego, estado.nombreJugador, estado.correctas, estado.preguntas.length, 'terminado por el estudiante');
  guardarEstado_(sessionId, estado);
  return { puntajeFinal: estado.correctas, totalPreguntas: estado.preguntas.length };
}

// ---------------------------------------------------------------------
// Cálculo de las 3 ayudas clásicas (funciones puras, sin tocar estado).
// Las usa tanto el modo individual (arriba) como el modo en vivo (Vivo.gs).
// ---------------------------------------------------------------------

function calcularEliminacion5050_(respuestaCorrecta) {
  var opciones = ['A', 'B', 'C', 'D'];
  var incorrectas = opciones.filter(function (o) { return o !== respuestaCorrecta; });
  var mantener = incorrectas[Math.floor(Math.random() * incorrectas.length)];
  return opciones.filter(function (o) { return o !== respuestaCorrecta && o !== mantener; });
}

function calcularRespuestaAmigo_(respuestaCorrecta, nivel) {
  var probabilidadPorNivel = { 1: 0.95, 2: 0.85, 3: 0.70, 4: 0.55, 5: 0.40 };
  var probabilidadAcierto = probabilidadPorNivel[nivel] || 0.6;
  var acierta = Math.random() < probabilidadAcierto;

  var respuestaAmigo;
  if (acierta) {
    respuestaAmigo = respuestaCorrecta;
  } else {
    var incorrectas = ['A', 'B', 'C', 'D'].filter(function (o) { return o !== respuestaCorrecta; });
    respuestaAmigo = incorrectas[Math.floor(Math.random() * incorrectas.length)];
  }
  var confianza = acierta
    ? (60 + Math.floor(Math.random() * 35))
    : (30 + Math.floor(Math.random() * 40));

  return { respuestaSugerida: respuestaAmigo, confianza: confianza };
}

function calcularPorcentajesPublico_(respuestaCorrecta, nivel) {
  var pesoBasePorNivel = { 1: 70, 2: 60, 3: 50, 4: 42, 5: 35 };
  var opciones = ['A', 'B', 'C', 'D'];
  var otras = opciones.filter(function (o) { return o !== respuestaCorrecta; });

  var porcentajes = {};
  porcentajes[respuestaCorrecta] = (pesoBasePorNivel[nivel] || 50) + Math.floor(Math.random() * 15);
  var restante = 100 - porcentajes[respuestaCorrecta];

  for (var i = 0; i < otras.length; i++) {
    if (i === otras.length - 1) {
      porcentajes[otras[i]] = Math.max(0, restante);
    } else {
      var maximoPosible = restante - (otras.length - 1 - i);
      var valor = Math.floor(Math.random() * Math.max(1, maximoPosible + 1));
      porcentajes[otras[i]] = valor;
      restante -= valor;
    }
  }

  return porcentajes;
}

function usarCincuenta(sessionId) {
  var estado = obtenerEstado_(sessionId);
  validarAyuda_(estado, 'cincuenta');
  estado.ayudasUsadas.cincuenta = true;

  var correcta = estado.preguntas[estado.preguntaActual].respuestaCorrecta;
  var eliminar = calcularEliminacion5050_(correcta);

  guardarEstado_(sessionId, estado);
  return { eliminar: eliminar };
}

function usarLlamadaAmigo(sessionId) {
  var estado = obtenerEstado_(sessionId);
  validarAyuda_(estado, 'llamada');
  estado.ayudasUsadas.llamada = true;

  var preguntaActual = estado.preguntas[estado.preguntaActual];
  var resultado = calcularRespuestaAmigo_(preguntaActual.respuestaCorrecta, preguntaActual.nivel);

  guardarEstado_(sessionId, estado);
  return resultado;
}

function usarPreguntaPublico(sessionId) {
  var estado = obtenerEstado_(sessionId);
  validarAyuda_(estado, 'publico');
  estado.ayudasUsadas.publico = true;

  var preguntaActual = estado.preguntas[estado.preguntaActual];
  var porcentajes = calcularPorcentajesPublico_(preguntaActual.respuestaCorrecta, preguntaActual.nivel);

  guardarEstado_(sessionId, estado);
  return { porcentajes: porcentajes };
}

// ---------------------------------------------------------------------
// Autenticación de PROFESOR (contraseña compartida)
// ---------------------------------------------------------------------

function asegurarPasswordProfesor_() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(CLAVE_PASSWORD_PROFESOR)) {
    props.setProperty(CLAVE_PASSWORD_PROFESOR, PASSWORD_PROFESOR_POR_DEFECTO);
  }
}

function iniciarSesionDocente(password) {
  asegurarPasswordProfesor_();
  var clave = PropertiesService.getScriptProperties().getProperty(CLAVE_PASSWORD_PROFESOR);
  if ((password || '').toString() !== clave) {
    throw new Error('Contraseña incorrecta.');
  }
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put('docente_' + token, '1', DURACION_SESION_DOCENTE_SEGUNDOS);
  return { token: token };
}

function validarTokenDocente_(token) {
  var valido = CacheService.getScriptCache().get('docente_' + (token || ''));
  if (!valido) {
    throw new Error('Tu sesión de profesor expiró. Vuelve a ingresar la contraseña.');
  }
}

// ---------------------------------------------------------------------
// API pública para PROFESORES
// ---------------------------------------------------------------------

// Valida y normaliza los datos de un formulario de juego (usado tanto para
// crear como para editar), para no duplicar las reglas en los dos lugares.
function validarYNormalizarDatosJuego_(datos) {
  datos = datos || {};

  var nombreJuego = (datos.nombreJuego || '').toString().trim().substring(0, 60);
  var profesor = (datos.profesor || '').toString().trim().substring(0, 60);
  var tematica = (datos.tematica || '').toString().trim().substring(0, 60);
  var cantidadPreguntas = parseInt(datos.cantidadPreguntas, 10);
  var modo = (datos.modo === 'vivo') ? 'vivo' : 'individual';
  var modoTiempo = (datos.modoTiempo === 'total') ? 'total' : 'porPregunta';
  var avanceVivo = (datos.avanceVivo === 'manual') ? 'manual' : 'automatico';
  var segundosPorPregunta = parseInt(datos.segundosPorPregunta, 10) || 45;
  var duracionTotalSegundos = (parseInt(datos.duracionTotalMinutos, 10) || 10) * 60;
  var ayudas = {
    cincuenta: !!(datos.ayudas && datos.ayudas.cincuenta),
    llamada: !!(datos.ayudas && datos.ayudas.llamada),
    publico: !!(datos.ayudas && datos.ayudas.publico)
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

  return {
    nombreJuego: nombreJuego,
    profesor: profesor,
    tematica: tematica,
    cantidadPreguntas: cantidadPreguntas,
    modo: modo,
    ayudas: ayudas,
    modoTiempo: modoTiempo,
    avanceVivo: avanceVivo,
    segundosPorPregunta: segundosPorPregunta,
    duracionTotalSegundos: duracionTotalSegundos
  };
}

function crearJuego(token, datos) {
  validarTokenDocente_(token);
  var juego = validarYNormalizarDatosJuego_(datos);
  juego.codigo = generarCodigoJuego_();
  juego.fechaCreacion = new Date().toISOString();
  juego.activo = true;
  guardarJuego_(juego);
  return juego;
}

// Edita un juego existente (mismo código, para no romper los enlaces que ya
// tienen los estudiantes). Las partidas ya iniciadas no se ven afectadas:
// cada una guarda su propia copia de la configuración al entrar con el
// código, así que los cambios solo aplican a partidas nuevas.
function actualizarJuego(token, codigo, datos) {
  validarTokenDocente_(token);
  var codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  var existente = obtenerJuegoPorCodigo_(codigoNormalizado);
  if (!existente) throw new Error('No se encontró el juego indicado.');

  var juego = validarYNormalizarDatosJuego_(datos);
  var actualizado = actualizarJuego_(codigoNormalizado, juego);
  if (!actualizado) throw new Error('No se pudo actualizar el juego.');

  juego.codigo = codigoNormalizado;
  juego.fechaCreacion = existente.fechaCreacion;
  juego.activo = existente.activo;
  return juego;
}

function listarJuegosDocente(token) {
  validarTokenDocente_(token);
  return listarJuegos_().map(function (j) {
    return {
      codigo: j.codigo,
      nombreJuego: j.nombreJuego,
      profesor: j.profesor,
      tematica: j.tematica,
      cantidadPreguntas: j.cantidadPreguntas,
      modo: j.modo,
      ayudas: j.ayudas,
      modoTiempo: j.modoTiempo,
      avanceVivo: j.avanceVivo,
      segundosPorPregunta: j.segundosPorPregunta,
      duracionTotalSegundos: j.duracionTotalSegundos,
      fechaCreacion: j.fechaCreacion,
      activo: j.activo,
      preguntasCargadas: contarPreguntasJuego_(j.codigo)
    };
  });
}

function alternarActivoJuego(token, codigo, activo) {
  validarTokenDocente_(token);
  var actualizado = actualizarEstadoJuego_(codigo, !!activo);
  if (!actualizado) throw new Error('No se encontró el juego indicado.');
  return { ok: true };
}

function obtenerResultadosDocente(token, codigo) {
  validarTokenDocente_(token);
  return obtenerResultadosJuego_(codigo);
}

// Analiza el CSV subido por el profesor (delimitado por comas, con soporte de
// campos entre comillas) y valida cada fila antes de guardarla.
function analizarCsv_(texto) {
  texto = (texto || '').toString();
  if (texto.charCodeAt(0) === 0xFEFF) texto = texto.substring(1); // quitar BOM si viene del navegador
  var filas = [];
  var fila = [];
  var campo = '';
  var dentroComillas = false;

  for (var i = 0; i < texto.length; i++) {
    var c = texto.charAt(i);
    if (dentroComillas) {
      if (c === '"') {
        if (texto.charAt(i + 1) === '"') { campo += '"'; i++; }
        else { dentroComillas = false; }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      dentroComillas = true;
    } else if (c === ',') {
      fila.push(campo); campo = '';
    } else if (c === '\r') {
      // ignorar
    } else if (c === '\n') {
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else {
      campo += c;
    }
  }
  if (campo.length > 0 || fila.length > 0) { fila.push(campo); filas.push(fila); }

  return filas.filter(function (f) { return f.some(function (v) { return v.trim() !== ''; }); });
}

function importarPreguntasExcel(token, codigo, textoCsv) {
  validarTokenDocente_(token);
  var codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  var juego = obtenerJuegoPorCodigo_(codigoNormalizado);
  if (!juego) throw new Error('Juego no encontrado.');

  var filas = analizarCsv_(textoCsv);
  if (filas.length < 2) {
    throw new Error('El archivo no tiene filas de preguntas (solo encabezado o está vacío).');
  }

  var datos = filas.slice(1);
  var preguntas = [];
  var errores = [];

  datos.forEach(function (fila, idx) {
    var numeroFila = idx + 2;
    var nivel = parseInt(fila[0], 10);
    var pregunta = (fila[1] || '').trim();
    var opcionA = (fila[2] || '').trim();
    var opcionB = (fila[3] || '').trim();
    var opcionC = (fila[4] || '').trim();
    var opcionD = (fila[5] || '').trim();
    var respuesta = (fila[6] || '').trim().toUpperCase();

    var problemas = [];
    if (!(nivel >= 1 && nivel <= 5)) problemas.push('el nivel debe ser un número de 1 a 5');
    if (!pregunta) problemas.push('falta el texto de la pregunta');
    if (!opcionA || !opcionB || !opcionC || !opcionD) problemas.push('faltan una o más opciones');
    if (['A', 'B', 'C', 'D'].indexOf(respuesta) === -1) problemas.push('la respuesta correcta debe ser A, B, C o D');

    if (problemas.length) {
      errores.push('Fila ' + numeroFila + ': ' + problemas.join('; '));
    } else {
      preguntas.push({
        nivel: nivel, pregunta: pregunta,
        opcionA: opcionA, opcionB: opcionB, opcionC: opcionC, opcionD: opcionD,
        respuestaCorrecta: respuesta
      });
    }
  });

  if (preguntas.length === 0) {
    throw new Error('Ninguna fila es válida. ' + errores.join(' | '));
  }

  guardarPreguntasJuego_(codigoNormalizado, preguntas);

  return { totalFilas: datos.length, importadas: preguntas.length, errores: errores };
}

// ---------------------------------------------------------------------
// Generación de preguntas con IA (Gemini)
// ---------------------------------------------------------------------

function validarPreguntaGenerada_(p) {
  var problemas = [];
  if (!p || typeof p !== 'object') { problemas.push('formato inválido'); return problemas; }

  var nivel = Number(p.nivel);
  if (!(nivel >= 1 && nivel <= 5)) problemas.push('nivel inválido');
  if (!p.pregunta || !p.pregunta.toString().trim()) problemas.push('falta el enunciado');

  var opciones = p.opciones || {};
  ['A', 'B', 'C', 'D'].forEach(function (letra) {
    if (!opciones[letra] || !opciones[letra].toString().trim()) problemas.push('falta la opción ' + letra);
  });

  var respuesta = (p.respuestaCorrecta || '').toString().trim().toUpperCase();
  if (['A', 'B', 'C', 'D'].indexOf(respuesta) === -1) problemas.push('respuesta correcta inválida');

  return problemas;
}

// Chequeo rápido para el panel docente: confirma si GEMINI_API_KEY está
// configurada y responde correctamente, sin exponer nunca la clave ni gastar
// cuota de generación (solo consulta el listado de modelos).
function probarConexionIA(token) {
  validarTokenDocente_(token);

  var apiKey = PropertiesService.getScriptProperties().getProperty(CLAVE_GEMINI_API_KEY);
  if (!apiKey) {
    return { valida: false, mensaje: 'No se ha configurado GEMINI_API_KEY en Propiedades del script.' };
  }

  var respuestaListado = listarModelosGeminiCrudo_(apiKey);
  var codigoHttp = respuestaListado.getResponseCode();

  if (codigoHttp === 200) {
    var fijado = PropertiesService.getScriptProperties().getProperty(CLAVE_GEMINI_MODELO);
    var modelo = fijado || elegirModeloDesdeListado_(respuestaListado);
    return {
      valida: true,
      mensaje: 'La clave de Gemini está configurada y funciona correctamente. Modelo que se usará: ' + modelo + '.'
    };
  }

  var detalle = '';
  try {
    var errJson = JSON.parse(respuestaListado.getContentText());
    if (errJson.error && errJson.error.message) detalle = errJson.error.message;
  } catch (e) { /* noop */ }
  return { valida: false, mensaje: 'La clave está configurada pero la API respondió con error ' + codigoHttp + '. ' + detalle };
}

// Google renombra/retira modelos de Gemini con frecuencia, así que en vez de
// depender de un nombre fijo (que puede quedar obsoleto), se consulta la
// lista real de modelos disponibles para ESTA clave y se elige uno de tipo
// "flash" (rápido/económico) que soporte generateContent. Si el administrador
// fija GEMINI_MODEL en Propiedades del script, ese valor manda siempre.
function listarModelosGeminiCrudo_(apiKey) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey);
  return UrlFetchApp.fetch(url, { muteHttpExceptions: true });
}

function elegirModeloDesdeListado_(respuestaListado) {
  if (respuestaListado.getResponseCode() !== 200) return GEMINI_MODELO_POR_DEFECTO;

  var datos = JSON.parse(respuestaListado.getContentText());
  var nombres = (datos.models || [])
    .filter(function (m) {
      return m.supportedGenerationMethods && m.supportedGenerationMethods.indexOf('generateContent') !== -1;
    })
    .map(function (m) { return m.name.replace('models/', ''); });

  // Prioriza modelos "flash" estables (evita variantes experimentales o de
  // vista previa, que pueden desaparecer sin aviso); si no hay, relaja el filtro.
  var candidatos = nombres.filter(function (n) { return /flash/i.test(n) && !/exp|preview|thinking/i.test(n); });
  if (candidatos.length === 0) candidatos = nombres.filter(function (n) { return /flash/i.test(n); });
  if (candidatos.length === 0) candidatos = nombres;

  candidatos.sort().reverse(); // los nombres más nuevos suelen ordenar más alto (gemini-3... > gemini-2...)
  return candidatos[0] || GEMINI_MODELO_POR_DEFECTO;
}

function obtenerModeloGemini_(apiKey) {
  var fijado = PropertiesService.getScriptProperties().getProperty(CLAVE_GEMINI_MODELO);
  return fijado || elegirModeloDesdeListado_(listarModelosGeminiCrudo_(apiKey));
}

// Construye el prompt y llama al modelo de Gemini pidiendo JSON estructurado
// (responseSchema), para que la respuesta sea directamente parseable.
function generarPreguntasGemini_(tematica, edad, distribucion) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty(CLAVE_GEMINI_API_KEY);
  if (!apiKey) {
    throw new Error('No se ha configurado la clave de la IA (GEMINI_API_KEY) en las Propiedades del script. Pide al administrador que la configure.');
  }
  var modelo = obtenerModeloGemini_(apiKey);

  var totalPreguntas = distribucion.reduce(function (a, b) { return a + b; }, 0);
  var descripcionNiveles = [1, 2, 3, 4, 5]
    .filter(function (n) { return distribucion[n - 1] > 0; })
    .map(function (n) { return 'nivel ' + n + ': ' + distribucion[n - 1] + ' pregunta(s)'; })
    .join(', ');

  var prompt = [
    'Eres un experto diseñador de evaluaciones educativas en Colombia, especializado en el estilo de las Pruebas Saber del ICFES: preguntas por competencias, con enunciados contextualizados que requieren interpretar, analizar, argumentar o resolver, no solo memorizar un dato aislado.',
    '',
    'Genera exactamente ' + totalPreguntas + ' preguntas de opción múltiple con única respuesta (A, B, C, D) sobre el tema: "' + tematica + '", apropiadas para estudiantes de aproximadamente ' + edad + ' años.',
    '',
    'Distribúyelas exactamente así por nivel de dificultad (1 = muy fácil, 5 = muy difícil): ' + descripcionNiveles + '.',
    '',
    'Reglas:',
    '- Cada pregunta debe tener un enunciado claro y, cuando aplique, un contexto breve (situación, caso, texto corto o dato descrito en palabras) que obligue a razonar, no solo a recordar.',
    '- Exactamente 4 opciones (A, B, C, D), una sola correcta; los otros 3 distractores deben ser errores plausibles, no absurdos ni obviamente descartables.',
    '- No repitas la misma pregunta ni la misma estructura de enunciado en todas.',
    '- Usa español neutro apropiado para Colombia.',
    '- El campo "nivel" debe coincidir con la distribución pedida.',
    '- El campo "respuestaCorrecta" debe ser exactamente "A", "B", "C" o "D".'
  ].join('\n');

  var esquema = {
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
            D: { type: 'STRING' }
          },
          required: ['A', 'B', 'C', 'D']
        },
        respuestaCorrecta: { type: 'STRING' }
      },
      required: ['nivel', 'pregunta', 'opciones', 'respuestaCorrecta']
    }
  };

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent?key=' + encodeURIComponent(apiKey);
  var cuerpo = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: esquema,
      temperature: 0.9
    }
  };

  var respuesta = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(cuerpo),
    muteHttpExceptions: true
  });

  var codigoHttp = respuesta.getResponseCode();
  var textoRespuesta = respuesta.getContentText();

  if (codigoHttp !== 200) {
    var mensajeError = 'La IA no pudo generar las preguntas (código ' + codigoHttp + ').';
    try {
      var errJson = JSON.parse(textoRespuesta);
      if (errJson.error && errJson.error.message) mensajeError += ' ' + errJson.error.message;
    } catch (e) { /* noop */ }
    throw new Error(mensajeError);
  }

  var datos = JSON.parse(textoRespuesta);
  var candidato = datos.candidates && datos.candidates[0];
  var texto = candidato && candidato.content && candidato.content.parts && candidato.content.parts[0] && candidato.content.parts[0].text;
  if (!texto) {
    throw new Error('La IA respondió sin contenido utilizable. Intenta de nuevo.');
  }

  var preguntas;
  try {
    preguntas = JSON.parse(texto);
  } catch (e) {
    throw new Error('La respuesta de la IA no tiene un formato válido. Intenta de nuevo.');
  }
  if (!Array.isArray(preguntas)) {
    throw new Error('La respuesta de la IA no tiene el formato esperado. Intenta de nuevo.');
  }
  return preguntas;
}

function generarPreguntasConIA(token, codigo, edadEstudiantes) {
  validarTokenDocente_(token);
  var codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  var juego = obtenerJuegoPorCodigo_(codigoNormalizado);
  if (!juego) throw new Error('Juego no encontrado.');
  if (!juego.tematica) {
    throw new Error('Este juego no tiene una temática definida. Edítalo y agrega una temática antes de generar preguntas con IA.');
  }

  var edad = parseInt(edadEstudiantes, 10);
  if (!(edad >= 5 && edad <= 25)) {
    throw new Error('Ingresa una edad válida (entre 5 y 25 años).');
  }

  var distribucion = distribuirPorNiveles_(juego.cantidadPreguntas);
  var preguntasGeneradas = generarPreguntasGemini_(juego.tematica, edad, distribucion);

  var errores = [];
  var preguntasValidas = [];
  preguntasGeneradas.forEach(function (p, idx) {
    var problemas = validarPreguntaGenerada_(p);
    if (problemas.length) {
      errores.push('Pregunta ' + (idx + 1) + ': ' + problemas.join('; '));
      return;
    }
    preguntasValidas.push({
      nivel: Number(p.nivel),
      pregunta: p.pregunta.toString().trim(),
      opcionA: p.opciones.A.toString().trim(),
      opcionB: p.opciones.B.toString().trim(),
      opcionC: p.opciones.C.toString().trim(),
      opcionD: p.opciones.D.toString().trim(),
      respuestaCorrecta: p.respuestaCorrecta.toString().trim().toUpperCase()
    });
  });

  if (preguntasValidas.length === 0) {
    throw new Error('La IA no devolvió preguntas con un formato válido. Intenta de nuevo. ' + errores.join(' | '));
  }

  guardarPreguntasJuego_(codigoNormalizado, preguntasValidas);

  return { totalFilas: preguntasGeneradas.length, importadas: preguntasValidas.length, errores: errores };
}
