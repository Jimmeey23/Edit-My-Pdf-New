import type { Metadata } from "next";
import { Inter, Montserrat, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  style: ["italic", "normal"],
});

// Agrandir is a commercial font — we use Inter 900 as the closest web equivalent.
// The CSS variable --font-agrandir maps to Inter with a heavy weight fallback.
const agrandir = Inter({
  variable: "--font-agrandir",
  subsets: ["latin"],
  weight: ["900"],
});

export const metadata: Metadata = {
  title: "Schedule Studio — Inline schedule editor",
  description: "Upload a PDF schedule and edit the text inline — click any text to edit it, or chat to change it. The layout never changes.",
  keywords: ["schedule", "editor", "inline", "PDF", "studio"],
  authors: [{ name: "Z.ai Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${montserrat.variable} ${playfair.variable} ${agrandir.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
