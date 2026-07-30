'use client';

import { useEffect, useState } from 'react';
import { llamarApi } from '@/lib/api-cliente';

function formatearFecha(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-CO') + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function ModalResultados({ juego, onCerrar }) {
  const [resultados, setResultados] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    llamarApi(`/api/juegos/${juego.codigo}/resultados`)
      .then(setResultados)
      .catch((err) => setError(err.message));
  }, [juego.codigo]);

  return (
    <div className="modal">
      <div className="modal-caja modal-caja-ancha">
        <h3>Resultados</h3>
        <p className="modal-texto">
          Juego: <strong>{juego.nombreJuego} ({juego.codigo})</strong>
        </p>

        {error && <p className="mensaje-error">{error}</p>}

        {resultados && resultados.length === 0 && (
          <p className="mensaje-vacio">Todavía no hay estudiantes registrados en este juego.</p>
        )}

        {resultados && resultados.length > 0 && (
          <div className="tabla-scroll">
            <table className="tabla-juegos">
              <thead>
                <tr>
                  <th>Estudiante</th>
                  <th>Puntaje</th>
                  <th>Resultado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((r, i) => (
                  <tr key={i}>
                    <td>{r.nombreEstudiante}</td>
                    <td>
                      {r.puntaje} / {r.totalPreguntas}
                    </td>
                    <td>{r.resultado}</td>
                    <td>{formatearFecha(r.fecha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button className="boton-dorado boton-cerrar-modal" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
