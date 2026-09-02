'use client';

import { useEffect, useRef, useState } from 'react';
import { Sonido } from '@/lib/sonido';
import { llamarApi } from '@/lib/api-cliente';
import Escalera from './Escalera';
import ModalLlamada from './ModalLlamada';
import ModalPublico from './ModalPublico';

const ESPERA_MINIMA_SUSPENSO_MS = 1400;
const AYUDAS_POR_DEFECTO = { cincuenta: true, llamada: true, publico: true };

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Port de la pantalla de juego (modo individual) de script.html: temporizador,
// respuesta, ayudas y escalera de progreso.
export default function PantallaJuego({ datos, onTerminar }) {
  const ayudasActivas = datos.ayudasActivas || AYUDAS_POR_DEFECTO;

  const [pregunta, setPregunta] = useState(datos.pregunta);
  const [escalones, setEscalones] = useState(() =>
    Array.from({ length: datos.totalPreguntas }, (_, i) => ({ numero: i + 1, estado: i === 0 ? 'actual' : 'pendiente' }))
  );
  const [ayudasUsadas, setAyudasUsadas] = useState({ cincuenta: false, llamada: false, publico: false });
  const [eliminadas, setEliminadas] = useState([]);
  const [resultadoVisual, setResultadoVisual] = useState(null); // { elegida, correcta, esCorrecta }
  const [respondiendo, setRespondiendoState] = useState(false);
  const segundosIniciales = datos.modoTiempo === 'total' ? datos.duracionTotalSegundos : datos.segundosPorPregunta;
  const [segundosRestantes, setSegundosRestantes] = useState(segundosIniciales);
  const [segundosTotalBarra, setSegundosTotalBarra] = useState(segundosIniciales);
  const [modalLlamada, setModalLlamada] = useState(null);
  const [modalPublico, setModalPublico] = useState(null);
  const [silenciado, setSilenciado] = useState(false);

  const respondiendoRef = useRef(false);
  const tiempoAgotadoRef = useRef(false);
  const restantesRef = useRef(segundosIniciales);
  const temporizadorIdRef = useRef(null);

  function setRespondiendo(valor) {
    respondiendoRef.current = valor;
    setRespondiendoState(valor);
  }

  useEffect(() => {
    setSilenciado(Sonido.estaSilenciado());
  }, []);

  function alternarSilencio() {
    Sonido.activar();
    setSilenciado(Sonido.alternarSilencio());
  }

  function detenerTemporizador() {
    if (temporizadorIdRef.current) {
      clearInterval(temporizadorIdRef.current);
      temporizadorIdRef.current = null;
    }
    Sonido.detenerSuspenso();
  }

  async function finalizarPorTiempoAgotado() {
    detenerTemporizador();
    try {
      const resultado = await llamarApi('/api/partidas/finalizar-tiempo', {
        method: 'POST',
        body: JSON.stringify({ sessionId: datos.sessionId }),
      });
      onTerminar({
        motivo: 'tiempo',
        puntaje: resultado.puntajeFinal,
        total: resultado.totalPreguntas,
        respondidas: resultado.preguntasRespondidas,
      });
    } catch {
      onTerminar({ motivo: 'tiempo', puntaje: 0, total: datos.totalPreguntas, respondidas: 0 });
    }
  }

  function iniciarTemporizadorPorPregunta() {
    detenerTemporizador();
    restantesRef.current = datos.segundosPorPregunta;
    setSegundosRestantes(datos.segundosPorPregunta);
    setSegundosTotalBarra(datos.segundosPorPregunta);
    Sonido.iniciarSuspenso();
    temporizadorIdRef.current = setInterval(() => {
      restantesRef.current -= 1;
      setSegundosRestantes(restantesRef.current);
      Sonido.actualizarTension(1 - Math.max(0, restantesRef.current) / datos.segundosPorPregunta);
      if (restantesRef.current <= 0) {
        detenerTemporizador();
        if (!respondiendoRef.current) seleccionarOpcion(null);
      }
    }, 1000);
  }

  // El reloj de "tiempo total" arranca una sola vez (primera pregunta) y
  // sigue de fondo entre preguntas, sin reiniciarse.
  function iniciarTemporizadorTotal() {
    if (temporizadorIdRef.current) return;
    restantesRef.current = datos.duracionTotalSegundos;
    setSegundosRestantes(datos.duracionTotalSegundos);
    setSegundosTotalBarra(datos.duracionTotalSegundos);
    Sonido.iniciarSuspenso();
    temporizadorIdRef.current = setInterval(() => {
      restantesRef.current -= 1;
      setSegundosRestantes(restantesRef.current);
      Sonido.actualizarTension(1 - Math.max(0, restantesRef.current) / datos.duracionTotalSegundos);
      if (restantesRef.current <= 0) {
        clearInterval(temporizadorIdRef.current);
        temporizadorIdRef.current = null;
        Sonido.detenerSuspenso();
        tiempoAgotadoRef.current = true;
        if (!respondiendoRef.current) finalizarPorTiempoAgotado();
      }
    }, 1000);
  }

  function iniciarTemporizador() {
    if (datos.modoTiempo === 'total') iniciarTemporizadorTotal();
    else iniciarTemporizadorPorPregunta();
  }

  useEffect(() => {
    iniciarTemporizador();
    return () => detenerTemporizador();
    // Arranca una sola vez al montar la pantalla de juego.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function marcarEscalon(numero, esCorrecta) {
    setEscalones((prev) => prev.map((e) => (e.numero === numero ? { ...e, estado: esCorrecta ? 'correcta' : 'incorrecta' } : e)));
  }

  function resaltarEscalonActual(numero) {
    setEscalones((prev) =>
      prev.map((e) => ({ ...e, estado: e.numero === numero ? 'actual' : e.estado === 'actual' ? 'pendiente' : e.estado }))
    );
  }

  function mostrarPregunta(nueva) {
    setPregunta(nueva);
    setResultadoVisual(null);
    setEliminadas([]);
    setRespondiendo(false);
    resaltarEscalonActual(nueva.numero);
    iniciarTemporizador();
  }

  async function seleccionarOpcion(letra) {
    if (respondiendoRef.current) return;
    setRespondiendo(true);
    if (datos.modoTiempo !== 'total') detenerTemporizador();
    Sonido.redobleRespuesta();
    const inicioRedoble = Date.now();

    let resultado;
    try {
      resultado = await llamarApi('/api/partidas/responder', {
        method: 'POST',
        body: JSON.stringify({ sessionId: datos.sessionId, opcionSeleccionada: letra }),
      });
    } catch (err) {
      alert(`Ocurrió un error: ${err.message}`);
      setRespondiendo(false);
      return;
    }

    await esperar(Math.max(0, ESPERA_MINIMA_SUSPENSO_MS - (Date.now() - inicioRedoble)));

    setResultadoVisual({ elegida: letra, correcta: resultado.respuestaCorrecta, esCorrecta: resultado.esCorrecta });
    if (resultado.esCorrecta) Sonido.correcto();
    else Sonido.incorrecto();
    marcarEscalon(resultado.numero, resultado.esCorrecta);

    await esperar(2000);

    if (tiempoAgotadoRef.current) {
      finalizarPorTiempoAgotado();
    } else if (resultado.juegoTerminado) {
      onTerminar({
        motivo: resultado.motivo,
        puntaje: resultado.puntajeFinal,
        total: resultado.totalPreguntas,
        respondidas: resultado.preguntasRespondidas,
      });
    } else {
      mostrarPregunta(resultado.siguientePregunta);
    }
  }

  async function usarAyuda(nombre) {
    if (respondiendoRef.current || ayudasUsadas[nombre]) return;
    setAyudasUsadas((prev) => ({ ...prev, [nombre]: true }));

    if (nombre === 'cincuenta') {
      try {
        const resultado = await llamarApi('/api/partidas/ayudas/cincuenta', {
          method: 'POST',
          body: JSON.stringify({ sessionId: datos.sessionId }),
        });
        setEliminadas(resultado.eliminar);
      } catch (err) {
        alert(`No se pudo usar la ayuda: ${err.message}`);
      }
      return;
    }

    if (nombre === 'llamada') {
      setModalLlamada({ segundos: 30, texto: '' });
      let segundos = 30;
      const intervalo = setInterval(() => {
        segundos -= 1;
        setModalLlamada((prev) => (prev ? { ...prev, segundos: Math.max(0, segundos) } : prev));
        if (segundos <= 0) clearInterval(intervalo);
      }, 1000);

      try {
        const resultado = await llamarApi('/api/partidas/ayudas/llamada', {
          method: 'POST',
          body: JSON.stringify({ sessionId: datos.sessionId }),
        });
        setTimeout(() => {
          clearInterval(intervalo);
          setModalLlamada({
            segundos: 0,
            texto: `Tu amigo dice: "Yo creo que la respuesta es la ${resultado.respuestaSugerida}... tengo un ${resultado.confianza}% de seguridad."`,
          });
        }, 3000);
      } catch (err) {
        clearInterval(intervalo);
        setModalLlamada(null);
        alert(`No se pudo usar la ayuda: ${err.message}`);
      }
      return;
    }

    if (nombre === 'publico') {
      try {
        const resultado = await llamarApi('/api/partidas/ayudas/publico', {
          method: 'POST',
          body: JSON.stringify({ sessionId: datos.sessionId }),
        });
        setModalPublico(resultado.porcentajes);
      } catch (err) {
        alert(`No se pudo usar la ayuda: ${err.message}`);
      }
    }
  }

  async function retirarse() {
    if (respondiendoRef.current) return;
    if (!confirm('¿Seguro que quieres terminar la partida ahora y ver tu puntaje?')) return;
    detenerTemporizador();
    try {
      const resultado = await llamarApi('/api/partidas/terminar', {
        method: 'POST',
        body: JSON.stringify({ sessionId: datos.sessionId }),
      });
      Sonido.retirada();
      onTerminar({
        motivo: 'retirado',
        puntaje: resultado.puntajeFinal,
        total: resultado.totalPreguntas,
        respondidas: resultado.preguntasRespondidas,
      });
    } catch (err) {
      alert(`Ocurrió un error: ${err.message}`);
    }
  }

  function claseBoton(letra) {
    if (eliminadas.includes(letra)) return 'boton-opcion eliminada';
    if (resultadoVisual) {
      if (letra === resultadoVisual.correcta) return 'boton-opcion correcta';
      if (letra === resultadoVisual.elegida && !resultadoVisual.esCorrecta) return 'boton-opcion incorrecta';
    }
    return 'boton-opcion';
  }

  const porcentajeBarra = Math.max(0, (segundosRestantes / segundosTotalBarra) * 100);
  const enAlerta = segundosRestantes <= Math.min(10, segundosTotalBarra * 0.2);

  return (
    <section className="pantalla activa">
      <div className="layout-juego">
        <Escalera escalones={escalones} />
        <main className="zona-juego">
          <header className="cabecera-juego">
            <span className="jugador-nombre">{datos.nombreJugador}</span>
            <div className="temporizador-contenedor">
              <div className={`temporizador-barra ${enAlerta ? 'alerta' : ''}`} style={{ width: `${porcentajeBarra}%` }} />
            </div>
            <span className="numero-pregunta">
              Pregunta {pregunta.numero} de {datos.totalPreguntas}
            </span>
            <button className={`boton-silencio ${silenciado ? 'silenciado' : ''}`} onClick={alternarSilencio} title="Silenciar/activar sonido">
              {silenciado ? '🔇' : '🔊'}
            </button>
          </header>
          <p className="etiqueta-juego-actual">
            {datos.nombreJuego}
            {datos.tematica ? ` · ${datos.tematica}` : ''}
          </p>

          <div className="caja-pregunta">
            <p className="texto-pregunta">{pregunta.pregunta}</p>
          </div>

          <div className="grid-opciones">
            {['A', 'B', 'C', 'D'].map((letra) => (
              <button
                key={letra}
                type="button"
                className={claseBoton(letra)}
                disabled={respondiendo}
                onClick={() => seleccionarOpcion(letra)}
              >
                <span className="opcion-letra">{letra}</span>
                <span className="opcion-texto">{pregunta.opciones[letra]}</span>
              </button>
            ))}
          </div>

          <div className="barra-inferior">
            <div className="ayudas">
              {ayudasActivas.cincuenta && (
                <button
                  className="icono-ayuda"
                  disabled={ayudasUsadas.cincuenta || respondiendo}
                  onClick={() => usarAyuda('cincuenta')}
                  title="50/50"
                >
                  <span className="icono-forma">50:50</span>
                </button>
              )}
              {ayudasActivas.llamada && (
                <button
                  className="icono-ayuda"
                  disabled={ayudasUsadas.llamada || respondiendo}
                  onClick={() => usarAyuda('llamada')}
                  title="Llamada a un amigo"
                >
                  <span className="icono-forma">📞</span>
                </button>
              )}
              {ayudasActivas.publico && (
                <button
                  className="icono-ayuda"
                  disabled={ayudasUsadas.publico || respondiendo}
                  onClick={() => usarAyuda('publico')}
                  title="Pregunta al público"
                >
                  <span className="icono-forma">📊</span>
                </button>
              )}
            </div>
            <button className="boton-retirarse" disabled={respondiendo} onClick={retirarse}>
              Terminar y ver mi puntaje
            </button>
          </div>
        </main>
      </div>

      {modalLlamada && (
        <ModalLlamada segundos={modalLlamada.segundos} texto={modalLlamada.texto} onCerrar={() => setModalLlamada(null)} />
      )}
      {modalPublico && <ModalPublico porcentajes={modalPublico} onCerrar={() => setModalPublico(null)} />}
    </section>
  );
}
