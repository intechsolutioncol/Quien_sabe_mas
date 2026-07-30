'use server';

import { redirect } from 'next/navigation';
import { crearClienteServidor } from '@/lib/supabase/server';

export async function registrarse(_prevState, formData) {
  const email = (formData.get('email') || '').toString().trim();
  const password = (formData.get('password') || '').toString();
  const nombre = (formData.get('nombre') || '').toString().trim().substring(0, 60);

  if (!email || !password) {
    return { error: 'Escribe tu correo y una contraseña.' };
  }
  if (password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre } },
  });

  if (error) {
    return { error: error.message };
  }

  if (!data.session) {
    return {
      exito: true,
      mensaje: 'Cuenta creada. Revisa tu correo para confirmarla antes de ingresar.',
    };
  }

  redirect('/profesor/panel');
}

export async function iniciarSesion(_prevState, formData) {
  const email = (formData.get('email') || '').toString().trim();
  const password = (formData.get('password') || '').toString();

  if (!email || !password) {
    return { error: 'Escribe tu correo y tu contraseña.' };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: 'Correo o contraseña incorrectos.' };
  }

  redirect('/profesor/panel');
}

export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect('/profesor/login');
}
