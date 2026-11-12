/**
 * Zustand store for global wallet / Web3 state
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { connectWallet, getConnectedAccount, getChainId, switchToSepolia, subscribeToWalletEvents } from '@/utils/web3'
import { APP_CONFIG } from '@/utils/constants'
import toast from 'react-hot-toast'

const useWalletStore = create(
  persist(
    (set, get) => ({
      // ── State ──────────────────────────────────────────────────────────────
      address:        null,
      chainId:        null,
      isConnecting:   false,
      isConnected:    false,
      isWrongNetwork: false,
      accessToken:    null,
      user:           null,

      // ── Actions ────────────────────────────────────────────────────────────
      connect: async () => {
        set({ isConnecting: true })
        try {
          const address = await connectWallet()
          const chainId = await getChainId()
          const isWrongNetwork = chainId !== APP_CONFIG.chainId

          set({ address, chainId, isConnected: true, isWrongNetwork, isConnecting: false })

          if (isWrongNetwork) {
            toast.error(`Vui lòng chuyển sang mạng Sepolia`)
          }

          // Set up event subscriptions
          subscribeToWalletEvents({
            onAccountsChanged: (accounts) => {
              if (accounts.length === 0) get().disconnect()
              else set({ address: accounts[0] })
            },
            onChainChanged: (newChainId) => {
              set({ chainId: newChainId, isWrongNetwork: newChainId !== APP_CONFIG.chainId })
            },
          })

          return address
        } catch (error) {
          set({ isConnecting: false })
          toast.error(error.message || 'Không thể kết nối ví')
          throw error
        }
      },

      switchNetwork: async () => {
        try {
          await switchToSepolia()
          const chainId = await getChainId()
          set({ chainId, isWrongNetwork: false })
          toast.success('Đã chuyển sang mạng Sepolia')
        } catch (error) {
          toast.error('Không thể chuyển mạng: ' + error.message)
        }
      },

      disconnect: () => {
        set({ address: null, chainId: null, isConnected: false, isWrongNetwork: false, accessToken: null, user: null })
        localStorage.removeItem('sbt_access_token')
        toast.success('Đã ngắt kết nối ví')
      },

      setAuth: (token, user) => {
        set({ accessToken: token, user })
        localStorage.setItem('sbt_access_token', token)
      },

      // Try reconnecting on page load
      init: async () => {
        const existing = await getConnectedAccount()
        if (existing) {
          const chainId = await getChainId()
          set({ address: existing, chainId, isConnected: true, isWrongNetwork: chainId !== APP_CONFIG.chainId })
        }
      },
    }),
    {
      name: 'sbt-wallet-store',
      partialize: (state) => ({ address: state.address, accessToken: state.accessToken, user: state.user }),
    }
  )
)

export default useWalletStore
