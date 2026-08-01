const LETRAS = ['A', 'B', 'C', 'D'];

function mezclar(array) {
  const copia = array.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// La IA a veces concentra la respuesta correcta en una sola letra (bug
// real observado: una tanda completa salió con la correcta en "A"). En
// vez de detectar el sesgo y descartar el lote, se reparte la respuesta
// correcta lo más parejo posible entre A/B/C/D (en orden aleatorio, no
// A,B,C,D repetido) y se reubican las opciones de cada pregunta para que
// la correcta quede en su nueva letra. Recibe/devuelve preguntas en la
// misma forma snake_case que se guarda en la base de datos
// (opcion_a..d, respuesta_correcta).
export function rebalancearDistribucionRespuestas(preguntas) {
  const objetivoPorIndice = mezclar(preguntas.map((_, i) => LETRAS[i % 4]));

  return preguntas.map((p, i) => {
    const opciones = { A: p.opcion_a, B: p.opcion_b, C: p.opcion_c, D: p.opcion_d };
    const textoCorrecta = opciones[p.respuesta_correcta];
    const distractores = mezclar(LETRAS.filter((l) => l !== p.respuesta_correcta).map((l) => opciones[l]));

    const nuevaLetraCorrecta = objetivoPorIndice[i];
    const nuevasOpciones = {};
    let siguienteDistractor = 0;
    LETRAS.forEach((letra) => {
      nuevasOpciones[letra] = letra === nuevaLetraCorrecta ? textoCorrecta : distractores[siguienteDistractor++];
    });

    return {
      ...p,
      opcion_a: nuevasOpciones.A,
      opcion_b: nuevasOpciones.B,
      opcion_c: nuevasOpciones.C,
      opcion_d: nuevasOpciones.D,
      respuesta_correcta: nuevaLetraCorrecta,
    };
  });
}
