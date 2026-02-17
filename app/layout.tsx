import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "./components/Navbar";
import MarketWatch from "./components/MarketWatch";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NextTrade Pro",
  description: "Advanced Paper Trading Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col h-screen overflow-hidden bg-[#f4f6f8] text-[#444] selection:bg-blue-100 selection:text-blue-900`}
      >
        <Navbar />
        {/* Main Application Shell - Centered, Fixed Height below Navbar */}
        <div className="flex h-[calc(100vh-60px)] w-full max-w-[1600px] mx-auto bg-white shadow-[0_0_15px_rgba(0,0,0,0.02)] border-x border-[#e0e0e0] relative">

          {/* Sidebar: Market Watch */}
          <MarketWatch />

          {/* Content Area */}
          <main className="flex-1 h-full overflow-hidden bg-[#fbfbfb] relative">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
