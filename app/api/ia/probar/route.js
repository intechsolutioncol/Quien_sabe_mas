import { NextResponse } from 'next/server';
import { requerirProfesor } from '@/lib/auth/requerir-profesor';
import { probarConexionIA } from '@/lib/juego/gemini';

// Chequeo rápido para el panel docente (equivalente a probarConexionIA de Code.js).
export async function GET() {
  const user = await requerirProfesor();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const resultado = await probarConexionIA();
  return NextResponse.json(resultado);
}
