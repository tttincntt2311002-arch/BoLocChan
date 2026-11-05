"use client";

import Link from "next/link";
import { useWallet } from "@/components/wallet-provider";

function Mark() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-leaf">
      <svg viewBox="0 0 24 24" fill="none" className="h-[21px] w-[21px]" aria-hidden="true">
        <path d="M12 3.5 19.4 7v5.1c0 4.4-3.1 7.2-7.4 8.8-4.3-1.6-7.4-4.4-7.4-8.8V7L12 3.5Z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8.7 12.2 11 14.5l4.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function Navbar() {
  const { account, connectWallet, isConnecting, error } = useWallet();
  const walletLabel = account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "Connect wallet";

  return (
    <header className="border-b border-black/[0.06] bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Gather home">
          <Mark />
          <span className="text-[19px] font-semibold tracking-[-0.06em]">gather<span className="text-[#9ccf3f]">.</span></span>
        </Link>
        <nav className="hidden items-center gap-8 text-[13px] font-medium text-muted sm:flex" aria-label="Main navigation">
          <Link href="/" className="text-ink transition hover:text-[#7ca52e]">My collection</Link>
          <a href="#about" className="transition hover:text-ink">Discover</a>
          <Link href="/admin" className="transition hover:text-ink">Admin</Link>
        </nav>
        <button type="button" onClick={() => void connectWallet()} disabled={isConnecting} title={error ?? undefined} aria-label={account ? `Connected wallet ${account}` : "Connect wallet"} className="flex items-center gap-2 rounded-full bg-ink px-4 py-[11px] text-[12px] font-semibold text-white transition hover:bg-[#343a31] disabled:cursor-wait disabled:opacity-70 sm:px-5 sm:text-[13px]">
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true"><path d="M3.2 6.3h11.2a2 2 0 0 1 2 2v6.1H4.6a2 2 0 0 1-2-2V5.2a2 2 0 0 1 2-2h9.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M13.8 9.2h3.1v3h-3.1a1.5 1.5 0 0 1 0-3Z" stroke="currentColor" strokeWidth="1.5"/></svg>
          <span>{isConnecting ? "Connecting..." : walletLabel}</span>
        </button>
      </div>
    </header>
  );
}
