'use client';

import { llamarApi } from '@/lib/api-cliente';

function describirTiempo(juego) {
  return juego.modoTiempo === 'total'
    ? `⏱ ${Math.round(juego.duracionTotalSegundos / 60)} min totales`
    : `⏱ ${juego.segundosPorPregunta}s/pregunta`;
}

export default function TablaJuegos({ juegos, onCambio, onEditar, onCargarPreguntas, onVerResultados }) {
  async function alternarActivo(juego) {
    try {
      await llamarApi(`/api/juegos/${juego.codigo}/activo`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !juego.activo }),
      });
      onCambio();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }

  function copiarCodigo(codigo) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(codigo);
    }
  }

  if (juegos.length === 0) {
    return <p className="mensaje-vacio">Todavía no has creado ningún juego.</p>;
  }

  return (
    <div className="tabla-scroll">
      <table className="tabla-juegos">
        <thead>
          <tr>
            <th>Juego</th>
            <th>Código</th>
            <th>Temática</th>
            <th>Preguntas</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {juegos.map((juego) => (
            <tr key={juego.codigo}>
              <td>
                {juego.nombreJuego}
                <br />
                <small>{describirTiempo(juego)}</small>
              </td>
              <td>
                <strong>{juego.codigo}</strong>
              </td>
              <td>{juego.tematica || '-'}</td>
              <td>
                {juego.preguntasCargadas} / {juego.cantidadPreguntas}
              </td>
              <td>
                <span className={`badge-estado ${juego.activo ? 'activo' : 'inactivo'}`}>
                  {juego.activo ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td className="celda-acciones">
                <button type="button" className="boton-mini" onClick={() => onEditar(juego)}>
                  Editar
                </button>
                <button type="button" className="boton-mini" onClick={() => onCargarPreguntas(juego)}>
                  Preguntas
                </button>
                <button type="button" className="boton-mini" onClick={() => onVerResultados(juego)}>
                  Resultados
                </button>
                <button type="button" className="boton-mini" onClick={() => alternarActivo(juego)}>
                  {juego.activo ? 'Desactivar' : 'Activar'}
                </button>
                <button type="button" className="boton-mini" onClick={() => copiarCodigo(juego.codigo)}>
                  Copiar código
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
