'use client';

import { useState } from 'react';
import { llamarApi } from '@/lib/api-cliente';

export default function BotonProbarIA() {
  const [estado, setEstado] = useState(null); // { valida, mensaje }
  const [cargando, setCargando] = useState(false);

  async function probar() {
    setCargando(true);
    setEstado(null);
    try {
      const resultado = await llamarApi('/api/ia/probar');
      setEstado(resultado);
    } catch (err) {
      setEstado({ valida: false, mensaje: `Error: ${err.message}` });
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="fila-botones-modal fila-probar-ia">
      <button type="button" className="boton-secundario boton-chico" onClick={probar} disabled={cargando}>
        {cargando ? 'Probando...' : '✨ Probar conexión con la IA'}
      </button>
      {estado && <span className={`mensaje-import ${estado.valida ? 'exito' : 'error'}`}>{estado.mensaje}</span>}
    </div>
  );
}
