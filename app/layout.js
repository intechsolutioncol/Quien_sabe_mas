import "./globals.css";

export const metadata = {
  title: "¿Quién Sabe Más?",
  description: "La plataforma de trivia estilo \"Millonario\" para el salón de clase",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <div className="fondo-estrellas" />
        {children}
      </body>
    </html>
  );
}
