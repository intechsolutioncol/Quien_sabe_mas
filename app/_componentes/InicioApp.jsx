'use client';

import { useState } from 'react';
import PantallaRol from './PantallaRol';
import PantallaIngresoEstudiante from './PantallaIngresoEstudiante';
import PantallaJuego from './PantallaJuego';
import PantallaFinal from './PantallaFinal';

// Orquestador del lado "estudiante" (equivalente al router de pantallas
// de script.html, sin el modo "en vivo" todavía). El rol "profesor" vive
// aparte, en /profesor/*.
export default function InicioApp() {
  const [pantalla, setPantalla] = useState('rol');
  const [datosPartida, setDatosPartida] = useState(null);
  const [resultadoFinal, setResultadoFinal] = useState(null);

  function manejarIngreso(datos) {
    setDatosPartida(datos);
    setPantalla('juego');
  }

  function manejarFinal(resultado) {
    setResultadoFinal(resultado);
    setPantalla('final');
  }

  function jugarDeNuevo() {
    setDatosPartida(null);
    setResultadoFinal(null);
    setPantalla('ingreso');
  }

  if (pantalla === 'rol') {
    return <PantallaRol onElegirEstudiante={() => setPantalla('ingreso')} />;
  }

  if (pantalla === 'ingreso') {
    return <PantallaIngresoEstudiante onVolver={() => setPantalla('rol')} onIngreso={manejarIngreso} />;
  }

  if (pantalla === 'juego' && datosPartida) {
    return <PantallaJuego datos={datosPartida} onTerminar={manejarFinal} />;
  }

  if (pantalla === 'final' && resultadoFinal) {
    return (
      <PantallaFinal resultado={resultadoFinal} nombreJugador={datosPartida?.nombreJugador} onJugarDeNuevo={jugarDeNuevo} />
    );
  }

  return <PantallaRol onElegirEstudiante={() => setPantalla('ingreso')} />;
}
