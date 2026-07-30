'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { llamarApi } from '@/lib/api-cliente';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { mapearSesionVivoPublica } from '@/lib/juego/vivo-datos';

const INTERVALO_TICK_MS = 1000;

// Pantalla que el profesor proyecta: lobby -> pregunta -> revelando ->
// finalizado. Se suscribe a Supabase Realtime para reflejar cambios al
// instante y además "tiquea" cada segundo contra /api/vivo/estado, que es
// quien realmente dispara el avance automático por reloj en el servidor
// (no hay cron: mientras esta pantalla esté abierta, ella hace de reloj).
export default function HostVivo({ codigo }) {
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [accionando, setAccionando] = useState(false);
  const [, forzarRenderizado] = useState(0);

  const estadoRef = useRef(null);

  function actualizarEstado(nuevo) {
    estadoRef.current = nuevo;
    setEstado(nuevo);
  }

  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        let actual = null;
        try {
          actual = await llamarApi(`/api/vivo/estado?codigo=${codigo}`);
        } catch {
          actual = null;
        }
        if (!actual || actual.estadoJuego === 'finalizado') {
          actual = await llamarApi('/api/vivo/iniciar', { method: 'POST', body: JSON.stringify({ codigo }) });
        }
        if (!cancelado) actualizarEstado(actual);
      } catch (err) {
        if (!cancelado) setError(err.message);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [codigo]);

  // Tick: dispara el avance perezoso por reloj en el servidor.
  useEffect(() => {
    const intervalo = setInterval(async () => {
      try {
        const actual = await llamarApi(`/api/vivo/estado?codigo=${codigo}`);
        actualizarEstado(actual);
      } catch {
        // se reintenta en el próximo tick
      }
    }, INTERVALO_TICK_MS);
    return () => clearInterval(intervalo);
  }, [codigo]);

  // Realtime: refleja al instante cualquier cambio (propio o de un
  // estudiante respondiendo) sin esperar al próximo tick.
  useEffect(() => {
    const supabase = crearClienteNavegador();
    const canal = supabase
      .channel(`sesiones_vivo:${codigo}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sesiones_vivo', filter: `codigo=eq.${codigo}` },
        (payload) => {
          if (payload.new) actualizarEstado(mapearSesionVivoPublica(payload.new));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [codigo]);

  // Vuelve a renderizar cada segundo solo para que la barra de tiempo se
  // vea fluida entre un tick del servidor y el siguiente.
  useEffect(() => {
    const id = setInterval(() => forzarRenderizado((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  async function accionHost(ruta) {
    if (accionando) return;
    setAccionando(true);
    try {
      const nuevo = await llamarApi(ruta, { method: 'POST', body: JSON.stringify({ codigo }) });
      actualizarEstado(nuevo);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setAccionando(false);
    }
  }

  function terminarJuego() {
    if (!confirm('¿Terminar el juego en vivo ahora y mostrar los resultados finales?')) return;
    accionHost('/api/vivo/terminar');
  }

  if (cargando) {
    return (
      <main className="pantalla activa">
        <p className="mensaje-vacio">Cargando...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="pantalla activa">
        <div className="contenedor-inicio">
          <p className="mensaje-error">{error}</p>
          <Link href="/profesor/panel" className="boton-dorado boton-rol">
            Volver al panel
          </Link>
        </div>
      </main>
    );
  }

  if (!estado) return null;

  if (estado.estadoJuego === 'lobby') {
    return (
      <main className="pantalla activa">
        <div className="contenedor-inicio">
          <Link href="/profesor/panel" className="boton-volver">
            &larr; Volver al panel
          </Link>
          <h1 className="logo-juego logo-chico">{estado.nombreJuego}</h1>
          <p className="subtitulo-inicio">Comparte este código con tus estudiantes</p>

          <div className="caja-codigo-generado">
            <p className="codigo-generado">{estado.codigo}</p>
          </div>

          <div className="tarjeta-inicio tarjeta-lobby-host">
            <p className="contador-lobby">{estado.numeroJugadores} jugador(es) conectado(s)</p>
            <div className="chips-jugadores">
              {estado.nombresJugadores.map((nombre, i) => (
                <span className="chip-jugador" key={i}>
                  {nombre}
                </span>
              ))}
            </div>
            <button className="boton-dorado" disabled={accionando} onClick={() => accionHost('/api/vivo/avanzar')}>
              Iniciar juego
            </button>
          </div>
        </div>
      </main>
    );
  }

  const segundosRestantes =
    estado.estadoJuego === 'pregunta' && estado.finPreguntaProgramado
      ? Math.max(0, Math.round((new Date(estado.finPreguntaProgramado).getTime() - Date.now()) / 1000))
      : 0;
  const segundosParaAvanzar =
    estado.estadoJuego === 'revelando' && estado.avance === 'automatico' && estado.finRevelandoProgramado
      ? Math.max(0, Math.round((new Date(estado.finRevelandoProgramado).getTime() - Date.now()) / 1000))
      : null;

  return (
    <main className="pantalla activa">
      <div className="contenedor-host">
        <header className="cabecera-host">
          <span>{estado.nombreJuego}</span>
          <span>
            {estado.indiceActual >= 0 ? `Pregunta ${estado.indiceActual + 1} de ${estado.totalPreguntas}` : ''}
          </span>
          <span>{estado.numeroJugadores} jugador(es)</span>
        </header>

        {estado.estadoJuego === 'pregunta' && (
          <>
            <div className="temporizador-contenedor temporizador-host">
              <div
                className={`temporizador-barra ${segundosRestantes <= Math.min(10, estado.segundosPorPregunta * 0.2) ? 'alerta' : ''}`}
                style={{ width: `${Math.max(0, (segundosRestantes / estado.segundosPorPregunta) * 100)}%` }}
              />
            </div>
            <div className="caja-pregunta caja-pregunta-host">
              <p className="texto-pregunta texto-pregunta-host">{estado.pregunta.pregunta}</p>
            </div>
            <div className="grid-opciones grid-opciones-host">
              {['A', 'B', 'C', 'D'].map((letra) => (
                <div className="opcion-host" key={letra} data-letra={letra}>
                  <span className="opcion-letra">{letra}</span>
                  <span className="opcion-texto">{estado.pregunta.opciones[letra]}</span>
                </div>
              ))}
            </div>
            <p className="contador-respuestas">
              Respuestas recibidas: {estado.respuestasRecibidas} / {estado.numeroJugadores}
            </p>
            <div className="fila-botones-modal fila-botones-host">
              <button className="boton-secundario" disabled={accionando} onClick={() => accionHost('/api/vivo/revelar')}>
                Revelar ahora
              </button>
              <button className="boton-secundario" onClick={terminarJuego}>
                Terminar juego
              </button>
            </div>
          </>
        )}

        {estado.estadoJuego === 'revelando' && (
          <>
            <div className="caja-pregunta caja-pregunta-host">
              <p className="texto-pregunta texto-pregunta-host">{estado.pregunta.pregunta}</p>
            </div>
            <div className="grid-opciones grid-opciones-host">
              {['A', 'B', 'C', 'D'].map((letra) => (
                <div
                  className={`opcion-host ${letra === estado.respuestaCorrecta ? 'opcion-host-correcta' : ''}`}
                  key={letra}
                  data-letra={letra}
                >
                  <span className="opcion-letra">{letra}</span>
                  <span className="opcion-texto">{estado.pregunta.opciones[letra]}</span>
                  <span className="opcion-conteo">{(estado.distribucionRespuestas?.[letra] || 0)} voto(s)</span>
                </div>
              ))}
            </div>
            <h2 className="escalera-titulo titulo-ranking">🏆 Top 5</h2>
            <ol className="lista-ranking">
              {estado.ranking.map((r, i) => (
                <li key={i}>
                  <span className="puesto-ranking">{r.nombre}</span>
                  <span>{r.puntaje} pts</span>
                </li>
              ))}
            </ol>
            {segundosParaAvanzar !== null ? (
              <p className="mensaje-avance-automatico">Avanzando automáticamente en {segundosParaAvanzar}s...</p>
            ) : (
              <div className="fila-botones-modal fila-botones-host">
                <button className="boton-dorado" disabled={accionando} onClick={() => accionHost('/api/vivo/avanzar')}>
                  Siguiente pregunta
                </button>
              </div>
            )}
            <div className="fila-botones-modal fila-botones-host">
              <button className="boton-secundario" onClick={terminarJuego}>
                Terminar juego
              </button>
            </div>
          </>
        )}

        {estado.estadoJuego === 'finalizado' && (
          <>
            <h2 className="titulo-final">🏆 Resultados finales</h2>
            <ol className="lista-ranking lista-ranking-final">
              {estado.ranking.map((r, i) => (
                <li key={i}>
                  <span className="puesto-ranking">{r.nombre}</span>
                  <span>{r.puntaje} pts</span>
                </li>
              ))}
            </ol>
            <Link href="/profesor/panel" className="boton-dorado boton-rol">
              Volver al panel
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
