'use client';

import { useEffect, useState } from 'react';
import { llamarApi } from '@/lib/api-cliente';
import { generarPdfResultados } from '@/lib/pdf-resultados';

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
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    llamarApi(`/api/juegos/${juego.codigo}/resultados`)
      .then(setResultados)
      .catch((err) => setError(err.message));
  }, [juego.codigo]);

  async function descargarPdfYBorrar() {
    if (!resultados || resultados.length === 0) return;
    if (
      !confirm(
        `Se va a descargar el PDF con los ${resultados.length} resultado(s) de este juego y luego se van a borrar de aquí. Esta acción no se puede deshacer. ¿Continuar?`
      )
    ) {
      return;
    }

    setProcesando(true);
    setError('');
    try {
      await generarPdfResultados(juego, resultados);
      await llamarApi(`/api/juegos/${juego.codigo}/resultados`, { method: 'DELETE' });
      setResultados([]);
    } catch (err) {
      setError(`No se pudo completar la descarga/limpieza: ${err.message}`);
    } finally {
      setProcesando(false);
    }
  }

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
          <>
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
            <div className="fila-botones-modal" style={{ marginTop: 14 }}>
              <button className="boton-secundario boton-chico" onClick={descargarPdfYBorrar} disabled={procesando}>
                {procesando ? 'Procesando...' : '📄 Descargar PDF y borrar resultados'}
              </button>
            </div>
          </>
        )}

        <button className="boton-dorado boton-cerrar-modal" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
