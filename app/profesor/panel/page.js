import { crearClienteServidor } from '@/lib/supabase/server';
import { cerrarSesion } from '../auth-actions';

export default async function PaginaPanelDocente() {
  const supabase = await crearClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="pantalla activa">
      <div className="contenedor-panel">
        <header className="cabecera-panel">
          <h1 className="titulo-panel">Panel del profesor</h1>
          <form action={cerrarSesion}>
            <button type="submit" className="boton-secundario boton-chico">Cerrar sesión</button>
          </form>
        </header>

        <div className="tarjeta-panel">
          <p>Sesión activa: <strong>{user?.email}</strong></p>
          <p className="mensaje-vacio">
            El panel para crear y administrar juegos se agrega en la siguiente fase de la migración.
          </p>
        </div>
      </div>
    </main>
  );
}
