'use client';

// Port del modal "Llamada a un amigo" de index.html/script.html.
export default function ModalLlamada({ segundos, texto, onCerrar }) {
  return (
    <div className="modal">
      <div className="modal-caja">
        <h3>Llamando a tu amigo...</h3>
        <div className="modal-cronometro">{segundos}</div>
        <p className="modal-texto">{texto}</p>
        <button className="boton-dorado boton-cerrar-modal" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
