import type { Metadata } from "next";
import { Libre_Baskerville, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const serif = Libre_Baskerville({
  subsets: ["latin"], weight: ["400", "700"],
  variable: "--font-serif", display: "swap",
});
const sans = IBM_Plex_Sans({
  subsets: ["latin"], weight: ["400", "500", "600", "700"],
  variable: "--font-sans", display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"], weight: ["400", "600", "700"],
  variable: "--font-mono", display: "swap",
});

export const metadata: Metadata = {
  title:       "Soraya & Leonardo Tours — eCF",
  description: "Sistema de Facturación Electrónica · Soraya y Leonardo Tours SRL",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}