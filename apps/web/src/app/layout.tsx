import type { Metadata } from "next";
import { Martian_Mono, Mukta, Rozha_One } from "next/font/google";
import "./globals.css";

const rozhaOne = Rozha_One({ weight: "400", subsets: ["latin", "devanagari"], variable: "--font-rozha" });
const mukta = Mukta({ weight: ["400", "500", "600", "700", "800"], subsets: ["latin", "devanagari"], variable: "--font-mukta" });
const martianMono = Martian_Mono({ subsets: ["latin"], variable: "--font-martian-mono" });

export const metadata: Metadata = {
  title: "Chukta — fees, settled",
  description:
    "Fee management for tuition classes and coaching centres. Automatic WhatsApp reminders with UPI links, and fees marked paid the moment the money lands.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${rozhaOne.variable} ${mukta.variable} ${martianMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
