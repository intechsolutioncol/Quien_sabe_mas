'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { iniciarSesion } from '../auth-actions';

export default function PaginaLoginDocente() {
  const [estado, accion, enviando] = useActionState(iniciarSesion, null);

  return (
    <main className="pantalla activa">
      <div className="contenedor-inicio">
        <h1 className="logo-juego logo-chico">Panel del profesor</h1>
        <p className="subtitulo-inicio">Ingresa con tu correo y contraseña</p>

        <form action={accion} className="tarjeta-inicio">
          <label className="etiqueta-nombre" htmlFor="email">Correo</label>
          <input id="email" name="email" type="email" required autoComplete="email" />

          <label className="etiqueta-nombre" htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />

          <button type="submit" className="boton-dorado" disabled={enviando}>
            {enviando ? 'Ingresando...' : 'Ingresar'}
          </button>

          {estado?.error && <p className="mensaje-error">{estado.error}</p>}
        </form>

        <p className="reglas-inicio">
          ¿No tienes cuenta? <Link href="/profesor/registro">Crear cuenta de profesor</Link>
        </p>
      </div>
    </main>
  );
}
