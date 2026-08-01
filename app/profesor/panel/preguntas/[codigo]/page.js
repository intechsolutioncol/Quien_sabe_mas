import { notFound } from 'next/navigation';
import Link from 'next/link';
import { crearClienteServidor } from '@/lib/supabase/server';
import EditorPreguntas from './EditorPreguntas';

// RLS ya garantiza que solo se vea el juego si pertenece al profesor
// autenticado (misma política que protege /api/juegos/*).
export default async function PaginaEditarPreguntas({ params }) {
  const { codigo } = await params;
  const codigoNormalizado = codigo.toUpperCase();

  const supabase = await crearClienteServidor();
  const { data: juego } = await supabase
    .from('juegos')
    .select('codigo, nombre_juego, tematica')
    .eq('codigo', codigoNormalizado)
    .maybeSingle();
  if (!juego) notFound();

  return (
    <main className="pantalla activa">
      <div className="contenedor-panel">
        <header className="cabecera-panel">
          <h1 className="titulo-panel">Preguntas de &quot;{juego.nombre_juego}&quot;</h1>
          <Link href="/profesor/panel" className="boton-secundario boton-chico">
            &larr; Volver al panel
          </Link>
        </header>
        <EditorPreguntas codigo={juego.codigo} />
      </div>
    </main>
  );
}
