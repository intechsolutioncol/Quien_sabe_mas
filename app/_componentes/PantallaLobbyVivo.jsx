'use client';

import { useEffect, useState } from 'react';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { mapearSesionVivoPublica } from '@/lib/juego/vivo-datos';
import { llamarApi } from '@/lib/api-cliente';

// Estudiante esperando en el lobby a que el profesor inicie el juego en
// vivo. En cuanto el estado pasa a "pregunta", InicioApp cambia de
// pantalla (ver el useEffect de suscripción en el propio componente
// padre); aquí solo mostramos el contador de jugadores en tiempo real.
export default function PantallaLobbyVivo({ datos, onEmpezar }) {
  const [numeroJugadores, setNumeroJugadores] = useState(1);

  useEffect(() => {
    let cancelado = false;
    llamarApi(`/api/vivo/estado?codigo=${datos.codigoJuego}`)
      .then((estado) => {
        if (cancelado) return;
        setNumeroJugadores(estado.numeroJugadores);
        if (estado.estadoJuego !== 'lobby') onEmpezar(estado);
      })
      .catch(() => {});

    const supabase = crearClienteNavegador();
    const canal = supabase
      .channel(`lobby_vivo:${datos.codigoJuego}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sesiones_vivo', filter: `codigo=eq.${datos.codigoJuego}` },
        (payload) => {
          if (cancelado || !payload.new) return;
          const estado = mapearSesionVivoPublica(payload.new);
          setNumeroJugadores(estado.numeroJugadores);
          if (estado.estadoJuego !== 'lobby') onEmpezar(estado);
        }
      )
      .subscribe();

    return () => {
      cancelado = true;
      supabase.removeChannel(canal);
    };
  }, [datos.codigoJuego, onEmpezar]);

  return (
    <section className="pantalla activa">
      <div className="contenedor-inicio">
        <h1 className="logo-juego logo-chico">{datos.nombreJuego}</h1>
        <div className="tarjeta-inicio tarjeta-lobby">
          <div className="spinner-lobby" aria-hidden="true" />
          <p className="texto-lobby">¡Ya estás dentro! Espera a que tu profesor inicie el juego.</p>
          <p className="contador-lobby">{numeroJugadores} jugador(es) conectado(s)</p>
        </div>
      </div>
    </section>
  );
}
