'use client';

import { useEffect, useState } from 'react';

// Port del modal "Pregunta al público" (barras animadas) de script.html.
export default function ModalPublico({ porcentajes, onCerrar }) {
  const [anchos, setAnchos] = useState({ A: 0, B: 0, C: 0, D: 0 });

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnchos(porcentajes));
    return () => cancelAnimationFrame(id);
  }, [porcentajes]);

  return (
    <div className="modal">
      <div className="modal-caja">
        <h3>Resultados de la encuesta</h3>
        <div className="grafica-publico">
          {['A', 'B', 'C', 'D'].map((letra) => (
            <div className="barra-fila" key={letra}>
              <span className="barra-letra">{letra}</span>
              <span className="barra-pista">
                <span className="barra-relleno" style={{ width: `${anchos[letra] || 0}%` }} />
              </span>
              <span className="barra-porcentaje">{porcentajes[letra] || 0}%</span>
            </div>
          ))}
        </div>
        <button className="boton-dorado boton-cerrar-modal" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
