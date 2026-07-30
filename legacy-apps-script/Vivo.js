/**
 * Motor del modo "En vivo y sincronizado". Apps Script no tiene WebSockets,
 * así que la sincronización se logra por sondeo (polling): el host y cada
 * estudiante consultan el estado de la sesión cada pocos segundos y el
 * servidor calcula, de forma perezosa (en cada consulta), si ya debe pasar
 * de "pregunta" a "revelando" o a la siguiente pregunta, usando marcas de
 * tiempo absolutas. Así todos los clientes convergen al mismo estado sin
 * depender de que uno de ellos "empuje" la actualización.
 *
 * La sesión en vivo vive en CacheService bajo la clave "vivo_<codigo>" y solo
 * existe mientras se está jugando; los resultados finales se guardan en la
 * hoja de Resultados igual que en el modo individual.
 *
 * Como el host y cada estudiante sondean concurrentemente la MISMA sesión,
 * todo acceso de lectura-modificación-escritura pasa por conSesionVivo_(),
 * que toma un LockService.getScriptLock() para que dos peticiones simultáneas
 * nunca se pisen (CacheService no tiene transacciones: sin este bloqueo, la
 * última escritura gana y se pueden perder respuestas o revertir el estado).
 */

var DURACION_CACHE_VIVO_SEGUNDOS = 21600; // 6 horas: alcanza para una sesión de clase completa
var DURACION_REVELADO_MS = 8000;          // cuánto se muestra la respuesta correcta + ranking antes de avanzar solo
var DEMORA_TRAS_ULTIMA_RESPUESTA_MS = 1000; // si ya respondieron todos, no hay que esperar el resto del reloj

// Puntaje estilo concurso: acertar rápido da más puntos que acertar al
// límite del tiempo; las preguntas más difíciles valen más de entrada.
var PUNTOS_BASE_POR_NIVEL_VIVO = { 1: 500, 2: 750, 3: 1000, 4: 1250, 5: 1500 };

function calcularPuntosVivo_(nivel, segundosTranscurridos, segundosLimite) {
  var base = PUNTOS_BASE_POR_NIVEL_VIVO[nivel] || 1000;
  var fraccionRestante = Math.max(0, Math.min(1, 1 - (segundosTranscurridos / segundosLimite)));
  var factor = 0.5 + fraccionRestante * 0.5; // entre 0.5 (al límite) y 1.0 (respuesta instantánea)
  return Math.round(base * factor);
}

// ---------------------------------------------------------------------
// Almacenamiento de la sesión en vivo (con bloqueo contra condiciones de carrera)
// ---------------------------------------------------------------------

function claveVivo_(codigo) { return 'vivo_' + codigo; }

function normalizarCodigoVivo_(codigo) {
  return (codigo || '').toString().trim().toUpperCase();
}

function obtenerSesionVivo_(codigo) {
  var crudo = CacheService.getScriptCache().get(claveVivo_(codigo));
  return crudo ? JSON.parse(crudo) : null;
}

function guardarSesionVivo_(sesion) {
  CacheService.getScriptCache().put(claveVivo_(sesion.codigoJuego), JSON.stringify(sesion), DURACION_CACHE_VIVO_SEGUNDOS);
}

// Envuelve toda lectura-modificación-escritura de una sesión en vivo en un
// bloqueo exclusivo, para que dos sondeos simultáneos (dos estudiantes, o un
// estudiante y el host) nunca se pisen. fn(sesion) recibe la sesión ya
// cargada y debe mutarla directamente; lo que fn devuelva es lo que se
// retorna al cliente. Si fn no encuentra la sesión válida, debe lanzar error.
function conSesionVivo_(codigo, fn, mensajeSiNoExiste) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sesion = obtenerSesionVivo_(codigo);
    if (!sesion) {
      throw new Error(mensajeSiNoExiste || 'Esta sesión en vivo ya no existe.');
    }
    var resultado = fn(sesion);
    guardarSesionVivo_(sesion);
    return resultado;
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------
// Transiciones de estado (perezosas: se evalúan en cada sondeo)
// ---------------------------------------------------------------------

