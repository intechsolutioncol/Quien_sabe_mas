'use client';

import { useEffect, useState } from 'react';
import { llamarApi } from '@/lib/api-cliente';

// Selector de a quién quitarle puntos. Se identifica por NOMBRE, nunca
// por sessionId (ver app/api/vivo/jugadores/route.js para el porqué).
export default function ModalElegirObjetivo({ codigo, propioNombre, onElegir, onCerrar }) {
  const [nombres, setNombres] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    llamarApi(`/api/vivo/jugadores?codigo=${codigo}`)
      .then((lista) => setNombres(lista.filter((n) => n !== propioNombre)))
      .catch((err) => setError(err.message));
  }, [codigo, propioNombre]);

  return (
    <div className="modal">
      <div className="modal-caja">
        <h3>🎯 ¿A quién le quitas puntos?</h3>
        {error && <p className="mensaje-error">{error}</p>}
        {nombres && nombres.length === 0 && <p className="mensaje-vacio">No hay más jugadores en la sala.</p>}
        {nombres && nombres.length > 0 && (
          <div className="opciones-checkbox">
            {nombres.map((nombre) => (
              <button key={nombre} type="button" className="boton-secundario" onClick={() => onElegir(nombre)}>
                {nombre}
              </button>
            ))}
          </div>
        )}
        <button className="boton-dorado boton-cerrar-modal" onClick={onCerrar} style={{ marginTop: 16 }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
