import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/navbar";
import { WalletProvider } from "@/components/wallet-provider";

export const metadata: Metadata = {
  title: "Gather — your moments, onchain",
  description: "A home for the moments you collected onchain.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink antialiased">
        <WalletProvider>
          <Navbar />
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