function iniciarPregunta_(sesion) {
  var siguiente = sesion.indiceActual + 1;
  if (siguiente >= sesion.preguntas.length) {
    finalizarSesionVivo_(sesion);
    return;
  }
  sesion.indiceActual = siguiente;
  sesion.estadoJuego = 'pregunta';
  sesion.inicioPregunta = Date.now();
  sesion.finPreguntaProgramado = sesion.inicioPregunta + sesion.segundosPorPregunta * 1000;
}

function iniciarRevelado_(sesion) {
  sesion.estadoJuego = 'revelando';
  sesion.inicioRevelando = Date.now();
  sesion.finRevelandoProgramado = sesion.inicioRevelando + DURACION_REVELADO_MS;
}

function finalizarSesionVivo_(sesion) {
  sesion.estadoJuego = 'finalizado';
  if (!sesion.resultadosGuardados) {
    Object.keys(sesion.jugadores).forEach(function (sid) {
      var jugador = sesion.jugadores[sid];
      var correctas = Object.keys(jugador.respuestas).filter(function (i) {
        return jugador.respuestas[i].esCorrecta;
      }).length;
      guardarResultado_(sesion.codigoJuego, jugador.nombre, correctas, sesion.preguntas.length, 'en vivo');
    });
    sesion.resultadosGuardados = true;
  }
}

// Avanza el estado tantas veces como haga falta según el reloj (útil si
// nadie sondeó durante un buen rato: no se saltan preguntas, se procesan
// las transiciones en orden hasta quedar al día).
function avanzarSiCorresponde_(sesion) {
  var limite = sesion.preguntas.length + 5; // salvaguarda contra bucles infinitos
  while (limite-- > 0) {
    var ahora = Date.now();
    if (sesion.estadoJuego === 'pregunta' && ahora >= sesion.finPreguntaProgramado) {
      iniciarRevelado_(sesion);
      continue;
    }
    if (sesion.estadoJuego === 'revelando' && sesion.avance === 'automatico' && ahora >= sesion.finRevelandoProgramado) {
      iniciarPregunta_(sesion);
      continue;
    }
    break;
  }
  return sesion;
}

// ---------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------

function calcularRankingCompleto_(sesion) {
  return Object.keys(sesion.jugadores)
    .map(function (sid) {
      return { sessionId: sid, nombre: sesion.jugadores[sid].nombre, puntaje: sesion.jugadores[sid].puntajeTotal };
    })
    .sort(function (a, b) { return b.puntaje - a.puntaje; });
}

function quitarSessionId_(ranking) {
  return ranking.map(function (r) { return { nombre: r.nombre, puntaje: r.puntaje }; });
}

function contarRespuestasPregunta_(sesion, indice) {
  return Object.keys(sesion.jugadores).filter(function (sid) {
    return !!sesion.jugadores[sid].respuestas[indice];
  }).length;
}

function calcularDistribucionRespuestas_(sesion, indice) {
  var conteo = { A: 0, B: 0, C: 0, D: 0 };
  Object.keys(sesion.jugadores).forEach(function (sid) {
    var r = sesion.jugadores[sid].respuestas[indice];
    if (r && conteo[r.opcion] !== undefined) conteo[r.opcion]++;
  });
  return conteo;
}

// ---------------------------------------------------------------------
// API pública para el PROFESOR (host)
// ---------------------------------------------------------------------

function iniciarSesionVivo(token, codigo) {
  validarTokenDocente_(token);
  var codigoNormalizado = normalizarCodigoVivo_(codigo);
  var juego = obtenerJuegoPorCodigo_(codigoNormalizado);
  if (!juego) throw new Error('Juego no encontrado.');
  if (juego.modo !== 'vivo') throw new Error('Este juego no está configurado en modo "en vivo".');
  if (!juego.activo) throw new Error('Este juego está inactivo. Actívalo primero.');

  var preguntas = seleccionarPreguntasJuego_(codigoNormalizado, juego.cantidadPreguntas);
  if (preguntas.length === 0) {
    throw new Error('Este juego todavía no tiene preguntas cargadas.');
  }

  var sesion = {
    codigoJuego: codigoNormalizado,
    nombreJuego: juego.nombreJuego,
    tematica: juego.tematica,
    hostToken: Utilities.getUuid(),
    avance: juego.avanceVivo || 'automatico',
    segundosPorPregunta: juego.segundosPorPregunta || 20,
    ayudasActivas: juego.ayudas,
    preguntas: preguntas,
    estadoJuego: 'lobby',
    indiceActual: -1,
    inicioPregunta: null,
    finPreguntaProgramado: null,
    inicioRevelando: null,
    finRevelandoProgramado: null,
    resultadosGuardados: false,
    jugadores: {}
  };
  guardarSesionVivo_(sesion);

  return { hostToken: sesion.hostToken, codigo: codigoNormalizado, nombreJuego: juego.nombreJuego, totalPreguntas: preguntas.length };
}

