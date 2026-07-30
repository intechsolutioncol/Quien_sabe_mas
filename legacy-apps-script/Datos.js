/**
 * Capa de acceso a datos. Usa una hoja de cálculo interna (auto-provisionada,
 * invisible para el profesor) como base de datos de juegos, preguntas y
 * resultados. El profesor nunca edita esta hoja directamente: solo interactúa
 * con el panel dentro de la Web App y con el archivo CSV de importación.
 */

var NOMBRE_DB = 'QuienSabeMas_BaseDeDatos';
var HOJA_JUEGOS = 'Juegos';
var HOJA_PREGUNTAS = 'Preguntas';
var HOJA_RESULTADOS = 'Resultados';

// Nota: las columnas nuevas siempre se agregan AL FINAL de estos arreglos.
// migrarEncabezados_() completa las columnas que falten en hojas ya
// existentes sin mover ni perder las columnas viejas, para no romper filas
// creadas antes de un cambio de esquema.
var ENCABEZADOS_JUEGOS = ['codigo', 'nombreJuego', 'profesor', 'tematica', 'cantidadPreguntas', 'modo', 'ayudasJson', 'fechaCreacion', 'activo', 'modoTiempo', 'segundosPorPregunta', 'duracionTotalSegundos', 'avanceVivo'];
var ENCABEZADOS_PREGUNTAS = ['codigo', 'nivel', 'pregunta', 'opcionA', 'opcionB', 'opcionC', 'opcionD', 'respuestaCorrecta'];
var ENCABEZADOS_RESULTADOS = ['codigo', 'nombreEstudiante', 'puntaje', 'resultado', 'fecha', 'totalPreguntas'];

// ---------------------------------------------------------------------
// Bootstrap del libro interno
// ---------------------------------------------------------------------

function obtenerHojaDB_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DB_SPREADSHEET_ID');
  var libro = null;

  if (id) {
    try { libro = SpreadsheetApp.openById(id); } catch (e) { libro = null; }
  }
  if (!libro) {
    libro = SpreadsheetApp.create(NOMBRE_DB);
    props.setProperty('DB_SPREADSHEET_ID', libro.getId());
  }

  asegurarHoja_(libro, HOJA_JUEGOS, ENCABEZADOS_JUEGOS);
  asegurarHoja_(libro, HOJA_PREGUNTAS, ENCABEZADOS_PREGUNTAS);
  asegurarHoja_(libro, HOJA_RESULTADOS, ENCABEZADOS_RESULTADOS);
  migrarEncabezados_(libro.getSheetByName(HOJA_JUEGOS), ENCABEZADOS_JUEGOS, null);
  migrarEncabezados_(libro.getSheetByName(HOJA_RESULTADOS), ENCABEZADOS_RESULTADOS, { premio: 'puntaje' });
  eliminarHojaPorDefecto_(libro);
  asegurarJuegoDemo_(libro);

  return libro;
}

