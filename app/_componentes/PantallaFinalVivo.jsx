'use client';

import { useEffect } from 'react';
import { Sonido } from '@/lib/sonido';

// Pantalla final del modo en vivo: puntaje en puntos (no x/y preguntas),
// posición y ranking completo. Equivalente a mostrarFinalVivo de script.html.
export default function PantallaFinalVivo({ resultado, nombreJugador, onJugarDeNuevo }) {
  useEffect(() => {
    if (resultado.tuPosicion === 1) Sonido.finalGanador();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="pantalla activa">
      <div className="contenedor-final">
        <h2 className="titulo-final">🏆 Juego en vivo terminado</h2>
        <p className="premio-final-etiqueta">Puntaje obtenido</p>
        <p className="premio-final-valor">{resultado.puntaje} puntos</p>
        <p className="jugador-final">
          {nombreJugador}
          {resultado.equipo ? ` · Equipo ${resultado.equipo}` : ''}
        </p>
        {resultado.tuPosicion && <p className="modal-texto-chico">Terminaste en el puesto #{resultado.tuPosicion}</p>}
        {resultado.rankingEquipos && (
          <>
            <h2 className="escalera-titulo titulo-ranking">Por equipo</h2>
            <ol className="lista-ranking">
              {resultado.rankingEquipos.map((r, i) => (
                <li key={i}>
                  <span className="puesto-ranking">Equipo {r.equipo}</span>
                  <span>{r.puntaje} pts</span>
                </li>
              ))}
            </ol>
          </>
        )}
        <ol className="lista-ranking">
          {resultado.ranking.map((r, i) => (
            <li key={i}>
              <span className="puesto-ranking">{r.nombre}</span>
              <span>{r.puntaje} pts</span>
            </li>
          ))}
        </ol>
        <button className="boton-dorado" onClick={onJugarDeNuevo}>
          Jugar de nuevo
        </button>
      </div>
    </section>
  );
}
