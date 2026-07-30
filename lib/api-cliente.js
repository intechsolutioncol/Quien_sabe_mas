'use client';

// Helper compartido para llamar a nuestras propias Route Handlers desde
// componentes cliente. Lanza un Error con el mensaje que devuelve el
// servidor para que sea fácil de mostrar en pantalla.
export async function llamarApi(url, opciones) {
  const respuesta = await fetch(url, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', ...(opciones && opciones.headers) },
  });
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new Error((cuerpo && cuerpo.error) || `Error inesperado (${respuesta.status}).`);
  }
  return cuerpo;
}
