'use client';

function formatearFecha(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-CO') + ' ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

// Genera el PDF de resultados 100% en el navegador (sin ir al servidor)
// a partir de los datos ya cargados en el modal, y dispara la descarga.
// jsPDF (~150kB) se carga solo cuando esta función se llama de verdad
// (import dinámico), en vez de ir en el bundle principal del panel que
// todo profesor descarga aunque nunca use esta función.
export async function generarPdfResultados(juego, resultados) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);

  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text('Resultados - ¿Quién Sabe Más?', 14, 18);
  doc.setFontSize(11);
  doc.text(`Juego: ${juego.nombreJuego} (${juego.codigo})`, 14, 26);
  doc.text(`Generado: ${formatearFecha(new Date().toISOString())}`, 14, 32);

  autoTable(doc, {
    startY: 38,
    head: [['Estudiante', 'Puntaje', 'Resultado', 'Fecha']],
    body: resultados.map((r) => [r.nombreEstudiante, `${r.puntaje} / ${r.totalPreguntas}`, r.resultado, formatearFecha(r.fecha)]),
  });

  doc.save(`resultados_${juego.codigo}.pdf`);
}
