'use client';

// Port de construirEscalera/resaltarEscalonActual/marcarEscalon de
// script.html: la lista lateral de progreso (sin premios en dinero).
export default function Escalera({ escalones }) {
  return (
    <aside className="escalera">
      <h2 className="escalera-titulo">Progreso</h2>
      <ol className="escalera-lista">
        {escalones.map((e) => (
          <li key={e.numero} className={`escalera-item ${e.estado !== 'pendiente' ? e.estado : ''}`}>
            <span>Pregunta {e.numero}</span>
            <span className="escalon-marca">{e.estado === 'correcta' ? '✔' : e.estado === 'incorrecta' ? '✘' : ''}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
