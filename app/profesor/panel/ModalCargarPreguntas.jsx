'use client';

import { useState } from 'react';
import Link from 'next/link';
import { llamarApi } from '@/lib/api-cliente';
import { descargarPlantillaCsv, leerArchivoComoTexto } from '@/lib/csv-plantilla';

export default function ModalCargarPreguntas({ juego, onCerrar, onCambio }) {
  const [mensaje, setMensaje] = useState(null); // { texto, error }
  const [cargando, setCargando] = useState(false);
  const [edad, setEdad] = useState(15);

  async function subirArchivo(e) {
    const archivo = e.target.files[0];
    if (!archivo) return;
    setCargando(true);
    setMensaje({ texto: 'Importando...', error: false });
    try {
      const texto = await leerArchivoComoTexto(archivo);
      const resultado = await llamarApi(`/api/juegos/${juego.codigo}/preguntas/csv`, {
        method: 'POST',
        body: JSON.stringify({ textoCsv: texto }),
      });
      let texto2 = `Se guardaron ${resultado.importadas} de ${resultado.totalFilas} preguntas.`;
      if (resultado.errores.length) texto2 += ` Con problemas: ${resultado.errores.join(' | ')}`;
      setMensaje({ texto: texto2, error: resultado.errores.length > 0 });
      onCambio();
    } catch (err) {
      setMensaje({ texto: `Error: ${err.message}`, error: true });
    } finally {
      setCargando(false);
      e.target.value = '';
    }
  }

  async function cargarBancoDemo() {
    setCargando(true);
    setMensaje({ texto: 'Cargando banco de 100 preguntas de cultura general...', error: false });
    try {
      const resultado = await llamarApi(`/api/juegos/${juego.codigo}/preguntas/demo`, { method: 'POST' });
      setMensaje({ texto: `Se cargaron ${resultado.importadas} preguntas demo.`, error: false });
      onCambio();
    } catch (err) {
      setMensaje({ texto: `Error: ${err.message}`, error: true });
    } finally {
      setCargando(false);
    }
  }

  async function generarConIA() {
    setCargando(true);
    setMensaje({ texto: 'Generando preguntas con IA, esto puede tardar unos segundos...', error: false });
    try {
      const resultado = await llamarApi(`/api/juegos/${juego.codigo}/preguntas/ia`, {
        method: 'POST',
        body: JSON.stringify({ edadEstudiantes: edad }),
      });
      let texto2 = `Se guardaron ${resultado.importadas} de ${resultado.totalFilas} preguntas.`;
      if (resultado.errores.length) texto2 += ` Con problemas: ${resultado.errores.join(' | ')}`;
      setMensaje({ texto: texto2, error: resultado.errores.length > 0 });
      onCambio();
    } catch (err) {
      setMensaje({ texto: `Error: ${err.message}`, error: true });
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="modal">
      <div className="modal-caja">
        <h3>Cargar preguntas</h3>
        <p className="modal-texto">
          Juego: <strong>{juego.nombreJuego} ({juego.codigo})</strong>
        </p>

        <button type="button" className="boton-secundario boton-chico" onClick={cargarBancoDemo} disabled={cargando}>
          Usar banco demo (100 preguntas)
        </button>{' '}
        <button type="button" className="boton-secundario boton-chico" onClick={descargarPlantillaCsv}>
          Descargar plantilla CSV
        </button>
        <p />
        <label className="boton-secundario boton-chico boton-archivo">
          {cargando ? 'Procesando...' : 'Subir preguntas (CSV)'}
          <input type="file" accept=".csv" className="oculto" onChange={subirArchivo} disabled={cargando} />
        </label>

        <div className="campo-formulario" style={{ marginTop: 16 }}>
          <label htmlFor="modal-ia-edad">Edad de los estudiantes (para generar con IA)</label>
          <input
            id="modal-ia-edad"
            type="number"
            min={5}
            max={25}
            value={edad}
            onChange={(e) => setEdad(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="boton-secundario boton-chico"
          onClick={generarConIA}
          disabled={cargando || !juego.tematica}
          title={!juego.tematica ? 'Este juego no tiene temática: edítalo para agregar una' : undefined}
        >
          ✨ Crear preguntas con IA
        </button>

        {mensaje && <p className={`mensaje-import ${mensaje.error ? 'error' : 'exito'}`}>{mensaje.texto}</p>}

        <p style={{ marginTop: 16 }}>
          <Link href={`/profesor/panel/preguntas/${juego.codigo}`}>Editar preguntas individualmente →</Link>
        </p>

        <button className="boton-dorado boton-cerrar-modal" onClick={onCerrar} style={{ marginTop: 16 }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