function asegurarHoja_(libro, nombre, encabezados) {
  var hoja = libro.getSheetByName(nombre);
  if (!hoja) {
    hoja = libro.insertSheet(nombre);
    hoja.appendRow(encabezados);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

// Adapta hojas creadas con un esquema anterior: renombra encabezados viejos
// (ej. "premio" -> "puntaje") sin mover columnas, y agrega al final las
// columnas nuevas que todavía no existan. Nunca borra ni reordena datos.
function migrarEncabezados_(hoja, encabezadosEsperados, renombres) {
  var ancho = Math.max(hoja.getLastColumn(), 1);
  var encabezadoActual = hoja.getRange(1, 1, 1, ancho).getValues()[0];

  if (renombres) {
    Object.keys(renombres).forEach(function (viejo) {
      var idx = encabezadoActual.indexOf(viejo);
      if (idx !== -1) {
        encabezadoActual[idx] = renombres[viejo];
        hoja.getRange(1, idx + 1).setValue(renombres[viejo]);
      }
    });
  }

  var faltantes = encabezadosEsperados.filter(function (col) { return encabezadoActual.indexOf(col) === -1; });
  if (faltantes.length) {
    hoja.getRange(1, encabezadoActual.length + 1, 1, faltantes.length).setValues([faltantes]);
  }
}

function eliminarHojaPorDefecto_(libro) {
  ['Hoja 1', 'Sheet1'].forEach(function (nombre) {
    var hoja = libro.getSheetByName(nombre);
    if (hoja && libro.getSheets().length > 3) {
      try { libro.deleteSheet(hoja); } catch (e) { /* noop */ }
    }
  });
}

// Siembra un juego de demostración con el banco de cultura general original
// la primera vez que se usa el sistema, para que haya algo listo para probar.
function asegurarJuegoDemo_(libro) {
  var hojaJuegos = libro.getSheetByName(HOJA_JUEGOS);
  if (hojaJuegos.getLastRow() > 1) return;

  var codigoDemo = 'DEMO01';
  hojaJuegos.appendRow([
    codigoDemo, 'Cultura General (demo)', 'Sistema', 'Cultura general - Grado Décimo',
    15, 'individual', JSON.stringify({ cincuenta: true, llamada: true, publico: true }),
    new Date().toISOString(), true,
    'porPregunta', 45, 600, 'automatico'
  ]);

  var hojaPreguntas = libro.getSheetByName(HOJA_PREGUNTAS);
  var filas = PREGUNTAS.map(function (p) {
    return [codigoDemo, p.nivel, p.pregunta, p.opciones.A, p.opciones.B, p.opciones.C, p.opciones.D, p.respuestaCorrecta];
  });
  hojaPreguntas.getRange(hojaPreguntas.getLastRow() + 1, 1, filas.length, ENCABEZADOS_PREGUNTAS.length).setValues(filas);
}

function obtenerHoja_(nombre) {
  return obtenerHojaDB_().getSheetByName(nombre);
}

function filasComoObjetos_(hoja) {
  var valores = hoja.getDataRange().getValues();
  if (valores.length < 2) return [];
  var encabezados = valores[0];
  return valores.slice(1)
    .filter(function (fila) { return fila[0] !== ''; })
    .map(function (fila) {
      var obj = {};
      encabezados.forEach(function (encabezado, i) { obj[encabezado] = fila[i]; });
      return obj;
    });
}

// ---------------------------------------------------------------------
// Juegos
// ---------------------------------------------------------------------

function generarCodigoJuego_() {
  var alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I/L para evitar confusiones al dictar el código
  var existentes = {};
  filasComoObjetos_(obtenerHoja_(HOJA_JUEGOS)).forEach(function (j) { existentes[j.codigo] = true; });

  var codigo;
  do {
    codigo = '';
    for (var i = 0; i < 6; i++) {
      codigo += alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
    }
  } while (existentes[codigo]);
  return codigo;
}

function guardarJuego_(juego) {
  obtenerHoja_(HOJA_JUEGOS).appendRow([
    juego.codigo, juego.nombreJuego, juego.profesor, juego.tematica,
    juego.cantidadPreguntas, juego.modo, JSON.stringify(juego.ayudas),
    juego.fechaCreacion, juego.activo,
    juego.modoTiempo, juego.segundosPorPregunta, juego.duracionTotalSegundos,
    juego.avanceVivo
  ]);
}

function mapearFilaJuego_(obj) {
  return {
    codigo: obj.codigo,
    nombreJuego: obj.nombreJuego,
    profesor: obj.profesor,
    tematica: obj.tematica,
    cantidadPreguntas: Number(obj.cantidadPreguntas),
    modo: obj.modo,
    ayudas: JSON.parse(obj.ayudasJson || '{}'),
    modoTiempo: obj.modoTiempo || 'porPregunta',
    segundosPorPregunta: obj.segundosPorPregunta ? Number(obj.segundosPorPregunta) : 45,
    duracionTotalSegundos: obj.duracionTotalSegundos ? Number(obj.duracionTotalSegundos) : 600,
    avanceVivo: obj.avanceVivo || 'automatico',
    fechaCreacion: obj.fechaCreacion,
    activo: (obj.activo === true || obj.activo === 'TRUE' || obj.activo === 'true')
  };
}

function listarJuegos_() {
  return filasComoObjetos_(obtenerHoja_(HOJA_JUEGOS)).map(mapearFilaJuego_).reverse();
}

function obtenerJuegoPorCodigo_(codigo) {
  var coincidencias = listarJuegos_().filter(function (j) { return j.codigo === codigo; });
  return coincidencias.length ? coincidencias[0] : null;
}

// Actualiza una o varias columnas (por nombre de encabezado) de la fila cuyo
// código coincida. Lee el encabezado real de la hoja en vez de asumir un
// orden fijo, para seguir funcionando aunque la hoja venga de un esquema
// migrado. Devuelve false si no encontró el código.
function actualizarFilaPorCodigo_(nombreHoja, codigo, cambios) {
  var hoja = obtenerHoja_(nombreHoja);
  var valores = hoja.getDataRange().getValues();
  if (valores.length < 2) return false;
  var encabezados = valores[0];

  for (var fila = 1; fila < valores.length; fila++) {
    if (valores[fila][0] === codigo) {
      Object.keys(cambios).forEach(function (campo) {
        var col = encabezados.indexOf(campo);
        if (col !== -1) {
          hoja.getRange(fila + 1, col + 1).setValue(cambios[campo]);
        }
      });
      return true;
    }
  }
  return false;
}

function actualizarEstadoJuego_(codigo, activo) {
  return actualizarFilaPorCodigo_(HOJA_JUEGOS, codigo, { activo: activo });
}

function actualizarJuego_(codigo, juego) {
  return actualizarFilaPorCodigo_(HOJA_JUEGOS, codigo, {
    nombreJuego: juego.nombreJuego,
    profesor: juego.profesor,
    tematica: juego.tematica,
    cantidadPreguntas: juego.cantidadPreguntas,
    modo: juego.modo,
    ayudasJson: JSON.stringify(juego.ayudas),
    modoTiempo: juego.modoTiempo,
    segundosPorPregunta: juego.segundosPorPregunta,
    duracionTotalSegundos: juego.duracionTotalSegundos,
    avanceVivo: juego.avanceVivo
  });
}

// ---------------------------------------------------------------------
// Preguntas
// ---------------------------------------------------------------------

function guardarPreguntasJuego_(codigo, preguntas) {
  var hoja = obtenerHoja_(HOJA_PREGUNTAS);
  var valores = hoja.getDataRange().getValues();
  for (var fila = valores.length; fila >= 2; fila--) {
    if (valores[fila - 1][0] === codigo) hoja.deleteRow(fila);
  }
  if (!preguntas.length) return;
  var filasNuevas = preguntas.map(function (p) {
    return [codigo, p.nivel, p.pregunta, p.opcionA, p.opcionB, p.opcionC, p.opcionD, p.respuestaCorrecta];
  });
  hoja.getRange(hoja.getLastRow() + 1, 1, filasNuevas.length, ENCABEZADOS_PREGUNTAS.length).setValues(filasNuevas);
}

function obtenerPreguntasJuego_(codigo) {
  return filasComoObjetos_(obtenerHoja_(HOJA_PREGUNTAS))
    .filter(function (p) { return p.codigo === codigo; })
    .map(function (p) {
      return {
        nivel: Number(p.nivel),
        pregunta: p.pregunta,
        opciones: { A: p.opcionA, B: p.opcionB, C: p.opcionC, D: p.opcionD },
        respuestaCorrecta: p.respuestaCorrecta
      };
    });
}

function contarPreguntasJuego_(codigo) {
  return obtenerPreguntasJuego_(codigo).length;
}

// ---------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------

function guardarResultado_(codigo, nombreEstudiante, puntaje, totalPreguntas, resultado) {
  obtenerHoja_(HOJA_RESULTADOS).appendRow([
    codigo, nombreEstudiante, puntaje, resultado, new Date().toISOString(), totalPreguntas
  ]);
}

function obtenerResultadosJuego_(codigo) {
  return filasComoObjetos_(obtenerHoja_(HOJA_RESULTADOS))
    .filter(function (r) { return r.codigo === codigo; })
    .map(function (r) {
      return {
        nombreEstudiante: r.nombreEstudiante,
        puntaje: Number(r.puntaje || 0),
        totalPreguntas: Number(r.totalPreguntas || 0),
        resultado: r.resultado,
        fecha: r.fecha
      };
    })
    .reverse();
}
