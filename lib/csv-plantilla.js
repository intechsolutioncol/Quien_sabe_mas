'use client';

// Port literal de descargarPlantillaCsv() de script.html: genera la
// plantilla 100% en el navegador, sin ir al servidor.
export function descargarPlantillaCsv() {
  const filas = [
    ['Nivel', 'Pregunta', 'Opcion A', 'Opcion B', 'Opcion C', 'Opcion D', 'Respuesta Correcta (A, B, C o D)'],
    ['1', '¿Cuánto es 2 + 2? (ejemplo nivel muy fácil)', '3', '4', '5', '6', 'B'],
    ['2', 'Ejemplo de pregunta nivel fácil...', 'Opción A', 'Opción B', 'Opción C', 'Opción D', 'A'],
    ['3', 'Ejemplo de pregunta nivel medio...', 'Opción A', 'Opción B', 'Opción C', 'Opción D', 'C'],
    ['4', 'Ejemplo de pregunta nivel difícil...', 'Opción A', 'Opción B', 'Opción C', 'Opción D', 'D'],
    ['5', 'Ejemplo de pregunta nivel muy difícil...', 'Opción A', 'Opción B', 'Opción C', 'Opción D', 'A'],
  ];
  const csv = filas
    .map((fila) =>
      fila
        .map((valor) => {
          const texto = String(valor);
          return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
        })
        .join(',')
    )
    .join('\r\n');

  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = 'plantilla_preguntas_quien_sabe_mas.csv';
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

export function leerArchivoComoTexto(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = (e) => resolve(e.target.result);
    lector.onerror = reject;
    lector.readAsText(archivo, 'UTF-8');
  });
}
