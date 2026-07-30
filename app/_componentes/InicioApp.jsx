'use client';

import { useState } from 'react';
import PantallaRol from './PantallaRol';
import PantallaIngresoEstudiante from './PantallaIngresoEstudiante';
import PantallaJuego from './PantallaJuego';
import PantallaFinal from './PantallaFinal';
import PantallaLobbyVivo from './PantallaLobbyVivo';
import PantallaJuegoVivo from './PantallaJuegoVivo';
import PantallaFinalVivo from './PantallaFinalVivo';

// Orquestador del lado "estudiante" (equivalente al router de pantallas
// de script.html). El rol "profesor" vive aparte, en /profesor/*.
export default function InicioApp() {
  const [pantalla, setPantalla] = useState('rol');
  const [datosPartida, setDatosPartida] = useState(null);
  const [estadoVivoInicial, setEstadoVivoInicial] = useState(null);
  const [resultadoFinal, setResultadoFinal] = useState(null);

  function manejarIngreso(datos) {
    setDatosPartida(datos);
    setPantalla(datos.modo === 'vivo' ? 'lobby-vivo' : 'juego');
  }

  function manejarEmpezarVivo(estadoInicial) {
    setEstadoVivoInicial(estadoInicial);
    setPantalla('juego-vivo');
  }

  function manejarFinal(resultado) {
    setResultadoFinal(resultado);
    setPantalla('final');
  }

  function manejarFinalVivo(resultado) {
    setResultadoFinal(resultado);
    setPantalla('final-vivo');
  }

  function jugarDeNuevo() {
    setDatosPartida(null);
    setEstadoVivoInicial(null);
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

  if (pantalla === 'lobby-vivo' && datosPartida) {
    return <PantallaLobbyVivo datos={datosPartida} onEmpezar={manejarEmpezarVivo} />;
  }

  if (pantalla === 'juego-vivo' && datosPartida && estadoVivoInicial) {
    return <PantallaJuegoVivo datos={datosPartida} estadoInicial={estadoVivoInicial} onFinal={manejarFinalVivo} />;
  }

  if (pantalla === 'final' && resultadoFinal) {
    return (
      <PantallaFinal resultado={resultadoFinal} nombreJugador={datosPartida?.nombreJugador} onJugarDeNuevo={jugarDeNuevo} />
    );
  }

  if (pantalla === 'final-vivo' && resultadoFinal) {
    return (
      <PantallaFinalVivo resultado={resultadoFinal} nombreJugador={datosPartida?.nombreJugador} onJugarDeNuevo={jugarDeNuevo} />
    );
  }

  return <PantallaRol onElegirEstudiante={() => setPantalla('ingreso')} />;
}
