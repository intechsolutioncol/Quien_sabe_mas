// Prueba unitaria (sin servidor) de rebalancearDistribucionRespuestas:
// simula el bug real (la IA puso la correcta en "A" en las 20 preguntas)
// y confirma que después del rebalanceo la distribución queda pareja,
// sin perder ni mezclar el contenido de ninguna opción.
// (lib/juego/*.js usa `export`, por eso se carga con import() dinámico
// en vez de require, aunque este script en sí es CommonJS.)

function assert(cond, mensaje) {
  if (!cond) throw new Error('FALLÓ: ' + mensaje);
  console.log('OK:', mensaje);
}

(async () => {
  const { rebalancearDistribucionRespuestas } = await import('../lib/juego/rebalanceo.js');

  const N = 20;
  const preguntasSesgadas = Array.from({ length: N }, (_, i) => ({
    nivel: (i % 5) + 1,
    pregunta: `¿Pregunta número ${i + 1}?`,
    opcion_a: `Correcta ${i + 1}`,
    opcion_b: `Distractor B ${i + 1}`,
    opcion_c: `Distractor C ${i + 1}`,
    opcion_d: `Distractor D ${i + 1}`,
    respuesta_correcta: 'A', // el bug real: siempre "A"
  }));

  const resultado = rebalancearDistribucionRespuestas(preguntasSesgadas);

  assert(resultado.length === N, 'conserva la cantidad de preguntas');

  const conteo = { A: 0, B: 0, C: 0, D: 0 };
  resultado.forEach((p) => conteo[p.respuesta_correcta]++);
  console.log('Distribución tras rebalancear:', conteo);

  ['A', 'B', 'C', 'D'].forEach((letra) => {
    assert(conteo[letra] === N / 4, `la letra ${letra} quedó con exactamente ${N / 4} preguntas (N/4, reparto perfecto para N=20)`);
  });

  // El conjunto de textos de opciones de cada pregunta no debe cambiar, y
  // el texto que era "la correcta" debe seguir marcado como correcto en
  // su nueva letra (no se pierde ni se cruza con otra pregunta).
  resultado.forEach((p, i) => {
    const original = preguntasSesgadas[i];
    const textosOriginales = [original.opcion_a, original.opcion_b, original.opcion_c, original.opcion_d].sort();
    const textosNuevos = [p.opcion_a, p.opcion_b, p.opcion_c, p.opcion_d].sort();
    assert(JSON.stringify(textosOriginales) === JSON.stringify(textosNuevos), `pregunta ${i + 1}: mismo conjunto de 4 opciones, solo reordenadas`);

    const textoCorrectoOriginal = original.opcion_a; // era la "A" siempre
    const textoEnNuevaLetra = p[`opcion_${p.respuesta_correcta.toLowerCase()}`];
    assert(textoEnNuevaLetra === textoCorrectoOriginal, `pregunta ${i + 1}: el texto que era correcto sigue siendo el marcado como correcto`);
  });

  // Con solo 3 preguntas (no divisible entre 4), el reparto debe seguir
  // siendo lo más parejo posible: ninguna letra debe repetirse.
  const preguntasImpares = Array.from({ length: 3 }, (_, i) => ({
    nivel: 1,
    pregunta: `¿Pregunta ${i}?`,
    opcion_a: 'X', opcion_b: 'Y', opcion_c: 'Z', opcion_d: 'W',
    respuesta_correcta: 'A',
  }));
  const resultadoImpar = rebalancearDistribucionRespuestas(preguntasImpares);
  const letrasUsadas = resultadoImpar.map((p) => p.respuesta_correcta);
  const sinRepetidos = new Set(letrasUsadas).size === letrasUsadas.length;
  assert(sinRepetidos, 'con 3 preguntas, las 3 quedan en letras distintas (ninguna se repite)');

  console.log('\n✅ Rebalanceo de respuestas de la IA verificado sin errores.');
})().catch((err) => {
  console.error('\n❌', err.message);
  process.exitCode = 1;
});
