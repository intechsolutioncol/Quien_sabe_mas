'use client';

/**
 * Motor de sonido 100% generado con Web Audio API (sin archivos externos,
 * sin audio protegido por derechos de autor). Port literal de
 * legacy-apps-script/sound.html: crea un ambiente de tensión durante la
 * pregunta, un "redoble" de suspenso al responder y stings de
 * acierto/error, inspirados en el formato clásico pero con sonidos propios.
 */
let ctx = null;
let maestro = null;
let bufferRuido = null;
let silenciado = typeof window !== 'undefined' && window.localStorage.getItem('qsm-silenciado') === '1';

let fondo = null; // { osciladores[], lfo, gainLfo, filtro, gainDrone, tension, timeoutPulso, activo }

function obtenerContexto() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    maestro = ctx.createGain();
    maestro.gain.value = silenciado ? 0 : 0.55;
    maestro.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function obtenerRuido() {
  const c = obtenerContexto();
  if (!bufferRuido) {
    const duracion = 0.3;
    const frames = Math.floor(c.sampleRate * duracion);
    bufferRuido = c.createBuffer(1, frames, c.sampleRate);
    const datos = bufferRuido.getChannelData(0);
    for (let i = 0; i < frames; i++) datos[i] = Math.random() * 2 - 1;
  }
  return bufferRuido;
}

function tono(frecuencia, inicio, duracion, tipo, volumenPico, pendiente) {
  const c = obtenerContexto();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = tipo || 'sine';
  const t0 = c.currentTime + inicio;
  osc.frequency.setValueAtTime(frecuencia, t0);
  if (pendiente) osc.frequency.exponentialRampToValueAtTime(Math.max(1, pendiente), t0 + duracion);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volumenPico || 0.3, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
  osc.connect(gain);
  gain.connect(maestro);
  osc.start(t0);
  osc.stop(t0 + duracion + 0.05);
}

function tick(inicio, volumenPico, frecuenciaFiltro) {
  const c = obtenerContexto();
  const fuente = c.createBufferSource();
  fuente.buffer = obtenerRuido();
  const filtro = c.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.frequency.value = frecuenciaFiltro || 1800;
  filtro.Q.value = 1.1;
  const gain = c.createGain();
  const t0 = c.currentTime + inicio;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volumenPico || 0.25, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
  fuente.connect(filtro);
  filtro.connect(gain);
  gain.connect(maestro);
  fuente.start(t0);
  fuente.stop(t0 + 0.12);

  tono(85, inicio, 0.14, 'sine', (volumenPico || 0.25) * 0.9);
}

function limpiarFondo() {
  if (!fondo) return;
  if (fondo.timeoutPulso) clearTimeout(fondo.timeoutPulso);
  const c = ctx;
  if (c) {
    const ahora = c.currentTime;
    try {
      fondo.gainDrone.gain.cancelScheduledValues(ahora);
      fondo.gainDrone.gain.setTargetAtTime(0.0001, ahora, 0.15);
    } catch {
      /* noop */
    }
    fondo.osciladores.forEach((osc) => {
      try {
        osc.stop(ahora + 0.4);
      } catch {
        /* noop */
      }
    });
    if (fondo.lfo) {
      try {
        fondo.lfo.stop(ahora + 0.4);
      } catch {
        /* noop */
      }
    }
  }
  fondo.activo = false;
  fondo = null;
}

export const Sonido = {
  activar() {
    obtenerContexto();
  },

  estaSilenciado() {
    return silenciado;
  },

  alternarSilencio() {
    silenciado = !silenciado;
    window.localStorage.setItem('qsm-silenciado', silenciado ? '1' : '0');
    if (maestro && ctx) maestro.gain.setTargetAtTime(silenciado ? 0 : 0.55, ctx.currentTime, 0.05);
    return silenciado;
  },

  iniciarSuspenso() {
    const c = obtenerContexto();
    limpiarFondo();

    const osc1 = c.createOscillator();
    const osc2 = c.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 82;
    osc2.type = 'sine';
    osc2.frequency.value = 84.5;

    const filtro = c.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 300;

    const gainDrone = c.createGain();
    gainDrone.gain.value = 0.0001;
    gainDrone.gain.setTargetAtTime(0.07, c.currentTime, 0.6);

    const lfo = c.createOscillator();
    const gainLfo = c.createGain();
    lfo.frequency.value = 0.15;
    gainLfo.gain.value = 0.03;
    lfo.connect(gainLfo);
    gainLfo.connect(gainDrone.gain);

    osc1.connect(filtro);
    osc2.connect(filtro);
    filtro.connect(gainDrone);
    gainDrone.connect(maestro);

    osc1.start();
    osc2.start();
    lfo.start();

    fondo = {
      osciladores: [osc1, osc2],
      lfo,
      gainLfo,
      filtro,
      gainDrone,
      tension: 0,
      timeoutPulso: null,
      activo: true,
    };

    function programarPulso() {
      if (!fondo || !fondo.activo) return;
      const intervaloMs = 850 - fondo.tension * 550;
      const volumen = 0.12 + fondo.tension * 0.18;
      const frecFiltro = 1500 + fondo.tension * 900;
      tick(0, volumen, frecFiltro);
      fondo.timeoutPulso = setTimeout(programarPulso, Math.max(180, intervaloMs));
    }
    programarPulso();
  },

  actualizarTension(fraccion) {
    if (fondo) fondo.tension = Math.max(0, Math.min(1, fraccion));
  },

  detenerSuspenso() {
    limpiarFondo();
  },

  redobleRespuesta() {
    obtenerContexto();
    const pasos = 10;
    for (let i = 0; i < pasos; i++) {
      const progreso = i / pasos;
      const inicio = progreso * progreso * 1.1;
      tick(inicio, 0.18 + progreso * 0.12, 2000 + progreso * 1500);
    }
    tono(140, 1.15, 0.25, 'sawtooth', 0.22, 60);
  },

  correcto() {
    obtenerContexto();
    [523.25, 659.25, 783.99, 1046.5].forEach((frecuencia, i) => {
      tono(frecuencia, i * 0.11, 0.35, 'triangle', 0.28);
    });
  },

  incorrecto() {
    obtenerContexto();
    tono(320, 0, 0.7, 'sawtooth', 0.26, 70);
  },

  finalGanador() {
    obtenerContexto();
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((frecuencia, i) => {
      tono(frecuencia, i * 0.14, 0.5, 'triangle', 0.3);
    });
  },

  retirada() {
    obtenerContexto();
    tono(659.25, 0, 0.3, 'triangle', 0.25);
    tono(880, 0.12, 0.4, 'triangle', 0.25);
  },
};
