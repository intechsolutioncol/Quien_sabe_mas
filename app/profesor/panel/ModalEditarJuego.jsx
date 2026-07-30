'use client';

import { useState } from 'react';
import { llamarApi } from '@/lib/api-cliente';

export default function ModalEditarJuego({ juego, onCerrar, onGuardado }) {
  const [valores, setValores] = useState({
    nombreJuego: juego.nombreJuego,
    tematica: juego.tematica || '',
    profesor: juego.profesor || '',
    cantidadPreguntas: juego.cantidadPreguntas,
    modo: juego.modo || 'individual',
    modoTiempo: juego.modoTiempo || 'porPregunta',
    avanceVivo: juego.avanceVivo || 'automatico',
    segundosPorPregunta: juego.segundosPorPregunta || 45,
    duracionTotalMinutos: Math.round((juego.duracionTotalSegundos || 600) / 60),
    ayudaCincuenta: !!(juego.ayudas && juego.ayudas.cincuenta),
    ayudaLlamada: !!(juego.ayudas && juego.ayudas.llamada),
    ayudaPublico: !!(juego.ayudas && juego.ayudas.publico),
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  function actualizar(campo, valor) {
    setValores((prev) => ({ ...prev, [campo]: valor }));
  }

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await llamarApi(`/api/juegos/${juego.codigo}`, {
        method: 'PUT',
        body: JSON.stringify({
          nombreJuego: valores.nombreJuego.trim(),
          tematica: valores.tematica.trim(),
          profesor: valores.profesor.trim(),
          cantidadPreguntas: valores.cantidadPreguntas,
          modo: valores.modo,
          modoTiempo: valores.modoTiempo,
          avanceVivo: valores.avanceVivo,
          segundosPorPregunta: valores.segundosPorPregunta,
          duracionTotalMinutos: valores.duracionTotalMinutos,
          ayudas: {
            cincuenta: valores.ayudaCincuenta,
            llamada: valores.ayudaLlamada,
            publico: valores.ayudaPublico,
          },
        }),
      });
      onGuardado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal">
      <div className="modal-caja modal-caja-ancha">
        <h3>Editar juego</h3>
        <p className="modal-texto">
          Código: <strong>{juego.codigo}</strong> (no cambia)
        </p>
        <form onSubmit={enviar} className="formulario-juego">
          <div className="campo-formulario">
            <label htmlFor="ej-nombre">Nombre del juego</label>
            <input
              id="ej-nombre"
              type="text"
              maxLength={60}
              required
              value={valores.nombreJuego}
              onChange={(e) => actualizar('nombreJuego', e.target.value)}
            />
          </div>
          <div className="campo-formulario">
            <label htmlFor="ej-tematica">Temática</label>
            <input
              id="ej-tematica"
              type="text"
              maxLength={60}
              value={valores.tematica}
              onChange={(e) => actualizar('tematica', e.target.value)}
            />
          </div>
          <div className="campo-formulario">
            <label htmlFor="ej-profesor">Tu nombre (opcional)</label>
            <input
              id="ej-profesor"
              type="text"
              maxLength={60}
              value={valores.profesor}
              onChange={(e) => actualizar('profesor', e.target.value)}
            />
          </div>
          <div className="campo-formulario">
            <label htmlFor="ej-cantidad">Cantidad de preguntas (1 a 100)</label>
            <input
              id="ej-cantidad"
              type="number"
              min={1}
              max={100}
              required
              value={valores.cantidadPreguntas}
              onChange={(e) => actualizar('cantidadPreguntas', e.target.value)}
            />
          </div>
          <div className="campo-formulario">
            <label>Modo de juego</label>
            <div className="opciones-radio">
              <label className="radio-linea">
                <input type="radio" checked={valores.modo === 'individual'} onChange={() => actualizar('modo', 'individual')} />
                Individual (cada estudiante juega a su ritmo)
              </label>
              <label className="radio-linea">
                <input type="radio" checked={valores.modo === 'vivo'} onChange={() => actualizar('modo', 'vivo')} />
                En vivo y sincronizado
              </label>
            </div>
          </div>

          {valores.modo === 'individual' && (
            <div className="campo-formulario">
              <label>¿Cómo funciona el tiempo?</label>
              <div className="opciones-radio">
                <label className="radio-linea">
                  <input
                    type="radio"
                    checked={valores.modoTiempo === 'porPregunta'}
                    onChange={() => actualizar('modoTiempo', 'porPregunta')}
                  />
                  Tiempo por pregunta
                </label>
                <label className="radio-linea">
                  <input
                    type="radio"
                    checked={valores.modoTiempo === 'total'}
                    onChange={() => actualizar('modoTiempo', 'total')}
                  />
                  Tiempo total de la sesión
                </label>
              </div>
            </div>
          )}

          {valores.modo === 'vivo' && (
            <div className="campo-formulario">
              <label>¿Cómo avanza el juego entre preguntas?</label>
              <div className="opciones-radio">
                <label className="radio-linea">
                  <input
                    type="radio"
                    checked={valores.avanceVivo === 'automatico'}
                    onChange={() => actualizar('avanceVivo', 'automatico')}
                  />
                  Automático por tiempo
                </label>
                <label className="radio-linea">
                  <input
                    type="radio"
                    checked={valores.avanceVivo === 'manual'}
                    onChange={() => actualizar('avanceVivo', 'manual')}
                  />
                  El profesor avanza manualmente
                </label>
              </div>
            </div>
          )}

          {valores.modo === 'vivo' || valores.modoTiempo === 'porPregunta' ? (
            <div className="campo-formulario">
              <label htmlFor="ej-segundos-pregunta">Segundos por pregunta</label>
              <input
                id="ej-segundos-pregunta"
                type="number"
                min={5}
                max={300}
                value={valores.segundosPorPregunta}
                onChange={(e) => actualizar('segundosPorPregunta', e.target.value)}
              />
            </div>
          ) : (
            <div className="campo-formulario">
              <label htmlFor="ej-duracion-total">Duración total de la sesión (minutos)</label>
              <input
                id="ej-duracion-total"
                type="number"
                min={1}
                max={120}
                value={valores.duracionTotalMinutos}
                onChange={(e) => actualizar('duracionTotalMinutos', e.target.value)}
              />
            </div>
          )}
          <div className="campo-formulario">
            <label>Ayudas activas</label>
            <div className="opciones-checkbox">
              <label className="checkbox-linea">
                <input
                  type="checkbox"
                  checked={valores.ayudaCincuenta}
                  onChange={(e) => actualizar('ayudaCincuenta', e.target.checked)}
                />
                50/50
              </label>
              <label className="checkbox-linea">
                <input
                  type="checkbox"
                  checked={valores.ayudaLlamada}
                  onChange={(e) => actualizar('ayudaLlamada', e.target.checked)}
                />
                Llamada a un amigo
              </label>
              <label className="checkbox-linea">
                <input
                  type="checkbox"
                  checked={valores.ayudaPublico}
                  onChange={(e) => actualizar('ayudaPublico', e.target.checked)}
                />
                Pregunta al público
              </label>
            </div>
          </div>
          <div className="fila-botones-modal">
            <button type="submit" className="boton-dorado" disabled={enviando}>
              {enviando ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button type="button" className="boton-secundario" onClick={onCerrar}>
              Cancelar
            </button>
          </div>
          {error && <p className="mensaje-error">{error}</p>}
        </form>
      </div>
    </div>
  );
}
