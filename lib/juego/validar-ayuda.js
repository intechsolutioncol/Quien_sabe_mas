// Port de validarAyuda_ de Code.js. Se usa tanto para el modo individual
// (columnas snake_case de sesiones_individuales) como en vivo.
export function validarAyuda(estado, nombreAyuda) {
  if (!estado || estado.terminado) {
    throw new Error('La partida no está activa.');
  }
  if (!estado.ayudas_activas || !estado.ayudas_activas[nombreAyuda]) {
    throw new Error('Esta ayuda no está disponible en este juego.');
  }
  if (estado.ayudas_usadas[nombreAyuda]) {
    throw new Error('Esa ayuda ya fue utilizada en esta partida.');
  }
}
