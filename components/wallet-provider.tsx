"use client";

import { BrowserProvider } from "ethers";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

type WalletContextValue = {
  account: string | null;
  isConnecting: boolean;
  error: string | null;
  connectWallet: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [account, setAccount] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum) return;

    const syncAccount = async () => {
      const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
      setAccount(accounts[0] ?? null);
    };

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setAccount(accounts[0] ?? null);
      setError(null);
    };

    void syncAccount().catch(() => setAccount(null));
    ethereum.on?.("accountsChanged", handleAccountsChanged);

    return () => ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
  }, []);

  const connectWallet = useCallback(async () => {
    const ethereum = window.ethereum;
    if (!ethereum) {
      setError("MetaMask is not installed.");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const provider = new BrowserProvider(ethereum);
      const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
      setAccount(accounts[0] ?? null);
    } catch (connectionError) {
      if (connectionError instanceof Error && connectionError.message) {
        setError(connectionError.message);
      } else {
        setError("Unable to connect wallet.");
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const value = useMemo(
    () => ({ account, isConnecting, error, connectWallet }),
    [account, isConnecting, error, connectWallet],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within a WalletProvider");
  return context;
}
