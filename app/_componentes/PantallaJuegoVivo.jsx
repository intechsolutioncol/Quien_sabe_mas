'use client';

import { useEffect, useRef, useState } from 'react';
import { Sonido } from '@/lib/sonido';
import { llamarApi } from '@/lib/api-cliente';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { mapearSesionVivoPublica } from '@/lib/juego/vivo-datos';
import Escalera from './Escalera';
import ModalLlamada from './ModalLlamada';
import ModalPublico from './ModalPublico';

const AYUDAS_POR_DEFECTO = { cincuenta: true, llamada: true, publico: true };

// Pantalla de juego para el modo "en vivo": a diferencia del modo
// individual, aquí nunca se decide localmente cuándo pasar de pregunta -
// todo llega empujado por Supabase Realtime (con /api/vivo/estado como
// respaldo para la primera carga). El detalle personal (si acertó,
// puntos, posición) se pide aparte a /api/vivo/mi-estado justo cuando el
// estado público anuncia que ya se puede revelar.
export default function PantallaJuegoVivo({ datos, estadoInicial, onFinal }) {
  const [estado, setEstado] = useState(estadoInicial);
  const [escalones, setEscalones] = useState(() =>
    Array.from({ length: estadoInicial.totalPreguntas }, (_, i) => ({ numero: i + 1, estado: 'pendiente' }))
  );
  const [ayudasUsadas, setAyudasUsadas] = useState({ cincuenta: false, llamada: false, publico: false });
  const [eliminadas, setEliminadas] = useState([]);
  const [respondiendo, setRespondiendo] = useState(false);
  const [overlay, setOverlay] = useState(null); // { titulo, puntosTexto, posicionTexto, ranking }
  const [modalLlamada, setModalLlamada] = useState(null);
  const [modalPublico, setModalPublico] = useState(null);
  const [silenciado, setSilenciado] = useState(false);
  const [, forzarRenderizado] = useState(0);

  const indiceMostradoRef = useRef(-1);
  const faseRevelandoMostradaRef = useRef(false);
  const ayudasActivas = estado.ayudasActivas || AYUDAS_POR_DEFECTO;

  useEffect(() => {
    setSilenciado(Sonido.estaSilenciado());
  }, []);

  function marcarEscalon(numero, esCorrecta) {
    setEscalones((prev) => prev.map((e) => (e.numero === numero ? { ...e, estado: esCorrecta ? 'correcta' : 'incorrecta' } : e)));
  }

  function resaltarEscalonActual(numero) {
    setEscalones((prev) =>
      prev.map((e) => ({ ...e, estado: e.numero === numero ? 'actual' : e.estado === 'actual' ? 'pendiente' : e.estado }))
    );
  }

  async function procesarEstado(nuevo) {
    setEstado(nuevo);

    if (nuevo.estadoJuego === 'pregunta') {
      if (nuevo.indiceActual !== indiceMostradoRef.current) {
        indiceMostradoRef.current = nuevo.indiceActual;
        faseRevelandoMostradaRef.current = false;
        setEliminadas([]);
        setRespondiendo(false);
        setOverlay(null);
        resaltarEscalonActual(nuevo.pregunta.numero);
        Sonido.iniciarSuspenso();
      }
      return;
    }

    if (nuevo.estadoJuego === 'revelando') {
      Sonido.detenerSuspenso();
      if (faseRevelandoMostradaRef.current) return;
      faseRevelandoMostradaRef.current = true;

      try {
        const miEstado = await llamarApi(`/api/vivo/mi-estado?codigo=${datos.codigoJuego}&sessionId=${datos.sessionId}`);
        marcarEscalon(indiceMostradoRef.current + 1, miEstado.esCorrecta);
        if (miEstado.esCorrecta) Sonido.correcto();
        else Sonido.incorrecto();

        setOverlay({
          titulo: miEstado.tuRespuesta ? (miEstado.esCorrecta ? '¡Correcto!' : 'Incorrecto') : 'Se acabó el tiempo',
          puntosTexto: miEstado.esCorrecta
            ? `+${miEstado.puntosGanados} puntos · Puntaje total: ${miEstado.puntajeTotal}`
            : `Puntaje total: ${miEstado.puntajeTotal}`,
          posicionTexto: miEstado.tuPosicion ? `Vas de puesto #${miEstado.tuPosicion}` : '',
          ranking: nuevo.ranking,
        });
      } catch {
        // se reintenta si vuelve a llegar el mismo estado
        faseRevelandoMostradaRef.current = false;
      }
      return;
    }

    if (nuevo.estadoJuego === 'finalizado') {
      try {
        const miEstado = await llamarApi(`/api/vivo/mi-estado?codigo=${datos.codigoJuego}&sessionId=${datos.sessionId}`);
        onFinal({ ranking: nuevo.ranking, tuPosicion: miEstado.tuPosicion, puntaje: miEstado.puntajeTotal });
      } catch {
        onFinal({ ranking: nuevo.ranking, tuPosicion: null, puntaje: 0 });
      }
    }
  }

  useEffect(() => {
    // Procesa el estado inicial recibido de la pantalla de lobby.
    procesarEstado(estadoInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const supabase = crearClienteNavegador();
    const canal = supabase
      .channel(`juego_vivo:${datos.codigoJuego}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sesiones_vivo', filter: `codigo=eq.${datos.codigoJuego}` },
        (payload) => {
          if (payload.new) procesarEstado(mapearSesionVivoPublica(payload.new));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos.codigoJuego]);

  // Refresca la barra de tiempo cada segundo usando el reloj local del
  // navegador contra la marca fin_pregunta_programado del servidor (la
  // transición CSS de la barra ya suaviza el movimiento entre ticks, así
  // que no hace falta re-renderizar con más frecuencia que eso).
  useEffect(() => {
    const id = setInterval(() => forzarRenderizado((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  function alternarSilencio() {
    Sonido.activar();
    setSilenciado(Sonido.alternarSilencio());
  }

  async function seleccionarOpcion(letra) {
    if (respondiendo) return;
    setRespondiendo(true);
    try {
      await llamarApi('/api/vivo/responder', {
        method: 'POST',
        body: JSON.stringify({ codigo: datos.codigoJuego, sessionId: datos.sessionId, opcion: letra }),
      });
      // La corrección llega en el siguiente evento de Realtime, al revelar.
    } catch (err) {
      alert(`No se pudo registrar tu respuesta: ${err.message}`);
      setRespondiendo(false);
    }
  }

  async function usarAyuda(nombre) {
    if (respondiendo || ayudasUsadas[nombre]) return;
    setAyudasUsadas((prev) => ({ ...prev, [nombre]: true }));

    const cuerpo = JSON.stringify({ codigo: datos.codigoJuego, sessionId: datos.sessionId });

    if (nombre === 'cincuenta') {
      try {
        const resultado = await llamarApi('/api/vivo/ayudas/cincuenta', { method: 'POST', body: cuerpo });
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
        const resultado = await llamarApi('/api/vivo/ayudas/llamada', { method: 'POST', body: cuerpo });
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
        const resultado = await llamarApi('/api/vivo/ayudas/publico', { method: 'POST', body: cuerpo });
        setModalPublico(resultado.porcentajes);
      } catch (err) {
        alert(`No se pudo usar la ayuda: ${err.message}`);
      }
    }
  }

  if (estado.estadoJuego !== 'pregunta' && !overlay) {
    return (
      <section className="pantalla activa">
        <p className="mensaje-vacio">Esperando al profesor...</p>
      </section>
    );
  }

  const pregunta = estado.pregunta;
  const segundosRestantes = estado.finPreguntaProgramado
    ? Math.max(0, Math.round((new Date(estado.finPreguntaProgramado).getTime() - Date.now()) / 1000))
    : 0;
  const enAlerta = segundosRestantes <= Math.min(10, estado.segundosPorPregunta * 0.2);

  return (
    <section className="pantalla activa">
      <div className="layout-juego">
        <Escalera escalones={escalones} />
        <main className="zona-juego">
          <header className="cabecera-juego">
            <span className="jugador-nombre">{datos.nombreJugador}</span>
            <div className="temporizador-contenedor">
              <div
                className={`temporizador-barra ${enAlerta ? 'alerta' : ''}`}
                style={{ width: `${Math.max(0, (segundosRestantes / estado.segundosPorPregunta) * 100)}%` }}
              />
            </div>
            <span className="numero-pregunta">
              Pregunta {pregunta.numero} de {estado.totalPreguntas}
            </span>
            <button className={`boton-silencio ${silenciado ? 'silenciado' : ''}`} onClick={alternarSilencio} title="Silenciar/activar sonido">
              {silenciado ? '🔇' : '🔊'}
            </button>
          </header>
          <p className="etiqueta-juego-actual">En vivo</p>

          <div className="caja-pregunta">
            <p className="texto-pregunta">{pregunta.pregunta}</p>
          </div>

          <div className="grid-opciones">
            {['A', 'B', 'C', 'D'].map((letra) => (
              <button
                key={letra}
                type="button"
                className={`boton-opcion ${eliminadas.includes(letra) ? 'eliminada' : ''}`}
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
                <button className="icono-ayuda" disabled={ayudasUsadas.cincuenta || respondiendo} onClick={() => usarAyuda('cincuenta')} title="50/50">
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
          </div>
        </main>
      </div>

      {modalLlamada && (
        <ModalLlamada segundos={modalLlamada.segundos} texto={modalLlamada.texto} onCerrar={() => setModalLlamada(null)} />
      )}
      {modalPublico && <ModalPublico porcentajes={modalPublico} onCerrar={() => setModalPublico(null)} />}

      {overlay && (
        <div className="modal">
          <div className="modal-caja">
            <h3>{overlay.titulo}</h3>
            <p className="modal-texto">{overlay.puntosTexto}</p>
            <p className="modal-texto-chico">{overlay.posicionTexto}</p>
            <h2 className="escalera-titulo titulo-ranking">🏆 Top 5</h2>
            <ol className="lista-ranking">
              {overlay.ranking.map((r, i) => (
                <li key={i}>
                  <span className="puesto-ranking">{r.nombre}</span>
                  <span>{r.puntaje} pts</span>
                </li>
              ))}
            </ol>
            <p className="modal-texto-chico">Esperando a que el profesor continúe...</p>
          </div>
        </div>
      )}
    </section>
  );
}
