// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { PreloadTesseract } from "@/components/PreloadTesseract";

export const metadata: Metadata = {
  title: "Validação de Nota Fiscal",
  description:
    "Envie uma foto da sua NF-e, extraia os dados com OCR e valide as informações.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased min-h-screen bg-slate-50">
        <div className="min-h-screen flex flex-col">
          <Navbar />
          <main className="flex-1 w-full">{children}</main>
          <footer className="py-6 text-center text-xs text-gray-500 border-t border-gray-200 bg-white">
            <div className="container mx-auto px-4">
              <p>
                © {new Date().getFullYear()} Sistema de Entrega · NF-e e Roteamento
              </p>
              <p className="mt-1 text-gray-400">
                🔒 Processamento OCR local no seu navegador - suas imagens nunca são enviadas ao servidor
              </p>
            </div>
          </footer>
        </div>
        <PreloadTesseract />
      </body>
    </html>
  );
}
