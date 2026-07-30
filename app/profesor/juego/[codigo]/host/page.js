import HostVivo from './HostVivo';

export default async function PaginaHostVivo({ params }) {
  const { codigo } = await params;
  return <HostVivo codigo={codigo.toUpperCase()} />;
}
