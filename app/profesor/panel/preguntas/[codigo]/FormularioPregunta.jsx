'use client';

import { useState } from 'react';

const VACIO = { nivel: 1, pregunta: '', opcionA: '', opcionB: '', opcionC: '', opcionD: '', respuestaCorrecta: 'A' };

// Formulario reutilizado tanto para agregar una pregunta nueva como para
// editar una existente (recibe `inicial` con los valores a precargar).
export default function FormularioPregunta({ inicial, textoBoton, onGuardar, onCancelar }) {
  const [valores, setValores] = useState(inicial || VACIO);
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
      await onGuardar(valores);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="formulario-juego">
      <div className="campo-formulario">
        <label>Nivel (1 a 5)</label>
        <input
          type="number"
          min={1}
          max={5}
          required
          value={valores.nivel}
          onChange={(e) => actualizar('nivel', e.target.value)}
        />
      </div>
      <div className="campo-formulario">
        <label>Pregunta</label>
        <input type="text" required value={valores.pregunta} onChange={(e) => actualizar('pregunta', e.target.value)} />
      </div>
      {['A', 'B', 'C', 'D'].map((letra) => (
        <div className="campo-formulario" key={letra}>
          <label>Opción {letra}</label>
          <input
            type="text"
            required
            value={valores[`opcion${letra}`]}
            onChange={(e) => actualizar(`opcion${letra}`, e.target.value)}
          />
        </div>
      ))}
      <div className="campo-formulario">
        <label>Respuesta correcta</label>
        <div className="opciones-radio">
          {['A', 'B', 'C', 'D'].map((letra) => (
            <label className="radio-linea" key={letra}>
              <input
                type="radio"
                checked={valores.respuestaCorrecta === letra}
                onChange={() => actualizar('respuestaCorrecta', letra)}
              />
              {letra}
            </label>
          ))}
        </div>
      </div>
      <div className="fila-botones-modal">
        <button type="submit" className="boton-dorado" disabled={enviando}>
          {enviando ? 'Guardando...' : textoBoton}
        </button>
        {onCancelar && (
          <button type="button" className="boton-secundario" onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </div>
      {error && <p className="mensaje-error">{error}</p>}
    </form>
  );
}
