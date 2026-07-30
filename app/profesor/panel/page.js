import { cerrarSesion } from '../auth-actions';
import PanelDocente from './PanelDocente';

export default function PaginaPanelDocente() {
  return (
    <main className="pantalla activa">
      <div className="contenedor-panel">
        <header className="cabecera-panel">
          <h1 className="titulo-panel">Panel del profesor</h1>
          <form action={cerrarSesion}>
            <button type="submit" className="boton-secundario boton-chico">Cerrar sesión</button>
          </form>
        </header>

        <PanelDocente />
      </div>
    </main>
  );
}
