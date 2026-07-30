import { NextResponse } from 'next/server';
import { crearClienteAdmin } from '@/lib/supabase/admin';

// Equivalente a responderPreguntaVivo de Vivo.js. La corrección (si
// acertó, cuántos puntos ganó, su posición) llega al estudiante en el
// siguiente sondeo a /api/vivo/mi-estado, disparado por el evento de
// Realtime que anuncia el cambio a "revelando" — nunca en esta misma
// respuesta, para no revelar nada antes de tiempo.
export async function POST(request) {
  const { codigo, sessionId, opcion } = await request.json();
  const codigoNormalizado = (codigo || '').toString().trim().toUpperCase();
  const admin = crearClienteAdmin();

  const { error } = await admin.rpc('vivo_responder', {
    p_codigo: codigoNormalizado,
    p_session_id: sessionId,
    p_opcion: opcion,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  return NextResponse.json({ registrada: true });
}
