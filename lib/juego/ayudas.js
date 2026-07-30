// Port literal de las 3 ayudas clásicas (funciones puras) de Code.js.
// Las usa tanto el modo individual como el modo en vivo.

export function calcularEliminacion5050(respuestaCorrecta) {
  const opciones = ['A', 'B', 'C', 'D'];
  const incorrectas = opciones.filter((o) => o !== respuestaCorrecta);
  const mantener = incorrectas[Math.floor(Math.random() * incorrectas.length)];
  return opciones.filter((o) => o !== respuestaCorrecta && o !== mantener);
}

export function calcularRespuestaAmigo(respuestaCorrecta, nivel) {
  const probabilidadPorNivel = { 1: 0.95, 2: 0.85, 3: 0.7, 4: 0.55, 5: 0.4 };
  const probabilidadAcierto = probabilidadPorNivel[nivel] || 0.6;
  const acierta = Math.random() < probabilidadAcierto;

  let respuestaAmigo;
  if (acierta) {
    respuestaAmigo = respuestaCorrecta;
  } else {
    const incorrectas = ['A', 'B', 'C', 'D'].filter((o) => o !== respuestaCorrecta);
    respuestaAmigo = incorrectas[Math.floor(Math.random() * incorrectas.length)];
  }
  const confianza = acierta
    ? 60 + Math.floor(Math.random() * 35)
    : 30 + Math.floor(Math.random() * 40);

  return { respuestaSugerida: respuestaAmigo, confianza };
}

export function calcularPorcentajesPublico(respuestaCorrecta, nivel) {
  const pesoBasePorNivel = { 1: 70, 2: 60, 3: 50, 4: 42, 5: 35 };
  const opciones = ['A', 'B', 'C', 'D'];
  const otras = opciones.filter((o) => o !== respuestaCorrecta);

  const porcentajes = {};
  porcentajes[respuestaCorrecta] = (pesoBasePorNivel[nivel] || 50) + Math.floor(Math.random() * 15);
  let restante = 100 - porcentajes[respuestaCorrecta];

  otras.forEach((letra, i) => {
    if (i === otras.length - 1) {
      porcentajes[letra] = Math.max(0, restante);
    } else {
      const maximoPosible = restante - (otras.length - 1 - i);
      const valor = Math.floor(Math.random() * Math.max(1, maximoPosible + 1));
      porcentajes[letra] = valor;
      restante -= valor;
    }
  });

  return porcentajes;
}

// Puntaje estilo concurso para el modo en vivo: acertar rápido da más
// puntos que acertar al límite del tiempo; las preguntas más difíciles
// valen más de entrada.
const PUNTOS_BASE_POR_NIVEL_VIVO = { 1: 500, 2: 750, 3: 1000, 4: 1250, 5: 1500 };

export function calcularPuntosVivo(nivel, segundosTranscurridos, segundosLimite) {
  const base = PUNTOS_BASE_POR_NIVEL_VIVO[nivel] || 1000;
  const fraccionRestante = Math.max(0, Math.min(1, 1 - segundosTranscurridos / segundosLimite));
  const factor = 0.5 + fraccionRestante * 0.5; // entre 0.5 (al límite) y 1.0 (respuesta instantánea)
  return Math.round(base * factor);
}
