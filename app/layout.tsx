import type { Metadata } from "next";
import { Manrope, Roboto } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Negócios Ativos B2B",
  description: "Negócios ativos da pipeline Funil de Vendas B2B, por Closer — PSA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} ${roboto.variable}`}>
      <body className="min-h-screen antialiased font-body bg-psa-canvas text-psa-ink">
        {children}
      </body>
    </html>
  );
}