function validarHost_(sesion, hostToken) {
  if (sesion.hostToken !== hostToken) {
    throw new Error('La sesión de host no es válida o ya terminó.');
  }
}

function construirPayloadHost_(sesion) {
  var payload = {
    estadoJuego: sesion.estadoJuego,
    avance: sesion.avance,
    numeroJugadores: Object.keys(sesion.jugadores).length,
    nombresJugadores: Object.keys(sesion.jugadores).map(function (sid) { return sesion.jugadores[sid].nombre; }),
    indiceActual: sesion.indiceActual,
    totalPreguntas: sesion.preguntas.length
  };

  if (sesion.estadoJuego === 'pregunta') {
    var p = sesion.preguntas[sesion.indiceActual];
    payload.pregunta = { numero: sesion.indiceActual + 1, nivel: p.nivel, pregunta: p.pregunta, opciones: p.opciones };
    payload.segundosRestantes = Math.max(0, Math.round((sesion.finPreguntaProgramado - Date.now()) / 1000));
    payload.segundosPorPregunta = sesion.segundosPorPregunta;
    payload.respuestasRecibidas = contarRespuestasPregunta_(sesion, sesion.indiceActual);
  } else if (sesion.estadoJuego === 'revelando') {
    var pr = sesion.preguntas[sesion.indiceActual];
    payload.pregunta = { numero: sesion.indiceActual + 1, pregunta: pr.pregunta, opciones: pr.opciones };
    payload.respuestaCorrecta = pr.respuestaCorrecta;
    payload.distribucionRespuestas = calcularDistribucionRespuestas_(sesion, sesion.indiceActual);
    payload.ranking = quitarSessionId_(calcularRankingCompleto_(sesion).slice(0, 5));
    payload.segundosParaAvanzar = sesion.avance === 'automatico'
      ? Math.max(0, Math.round((sesion.finRevelandoProgramado - Date.now()) / 1000))
      : null;
  } else if (sesion.estadoJuego === 'finalizado') {
    payload.ranking = quitarSessionId_(calcularRankingCompleto_(sesion));
  }

  return payload;
}

function obtenerEstadoHost(hostToken, codigo) {
  return conSesionVivo_(normalizarCodigoVivo_(codigo), function (sesion) {
    validarHost_(sesion, hostToken);
    avanzarSiCorresponde_(sesion);
    return construirPayloadHost_(sesion);
  });
}

// Arranca la primera pregunta (desde el lobby) o pasa a la siguiente (desde
// "revelando"); usado tanto por el botón manual del host como, en el modo
// automático, no hace falta llamarlo (avanzarSiCorresponde_ lo hace solo).
function iniciarPreguntaVivo(hostToken, codigo) {
  return conSesionVivo_(normalizarCodigoVivo_(codigo), function (sesion) {
    validarHost_(sesion, hostToken);
    if (sesion.estadoJuego !== 'lobby' && sesion.estadoJuego !== 'revelando') {
      throw new Error('No se puede iniciar una pregunta en este momento.');
    }
    iniciarPregunta_(sesion);
    return construirPayloadHost_(sesion);
  });
}

// Corta el tiempo de la pregunta actual y revela ya (el host no quiere
// esperar a que se acabe el reloj).
function revelarAhoraVivo(hostToken, codigo) {
  return conSesionVivo_(normalizarCodigoVivo_(codigo), function (sesion) {
    validarHost_(sesion, hostToken);
    if (sesion.estadoJuego !== 'pregunta') throw new Error('No hay una pregunta activa para revelar.');
    iniciarRevelado_(sesion);
    return construirPayloadHost_(sesion);
  });
}

