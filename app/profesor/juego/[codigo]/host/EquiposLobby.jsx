'use client';

import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';

function TarjetaJugador({ jugador, onExpulsar }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: jugador.sessionId });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: isDragging ? 10 : undefined }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} className={`chip-jugador chip-arrastrable ${isDragging ? 'chip-arrastrando' : ''}`}>
      <span {...listeners} {...attributes} className="chip-jugador-agarre">
        {jugador.nombre}
      </span>
      <button
        type="button"
        className="chip-jugador-expulsar"
        title={`Expulsar a ${jugador.nombre}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onExpulsar(jugador)}
      >
        🗑️
      </button>
    </div>
  );
}

function ColumnaEquipo({ id, titulo, jugadores, onExpulsar }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`columna-equipo ${isOver ? 'columna-equipo-sobre' : ''}`}>
      <h3 className="columna-equipo-titulo">{titulo}</h3>
      <div className="columna-equipo-jugadores">
        {jugadores.map((j) => (
          <TarjetaJugador key={j.sessionId} jugador={j} onExpulsar={onExpulsar} />
        ))}
        {jugadores.length === 0 && <p className="columna-equipo-vacia">Arrastra aquí</p>}
      </div>
    </div>
  );
}

// Lobby con arrastrar-y-soltar para armar equipos antes de iniciar. Los
// jugadores sin equipo caen en "Sin asignar"; el profesor los arrastra a
// la columna que quiera, o usa "Formar equipos al azar" para repartirlos
// solo de forma balanceada.
export default function EquiposLobby({ codigo, cantidadEquipos, jugadores, onAsignar, onFormarAleatorio, onExpulsar }) {
  function manejarDragEnd(evento) {
    const { active, over } = evento;
    if (!over) return;
    const equipo = over.id === 'sin-asignar' ? null : parseInt(String(over.id).replace('equipo-', ''), 10);
    onAsignar(active.id, equipo);
  }

  const equipos = Array.from({ length: cantidadEquipos }, (_, i) => i + 1);

  return (
    <div className="equipos-lobby">
      <button type="button" className="boton-secundario boton-chico" onClick={onFormarAleatorio}>
        🎲 Formar equipos al azar
      </button>
      <DndContext onDragEnd={manejarDragEnd}>
        <div className="columnas-equipos">
          <ColumnaEquipo
            id="sin-asignar"
            titulo="Sin asignar"
            jugadores={jugadores.filter((j) => !j.equipo)}
            onExpulsar={onExpulsar}
          />
          {equipos.map((n) => (
            <ColumnaEquipo
              key={n}
              id={`equipo-${n}`}
              titulo={`Equipo ${n}`}
              jugadores={jugadores.filter((j) => j.equipo === n)}
              onExpulsar={onExpulsar}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
