'use client';

import { useState } from 'react';
import { llamarApi } from '@/lib/api-cliente';
import { descargarPlantillaCsv, leerArchivoComoTexto } from '@/lib/csv-plantilla';

const VALORES_INICIALES = {
  nombreJuego: '',
  tematica: '',
  profesor: '',
  cantidadPreguntas: 15,
  modo: 'individual',
  modoTiempo: 'porPregunta',
  avanceVivo: 'automatico',
  segundosPorPregunta: 45,
  duracionTotalMinutos: 10,
  ayudaCincuenta: true,
  ayudaLlamada: true,
  ayudaPublico: true,
};

export default function FormularioCrearJuego({ onJuegoCreado }) {
  const [valores, setValores] = useState(VALORES_INICIALES);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [juegoRecienCreado, setJuegoRecienCreado] = useState(null);
  const [mensajeImport, setMensajeImport] = useState(null); // { texto, error }
  const [importando, setImportando] = useState(false);
  const [generandoIA, setGenerandoIA] = useState(false);

  function actualizar(campo, valor) {
    setValores((prev) => ({ ...prev, [campo]: valor }));
  }

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const juego = await llamarApi('/api/juegos', {
        method: 'POST',
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
      setJuegoRecienCreado(juego);
      setMensajeImport(null);
      setValores(VALORES_INICIALES);
      onJuegoCreado();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  async function subirArchivo(e) {
    const archivo = e.target.files[0];
    if (!archivo || !juegoRecienCreado) return;
    setImportando(true);
    setMensajeImport({ texto: 'Importando...', error: false });
    try {
      const texto = await leerArchivoComoTexto(archivo);
      const resultado = await llamarApi(`/api/juegos/${juegoRecienCreado.codigo}/preguntas/csv`, {
        method: 'POST',
        body: JSON.stringify({ textoCsv: texto }),
      });
      let mensaje = `Se guardaron ${resultado.importadas} de ${resultado.totalFilas} preguntas.`;
      if (resultado.errores.length) mensaje += ` Con problemas: ${resultado.errores.join(' | ')}`;
      setMensajeImport({ texto: mensaje, error: resultado.errores.length > 0 });
      onJuegoCreado();
    } catch (err) {
      setMensajeImport({ texto: `Error: ${err.message}`, error: true });
    } finally {
      setImportando(false);
      e.target.value = '';
    }
  }

  async function cargarBancoDemo() {
    if (!juegoRecienCreado) return;
    setImportando(true);
    setMensajeImport({ texto: 'Cargando banco de 100 preguntas de cultura general...', error: false });
    try {
      const resultado = await llamarApi(`/api/juegos/${juegoRecienCreado.codigo}/preguntas/demo`, { method: 'POST' });
      setMensajeImport({ texto: `Se cargaron ${resultado.importadas} preguntas demo.`, error: false });
      onJuegoCreado();
    } catch (err) {
      setMensajeImport({ texto: `Error: ${err.message}`, error: true });
    } finally {
      setImportando(false);
    }
  }

  async function generarConIA() {
    if (!juegoRecienCreado || !juegoRecienCreado.tematica) return;
    setGenerandoIA(true);
    setMensajeImport({ texto: 'Generando preguntas con IA, esto puede tardar unos segundos...', error: false });
    try {
      const resultado = await llamarApi(`/api/juegos/${juegoRecienCreado.codigo}/preguntas/ia`, {
        method: 'POST',
        body: JSON.stringify({ edadEstudiantes: 15 }),
      });
      let mensaje = `Se guardaron ${resultado.importadas} de ${resultado.totalFilas} preguntas.`;
      if (resultado.errores.length) mensaje += ` Con problemas: ${resultado.errores.join(' | ')}`;
      setMensajeImport({ texto: mensaje, error: resultado.errores.length > 0 });
      onJuegoCreado();
    } catch (err) {
      setMensajeImport({ texto: `Error: ${err.message}`, error: true });
    } finally {
      setGenerandoIA(false);
    }
  }

  return (
    <div className="tarjeta-panel">
      <h2 className="subtitulo-panel">Crear nuevo juego</h2>

      <form onSubmit={enviar} className="formulario-juego">
        <div className="campo-formulario">
          <label htmlFor="cj-nombre">Nombre del juego</label>
          <input
            id="cj-nombre"
            type="text"
            maxLength={60}
            required
            value={valores.nombreJuego}
            onChange={(e) => actualizar('nombreJuego', e.target.value)}
            placeholder="Ej: Matemáticas 10A - Corte 2"
          />
        </div>
        <div className="campo-formulario">
          <label htmlFor="cj-tematica">Temática</label>
          <input
            id="cj-tematica"
            type="text"
            maxLength={60}
            value={valores.tematica}
            onChange={(e) => actualizar('tematica', e.target.value)}
            placeholder="Ej: Álgebra, Cultura general, Historia..."
          />
        </div>
        <div className="campo-formulario">
          <label htmlFor="cj-profesor">Tu nombre (opcional, para mostrar a los estudiantes)</label>
          <input
            id="cj-profesor"
            type="text"
            maxLength={60}
            value={valores.profesor}
            onChange={(e) => actualizar('profesor', e.target.value)}
            placeholder="Ej: Prof. Ramírez"
          />
        </div>
        <div className="campo-formulario">
          <label htmlFor="cj-cantidad">Cantidad de preguntas (1 a 100)</label>
          <input
            id="cj-cantidad"
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
              En vivo y sincronizado (todos responden la misma pregunta a la vez)
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
                Tiempo por pregunta (si se acaba o falla, termina el juego)
              </label>
              <label className="radio-linea">
                <input
                  type="radio"
                  checked={valores.modoTiempo === 'total'}
                  onChange={() => actualizar('modoTiempo', 'total')}
                />
                Tiempo total de la sesión (el puntaje es la cantidad de preguntas contestadas bien)
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
                Automático por tiempo (se revela y avanza solo)
              </label>
              <label className="radio-linea">
                <input
                  type="radio"
                  checked={valores.avanceVivo === 'manual'}
                  onChange={() => actualizar('avanceVivo', 'manual')}
                />
                El profesor avanza manualmente (para comentar cada pregunta)
              </label>
            </div>
          </div>
        )}

        {valores.modo === 'vivo' || valores.modoTiempo === 'porPregunta' ? (
          <div className="campo-formulario">
            <label htmlFor="cj-segundos-pregunta">Segundos por pregunta</label>
            <input
              id="cj-segundos-pregunta"
              type="number"
              min={5}
              max={300}
              value={valores.segundosPorPregunta}
              onChange={(e) => actualizar('segundosPorPregunta', e.target.value)}
            />
          </div>
        ) : (
          <div className="campo-formulario">
            <label htmlFor="cj-duracion-total">Duración total de la sesión (minutos)</label>
            <input
              id="cj-duracion-total"
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
        <button type="submit" className="boton-dorado" disabled={enviando}>
          {enviando ? 'Creando...' : 'Crear juego'}
        </button>
        {error && <p className="mensaje-error">{error}</p>}
      </form>

      {juegoRecienCreado && (
        <div className="caja-codigo-generado">
          <p className="etiqueta-codigo-generado">Código del juego</p>
          <p className="codigo-generado">{juegoRecienCreado.codigo}</p>
          <p className="ayuda-codigo-generado">Compártelo con tus estudiantes. Ahora carga sus preguntas:</p>
          <button type="button" className="boton-secundario boton-chico" onClick={cargarBancoDemo} disabled={importando}>
            Usar banco demo (100 preguntas)
          </button>{' '}
          <button type="button" className="boton-secundario boton-chico" onClick={descargarPlantillaCsv}>
            Descargar plantilla CSV
          </button>{' '}
          <label className="boton-secundario boton-chico boton-archivo">
            {importando ? 'Subiendo...' : 'Subir preguntas (CSV)'}
            <input type="file" accept=".csv" className="oculto" onChange={subirArchivo} disabled={importando} />
          </label>{' '}
          <button
            type="button"
            className="boton-secundario boton-chico"
            onClick={generarConIA}
            disabled={generandoIA || !juegoRecienCreado.tematica}
            title={!juegoRecienCreado.tematica ? 'Agrega una temática para poder generar con IA' : undefined}
          >
            {generandoIA ? 'Generando...' : '✨ Crear preguntas con IA'}
          </button>
          {mensajeImport && (
            <p className={`mensaje-import ${mensajeImport.error ? 'error' : 'exito'}`}>{mensajeImport.texto}</p>
          )}
        </div>
      )}
    </div>
  );
}
