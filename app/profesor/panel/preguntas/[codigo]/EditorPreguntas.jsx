'use client';

import { useCallback, useEffect, useState } from 'react';
import { llamarApi } from '@/lib/api-cliente';
import FormularioPregunta from './FormularioPregunta';

export default function EditorPreguntas({ codigo }) {
  const [preguntas, setPreguntas] = useState(null);
  const [error, setError] = useState('');
  const [enEdicion, setEnEdicion] = useState(null); // id de la pregunta en edición, o null
  const [agregando, setAgregando] = useState(false);

  const cargar = useCallback(() => {
    llamarApi(`/api/juegos/${codigo}/preguntas`)
      .then(setPreguntas)
      .catch((err) => setError(err.message));
  }, [codigo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardarNueva(valores) {
    await llamarApi(`/api/juegos/${codigo}/preguntas`, { method: 'POST', body: JSON.stringify(valores) });
    setAgregando(false);
    cargar();
  }

  async function guardarEdicion(id, valores) {
    await llamarApi(`/api/juegos/${codigo}/preguntas/${id}`, { method: 'PUT', body: JSON.stringify(valores) });
    setEnEdicion(null);
    cargar();
  }

  async function eliminar(pregunta) {
    if (!confirm(`¿Eliminar esta pregunta de nivel ${pregunta.nivel}? Esta acción no se puede deshacer.`)) return;
    try {
      await llamarApi(`/api/juegos/${codigo}/preguntas/${pregunta.id}`, { method: 'DELETE' });
      cargar();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }

  return (
    <div className="tarjeta-panel">
      {error && <p className="mensaje-error">{error}</p>}

      <div className="fila-botones-modal" style={{ marginBottom: 16 }}>
        <button type="button" className="boton-dorado boton-chico" onClick={() => setAgregando((v) => !v)}>
          {agregando ? 'Cancelar' : '+ Agregar pregunta'}
        </button>
      </div>

      {agregando && (
        <div className="tarjeta-panel" style={{ marginBottom: 16 }}>
          <h2 className="subtitulo-panel">Nueva pregunta</h2>
          <FormularioPregunta textoBoton="Agregar" onGuardar={guardarNueva} onCancelar={() => setAgregando(false)} />
        </div>
      )}

      {!preguntas && !error && <p className="mensaje-vacio">Cargando...</p>}
      {preguntas && preguntas.length === 0 && <p className="mensaje-vacio">Este juego todavía no tiene preguntas.</p>}

      {preguntas &&
        preguntas.map((p) =>
          enEdicion === p.id ? (
            <div className="tarjeta-panel" key={p.id}>
              <h2 className="subtitulo-panel">Editando pregunta (nivel {p.nivel})</h2>
              <FormularioPregunta
                inicial={p}
                textoBoton="Guardar cambios"
                onGuardar={(valores) => guardarEdicion(p.id, valores)}
                onCancelar={() => setEnEdicion(null)}
              />
            </div>
          ) : (
            <div className="tabla-scroll" key={p.id} style={{ marginBottom: 10 }}>
              <table className="tabla-juegos">
                <tbody>
                  <tr>
                    <td style={{ whiteSpace: 'nowrap' }}>Nivel {p.nivel}</td>
                    <td>{p.pregunta}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      A: {p.opcionA} · B: {p.opcionB} · C: {p.opcionC} · D: {p.opcionD} — <strong>correcta: {p.respuestaCorrecta}</strong>
                    </td>
                    <td className="celda-acciones">
                      <button type="button" className="boton-mini" onClick={() => setEnEdicion(p.id)}>
                        Editar
                      </button>
                      <button type="button" className="boton-mini" onClick={() => eliminar(p)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        )}
    </div>
  );
}
