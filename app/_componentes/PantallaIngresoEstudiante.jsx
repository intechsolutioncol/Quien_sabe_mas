'use client';

import { useState } from 'react';
import { Sonido } from '@/lib/sonido';
import { llamarApi } from '@/lib/api-cliente';

export default function PantallaIngresoEstudiante({ onVolver, onIngreso }) {
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function ingresar(e) {
    e?.preventDefault();
    Sonido.activar();
    if (!codigo.trim() || !nombre.trim()) {
      setError('Escribe el código del juego y tu nombre.');
      return;
    }
    setError('');
    setCargando(true);
    try {
      const datos = await llamarApi('/api/partidas/unirse', {
        method: 'POST',
        body: JSON.stringify({ codigo: codigo.trim(), nombreEstudiante: nombre.trim() }),
      });
      onIngreso(datos);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <section className="pantalla activa">
      <div className="contenedor-inicio">
        <button className="boton-volver" onClick={onVolver}>
          &larr; Volver
        </button>
        <h1 className="logo-juego logo-chico">
          <span className="logo-signo">¿</span>QUIÉN SABE MÁS<span className="logo-signo">?</span>
        </h1>
        <p className="subtitulo-inicio">Ingresa el código que te dio tu profesor</p>

        <form className="tarjeta-inicio" onSubmit={ingresar}>
          <label className="etiqueta-nombre" htmlFor="input-codigo">
            Código del juego
          </label>
          <input
            id="input-codigo"
            type="text"
            maxLength={6}
            placeholder="Ej: A3F9K2"
            autoComplete="off"
            className="input-codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          />

          <label className="etiqueta-nombre" htmlFor="input-nombre">
            Tu nombre
          </label>
          <input
            id="input-nombre"
            type="text"
            maxLength={40}
            placeholder="Tu nombre..."
            autoComplete="off"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />

          <button type="submit" className="boton-dorado" disabled={cargando}>
            {cargando ? 'Cargando...' : 'Ingresar al juego'}
          </button>
          {error && <p className="mensaje-error">{error}</p>}
        </form>

        <div className="reglas-inicio">
          <p>Dificultad ascendente · ayudas configuradas por tu profesor</p>
        </div>
      </div>
    </section>
  );
}
