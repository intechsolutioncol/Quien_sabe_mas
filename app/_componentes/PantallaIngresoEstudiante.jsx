'use client';

import { useState } from 'react';
import { Sonido } from '@/lib/sonido';
import { llamarApi } from '@/lib/api-cliente';

// Ingreso en dos pasos: primero el código (se valida contra el servidor
// antes de pedir nada más), luego el nombre. Así, si el código está mal
// o el juego está inactivo, el estudiante se entera de inmediato sin
// haber escrito su nombre todavía.
export default function PantallaIngresoEstudiante({ onVolver, onIngreso }) {
  const [paso, setPaso] = useState('codigo'); // 'codigo' | 'nombre'
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [infoJuego, setInfoJuego] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function validarCodigo(e) {
    e?.preventDefault();
    Sonido.activar();
    if (!codigo.trim()) {
      setError('Escribe el código del juego.');
      return;
    }
    setError('');
    setCargando(true);
    try {
      const info = await llamarApi(`/api/partidas/validar-codigo?codigo=${encodeURIComponent(codigo.trim())}`);
      setInfoJuego(info);
      setPaso('nombre');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function ingresar(e) {
    e?.preventDefault();
    if (!nombre.trim()) {
      setError('Escribe tu nombre.');
      return;
    }
    setError('');
    setCargando(true);
    try {
      const datos = await llamarApi('/api/partidas/unirse', {
        method: 'POST',
        body: JSON.stringify({ codigo: infoJuego.codigo, nombreEstudiante: nombre.trim() }),
      });
      onIngreso(datos);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  function volverAPaso1() {
    setError('');
    setNombre('');
    setInfoJuego(null);
    setPaso('codigo');
  }

  if (paso === 'nombre') {
    return (
      <section className="pantalla activa">
        <div className="contenedor-inicio">
          <button className="boton-volver" onClick={volverAPaso1}>
            &larr; Volver
          </button>
          <h1 className="logo-juego logo-chico">{infoJuego.nombreJuego}</h1>
          <p className="subtitulo-inicio">
            {infoJuego.tematica ? infoJuego.tematica : 'Ya encontramos tu juego'} · ¿cómo te llamas?
          </p>

          <form className="tarjeta-inicio" onSubmit={ingresar}>
            <label className="etiqueta-nombre" htmlFor="input-nombre">
              Tu nombre
            </label>
            <input
              id="input-nombre"
              type="text"
              maxLength={40}
              placeholder="Tu nombre..."
              autoComplete="off"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />

            <button type="submit" className="boton-dorado" disabled={cargando}>
              {cargando ? 'Cargando...' : 'Ingresar al juego'}
            </button>
            {error && <p className="mensaje-error">{error}</p>}
          </form>

          <div className="reglas-inicio">
            <p>Tu nombre es lo que verá tu profesor en los resultados.</p>
          </div>
        </div>
      </section>
    );
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

        <form className="tarjeta-inicio" onSubmit={validarCodigo}>
          <label className="etiqueta-nombre" htmlFor="input-codigo">
            Código del juego
          </label>
          <input
            id="input-codigo"
            type="text"
            maxLength={6}
            placeholder="Ej: A3F9K2"
            autoComplete="off"
            autoFocus
            className="input-codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          />

          <button type="submit" className="boton-dorado" disabled={cargando}>
            {cargando ? 'Buscando...' : 'Siguiente'}
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