function finalizarSesionVivoManual(hostToken, codigo) {
  return conSesionVivo_(normalizarCodigoVivo_(codigo), function (sesion) {
    validarHost_(sesion, hostToken);
    finalizarSesionVivo_(sesion);
    return construirPayloadHost_(sesion);
  });
}

// ---------------------------------------------------------------------
// API pública para el ESTUDIANTE
// ---------------------------------------------------------------------

// Llamado desde unirseConCodigo() en Code.gs cuando el juego es modo "vivo".
function unirseSesionVivo_(juego, nombreEstudiante) {
  return conSesionVivo_(juego.codigo, function (sesion) {
    if (sesion.estadoJuego !== 'lobby') {
      throw new Error('Esta partida en vivo ya comenzó. Espera a que el profesor inicie una nueva ronda.');
    }
    var sessionId = Utilities.getUuid();
    var nombre = (nombreEstudiante || '').toString().trim().substring(0, 40) || 'Jugador';
    sesion.jugadores[sessionId] = {
      nombre: nombre,
      puntajeTotal: 0,
      respuestas: {},
      ayudasUsadas: { cincuenta: false, llamada: false, publico: false }
    };
    return {
      modo: 'vivo',
      sessionId: sessionId,
      codigoJuego: juego.codigo,
      nombreJuego: juego.nombreJuego,
      tematica: juego.tematica,
      nombreJugador: nombre
    };
  }, 'Tu profesor todavía no ha iniciado esta sesión en vivo.');
}

function obtenerJugadorVivo_(sesion, sessionId) {
  var jugador = sesion.jugadores[sessionId];
  if (!jugador) throw new Error('Tu sesión ya no es válida. Vuelve a ingresar con el código.');
  return jugador;
}

function obtenerEstadoEstudianteVivo(sessionId, codigo) {
  return conSesionVivo_(normalizarCodigoVivo_(codigo), function (sesion) {
    var jugador = obtenerJugadorVivo_(sesion, sessionId);
    avanzarSiCorresponde_(sesion);

    var payload = {
      estadoJuego: sesion.estadoJuego,
      numeroJugadores: Object.keys(sesion.jugadores).length,
      indiceActual: sesion.indiceActual,
      totalPreguntas: sesion.preguntas.length,
      puntajeTotal: jugador.puntajeTotal,
      ayudasActivas: sesion.ayudasActivas,
      ayudasUsadas: jugador.ayudasUsadas
    };

    if (sesion.estadoJuego === 'pregunta') {
      var p = sesion.preguntas[sesion.indiceActual];
      payload.pregunta = { numero: sesion.indiceActual + 1, nivel: p.nivel, pregunta: p.pregunta, opciones: p.opciones };
      payload.segundosRestantes = Math.max(0, Math.round((sesion.finPreguntaProgramado - Date.now()) / 1000));
      payload.segundosPorPregunta = sesion.segundosPorPregunta;
      payload.yaRespondio = !!jugador.respuestas[sesion.indiceActual];
    } else if (sesion.estadoJuego === 'revelando') {
      var r = jugador.respuestas[sesion.indiceActual];
      payload.respuestaCorrecta = sesion.preguntas[sesion.indiceActual].respuestaCorrecta;
      payload.tuRespuesta = r ? r.opcion : null;
      payload.esCorrecta = r ? r.esCorrecta : false;
      payload.puntosGanados = r ? r.puntosGanados : 0;
      var rankingCompleto = calcularRankingCompleto_(sesion);
      payload.ranking = quitarSessionId_(rankingCompleto.slice(0, 5));
      var posicion = rankingCompleto.findIndex(function (x) { return x.sessionId === sessionId; });
      payload.tuPosicion = posicion === -1 ? null : posicion + 1;
    } else if (sesion.estadoJuego === 'finalizado') {
      var rankingFinal = calcularRankingCompleto_(sesion);
      payload.ranking = quitarSessionId_(rankingFinal);
      var posicionFinal = rankingFinal.findIndex(function (x) { return x.sessionId === sessionId; });
      payload.tuPosicion = posicionFinal === -1 ? null : posicionFinal + 1;
    }

    return payload;
  });
}

