import { create } from 'zustand'
import {
  connectWallet,
  getConnectedAccount,
  getChainId,
  switchToSepolia,
  subscribeToWalletEvents,
} from '@/utils/web3'
import { APP_CONFIG } from '@/utils/constants'
import { errorMessage } from '@/utils/errors'

const disconnected = {
  address: null,
  chainId: null,
  isConnected: false,
  isWrongNetwork: false,
}
let generation = 0
const useWalletStore = create((set, get) => ({
  ...disconnected,
  isConnecting: false,
  error: '',
  refresh: async () => {
    const version = ++generation
    try {
      const [address, chainId] = await Promise.all([
        getConnectedAccount(),
        getChainId(),
      ])
      if (version !== generation) return
      set({
        address,
        chainId,
        isConnected: Boolean(address),
        isWrongNetwork: Boolean(address) && chainId !== APP_CONFIG.chainId,
      })
    } catch (error) {
      if (version === generation) throw error
    }
  },
  connect: async () => {
    if (get().isConnecting) return
    set({ isConnecting: true, error: '' })
    try {
      const address = await connectWallet()
      await get().refresh()
      if (get().isWrongNetwork) await get().switchNetwork()
      return address
    } catch (error) {
      set({ error: errorMessage(error) })
      throw error
    } finally {
      set({ isConnecting: false })
    }
  },
  switchNetwork: async () => {
    try {
      await switchToSepolia()
      await get().refresh()
      set({ error: '' })
    } catch (error) {
      set({ error: errorMessage(error) })
      throw error
    }
  },
  disconnect: () => {
    generation++
    set({ ...disconnected, error: '' })
  },
  init: () => {
    const unsubscribe = subscribeToWalletEvents({
      onAccountsChanged: (accounts) => {
        generation++
        set({
          address: accounts[0] || null,
          isConnected: Boolean(accounts[0]),
          error: '',
        })
        get()
          .refresh()
          .catch((error) =>
            set({ ...disconnected, error: errorMessage(error) }),
          )
      },
      onChainChanged: (chainId) => {
        generation++
        set({
          chainId,
          isWrongNetwork:
            Boolean(get().address) && chainId !== APP_CONFIG.chainId,
        })
        get()
          .refresh()
          .catch((error) =>
            set({ ...disconnected, error: errorMessage(error) }),
          )
      },
      onDisconnect: () => get().disconnect(),
    })
    get()
      .refresh()
      .catch((error) => set({ ...disconnected, error: errorMessage(error) }))
    return unsubscribe
  },
}))
export default useWalletStore
