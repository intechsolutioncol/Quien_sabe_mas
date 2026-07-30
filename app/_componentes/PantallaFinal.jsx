'use client';

import { useEffect } from 'react';
import { Sonido } from '@/lib/sonido';

const TITULOS_FINAL = {
  perfecto: '¡Respondiste todas las preguntas correctamente!',
  fallo: 'Fin del juego',
  tiempo: 'Se acabó el tiempo',
  completado: 'Juego terminado',
  retirado: 'Terminaste la partida',
};

export default function PantallaFinal({ resultado, nombreJugador, onJugarDeNuevo }) {
  useEffect(() => {
    if (resultado.motivo === 'perfecto') Sonido.finalGanador();
    // Solo debe sonar una vez, al llegar a esta pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="pantalla activa">
      <div className="contenedor-final">
        <h2 className="titulo-final">{TITULOS_FINAL[resultado.motivo] || 'Juego terminado'}</h2>
        <p className="premio-final-etiqueta">Puntaje obtenido</p>
        <p className="premio-final-valor">
          {resultado.puntaje} / {resultado.total}
        </p>
        <p className="jugador-final">{nombreJugador}</p>
        <button className="boton-dorado" onClick={onJugarDeNuevo}>
          Jugar de nuevo
        </button>
      </div>
    </section>
  );
}
