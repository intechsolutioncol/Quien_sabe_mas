// Port literal de las funciones puras de reparto de preguntas de Code.js.

export function tomarAleatorias(arr, n) {
  const copia = arr.slice();
  const resultado = [];
  for (let i = 0; i < n && copia.length > 0; i++) {
    const idx = Math.floor(Math.random() * copia.length);
    resultado.push(copia[idx]);
    copia.splice(idx, 1);
  }
  return resultado;
}

// Reparte la cantidad de preguntas entre los 5 niveles de dificultad. El
// resto (cuando no es múltiplo de 5) se reparte empezando por los niveles
// más fáciles, para que cantidades pequeñas no salten directo a lo difícil.
export function distribuirPorNiveles(cantidadPreguntas) {
  const base = Math.floor(cantidadPreguntas / 5);
  const resto = cantidadPreguntas % 5;
  const distribucion = [base, base, base, base, base];
  for (let i = 0; i < resto; i++) {
    distribucion[i]++;
  }
  return distribucion;
}

export function seleccionarPreguntasDeBanco(banco, cantidadPreguntas) {
  const distribucion = distribuirPorNiveles(cantidadPreguntas);
  let seleccionadas = [];
  for (let nivel = 1; nivel <= 5; nivel++) {
    const pool = banco.filter((p) => p.nivel === nivel);
    seleccionadas = seleccionadas.concat(tomarAleatorias(pool, distribucion[nivel - 1]));
  }
  return seleccionadas;
}

export function formatearPreguntaCliente(preguntaObj, indice) {
  return {
    numero: indice + 1,
    nivel: preguntaObj.nivel,
    pregunta: preguntaObj.pregunta,
    opciones: preguntaObj.opciones,
  };
}
