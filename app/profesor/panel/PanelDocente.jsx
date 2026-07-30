'use client';

import { useCallback, useEffect, useState } from 'react';
import { llamarApi } from '@/lib/api-cliente';
import BotonProbarIA from './BotonProbarIA';
import FormularioCrearJuego from './FormularioCrearJuego';
import TablaJuegos from './TablaJuegos';
import ModalEditarJuego from './ModalEditarJuego';
import ModalCargarPreguntas from './ModalCargarPreguntas';
import ModalResultados from './ModalResultados';

export default function PanelDocente() {
  const [juegos, setJuegos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [juegoEnEdicion, setJuegoEnEdicion] = useState(null);
  const [juegoParaPreguntas, setJuegoParaPreguntas] = useState(null);
  const [juegoParaResultados, setJuegoParaResultados] = useState(null);

  const cargarListaJuegos = useCallback(() => {
    setCargando(true);
    llamarApi('/api/juegos')
      .then((datos) => {
        setJuegos(datos);
        setError('');
      })
      .catch((err) => setError(`No se pudo cargar la lista de juegos: ${err.message}`))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargarListaJuegos();
  }, [cargarListaJuegos]);

  return (
    <>
      <div className="tarjeta-panel">
        <h2 className="subtitulo-panel">Conexión con la IA</h2>
        <BotonProbarIA />
      </div>

      <FormularioCrearJuego onJuegoCreado={cargarListaJuegos} />

      <div className="tarjeta-panel">
        <h2 className="subtitulo-panel">Mis juegos</h2>
        {error && <p className="mensaje-error">{error}</p>}
        {cargando ? (
          <p className="mensaje-vacio">Cargando...</p>
        ) : (
          <TablaJuegos
            juegos={juegos}
            onCambio={cargarListaJuegos}
            onEditar={setJuegoEnEdicion}
            onCargarPreguntas={setJuegoParaPreguntas}
            onVerResultados={setJuegoParaResultados}
          />
        )}
      </div>

      {juegoEnEdicion && (
        <ModalEditarJuego
          juego={juegoEnEdicion}
          onCerrar={() => setJuegoEnEdicion(null)}
          onGuardado={() => {
            setJuegoEnEdicion(null);
            cargarListaJuegos();
          }}
        />
      )}

      {juegoParaPreguntas && (
        <ModalCargarPreguntas
          juego={juegoParaPreguntas}
          onCerrar={() => setJuegoParaPreguntas(null)}
          onCambio={cargarListaJuegos}
        />
      )}

      {juegoParaResultados && <ModalResultados juego={juegoParaResultados} onCerrar={() => setJuegoParaResultados(null)} />}
    </>
  );
}
