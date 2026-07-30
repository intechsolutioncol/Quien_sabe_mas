'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { registrarse } from '../auth-actions';

export default function PaginaRegistroDocente() {
  const [estado, accion, enviando] = useActionState(registrarse, null);

  if (estado?.exito) {
    return (
      <main className="pantalla activa">
        <div className="contenedor-inicio">
          <h1 className="logo-juego logo-chico">Cuenta creada</h1>
          <p className="subtitulo-inicio">{estado.mensaje}</p>
          <Link href="/profesor/login" className="boton-dorado boton-rol">Ir a ingresar</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="pantalla activa">
      <div className="contenedor-inicio">
        <h1 className="logo-juego logo-chico">Crear cuenta de profesor</h1>
        <p className="subtitulo-inicio">Regístrate para crear y administrar tus juegos</p>

        <form action={accion} className="tarjeta-inicio">
          <label className="etiqueta-nombre" htmlFor="nombre">Tu nombre</label>
          <input id="nombre" name="nombre" type="text" maxLength={60} required autoComplete="name" />

          <label className="etiqueta-nombre" htmlFor="email">Correo</label>
          <input id="email" name="email" type="email" required autoComplete="email" />

          <label className="etiqueta-nombre" htmlFor="password">Contraseña (mínimo 8 caracteres)</label>
          <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />

          <button type="submit" className="boton-dorado" disabled={enviando}>
            {enviando ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>

          {estado?.error && <p className="mensaje-error">{estado.error}</p>}
        </form>

        <p className="reglas-inicio">
          ¿Ya tienes cuenta? <Link href="/profesor/login">Ingresar</Link>
        </p>
      </div>
    </main>
  );
}