function responderPreguntaVivo(sessionId, codigo, opcion) {
  return conSesionVivo_(normalizarCodigoVivo_(codigo), function (sesion) {
    var jugador = obtenerJugadorVivo_(sesion, sessionId);
    avanzarSiCorresponde_(sesion);
    if (sesion.estadoJuego !== 'pregunta') {
      throw new Error('Ya no se puede responder esta pregunta.');
    }
    if (jugador.respuestas[sesion.indiceActual]) {
      throw new Error('Ya respondiste esta pregunta.');
    }

    var pregunta = sesion.preguntas[sesion.indiceActual];
    var esCorrecta = (opcion === pregunta.respuestaCorrecta);
    var segundosTranscurridos = Math.max(0, (Date.now() - sesion.inicioPregunta) / 1000);
    var puntos = esCorrecta ? calcularPuntosVivo_(pregunta.nivel, segundosTranscurridos, sesion.segundosPorPregunta) : 0;

    jugador.respuestas[sesion.indiceActual] = { opcion: opcion, esCorrecta: esCorrecta, puntosGanados: puntos };
    jugador.puntajeTotal += puntos;

    // Si ya respondieron todos los jugadores conectados, no hay que esperar
    // el resto del reloj: se acorta el plazo para revelar casi de inmediato.
    var totalJugadores = Object.keys(sesion.jugadores).length;
    var totalRespuestas = contarRespuestasPregunta_(sesion, sesion.indiceActual);
    if (totalJugadores > 0 && totalRespuestas >= totalJugadores) {
      var finAcelerado = Date.now() + DEMORA_TRAS_ULTIMA_RESPUESTA_MS;
      if (finAcelerado < sesion.finPreguntaProgramado) {
        sesion.finPreguntaProgramado = finAcelerado;
      }
    }

    return { registrada: true };
  });
}

// ---------------------------------------------------------------------
// Ayudas en modo vivo (mismas reglas que el modo individual, ver Code.gs)
// ---------------------------------------------------------------------

function validarAyudaVivo_(sesion, jugador, nombreAyuda) {
  if (sesion.estadoJuego !== 'pregunta') {
    throw new Error('Solo puedes usar ayudas mientras la pregunta está activa.');
  }
  if (!sesion.ayudasActivas || !sesion.ayudasActivas[nombreAyuda]) {
    throw new Error('Esta ayuda no está disponible en este juego.');
  }
  if (jugador.ayudasUsadas[nombreAyuda]) {
    throw new Error('Esa ayuda ya fue utilizada en esta partida.');
  }
}

function usarCincuentaVivo(sessionId, codigo) {
  return conSesionVivo_(normalizarCodigoVivo_(codigo), function (sesion) {
    var jugador = obtenerJugadorVivo_(sesion, sessionId);
    validarAyudaVivo_(sesion, jugador, 'cincuenta');

    jugador.ayudasUsadas.cincuenta = true;
    var correcta = sesion.preguntas[sesion.indiceActual].respuestaCorrecta;
    return { eliminar: calcularEliminacion5050_(correcta) };
  });
}

function usarLlamadaAmigoVivo(sessionId, codigo) {
  return conSesionVivo_(normalizarCodigoVivo_(codigo), function (sesion) {
    var jugador = obtenerJugadorVivo_(sesion, sessionId);
    validarAyudaVivo_(sesion, jugador, 'llamada');

    jugador.ayudasUsadas.llamada = true;
    var pregunta = sesion.preguntas[sesion.indiceActual];
    return calcularRespuestaAmigo_(pregunta.respuestaCorrecta, pregunta.nivel);
  });
}

function usarPreguntaPublicoVivo(sessionId, codigo) {
  return conSesionVivo_(normalizarCodigoVivo_(codigo), function (sesion) {
    var jugador = obtenerJugadorVivo_(sesion, sessionId);
    validarAyudaVivo_(sesion, jugador, 'publico');

    jugador.ayudasUsadas.publico = true;
    var pregunta = sesion.preguntas[sesion.indiceActual];
    return { porcentajes: calcularPorcentajesPublico_(pregunta.respuestaCorrecta, pregunta.nivel) };
  });
}
