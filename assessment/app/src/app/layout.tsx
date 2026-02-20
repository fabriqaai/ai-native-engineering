import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI-Native Engineering Maturity Assessment",
  description:
    "Discover your AI-native engineering archetype in 3 minutes — 14 behavioral questions, personalized results, and a shareable maturity card.",
  openGraph: {
    title: "AI-Native Engineering Maturity Assessment",
    description:
      "14 questions. 3 minutes. Discover your AI-native engineering archetype.",
    url: "https://assessment.ainative.engineering",
    siteName: "AI-Native Engineering",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI-Native Engineering Maturity Assessment",
    description:
      "14 questions. 3 minutes. Discover your AI-native engineering archetype.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
