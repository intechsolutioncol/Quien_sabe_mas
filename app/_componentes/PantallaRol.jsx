'use client';

import Link from 'next/link';

export default function PantallaRol({ onElegirEstudiante }) {
  return (
    <section className="pantalla activa">
      <div className="contenedor-inicio">
        <h1 className="logo-juego">
          <span className="logo-signo">¿</span>QUIÉN SABE MÁS<span className="logo-signo">?</span>
        </h1>
        <p className="subtitulo-inicio">La plataforma de trivia estilo &quot;Millonario&quot; para el salón de clase</p>

        <div className="tarjeta-inicio tarjeta-rol">
          <button className="boton-dorado boton-rol" onClick={onElegirEstudiante}>
            Soy estudiante
          </button>
          <Link href="/profesor/login" className="boton-secundario boton-rol">
            Soy profesor
          </Link>
        </div>
      </div>
    </section>
  );
}
