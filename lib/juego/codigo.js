// Port de generarCodigoJuego_ de Datos.js: código de 6 caracteres sin 0/O/1/I/L
// (para evitar confusiones al dictarlo en clase), verificando unicidad en la
// tabla juegos con el cliente admin (service role).
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export async function generarCodigoJuego(supabaseAdmin) {
  let codigo;
  let existe = true;
  while (existe) {
    codigo = '';
    for (let i = 0; i < 6; i++) {
      codigo += ALFABETO.charAt(Math.floor(Math.random() * ALFABETO.length));
    }
    const { data, error } = await supabaseAdmin
      .from('juegos')
      .select('codigo')
      .eq('codigo', codigo)
      .maybeSingle();
    if (error) throw new Error(error.message);
    existe = !!data;
  }
  return codigo;
}
