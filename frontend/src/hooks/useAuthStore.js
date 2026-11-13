import { create } from 'zustand'
import api from '../utils/api'
import {
  clearToken,
  readToken,
  saveToken,
  SESSION_EXPIRED_EVENT,
  TOKEN_KEY,
} from '../utils/session'

let generation = 0
let pendingRestore = null

const useAuthStore = create((set) => ({
  user: null,
  status: readToken() ? 'checking' : 'anonymous',

  login: async (email, password) => {
    const version = ++generation
    const { data } = await api.post(
      '/auth/login',
      { email, password },
      { skipAuth: true },
    )
    if (version !== generation) throw new Error('Session changed')
    saveToken(data.access_token)
    set({ user: data.user, status: 'authenticated' })
    return data.user
  },

  register: (payload) =>
    api.post('/auth/register', payload, { skipAuth: true }),

  restore: () => {
    const token = readToken()
    if (!token) {
      set({ user: null, status: 'anonymous' })
      return Promise.resolve()
    }
    if (
      pendingRestore?.token === token &&
      pendingRestore.version === generation
    )
      return pendingRestore.promise
    const version = ++generation
    set({ status: 'checking' })
    const promise = (async () => {
      try {
        const { data } = await api.get('/auth/me')
        if (generation === version && readToken() === token) {
          set({ user: data, status: 'authenticated' })
        }
      } catch (error) {
        if (generation !== version || readToken() !== token) return
        if (error.response?.status === 401) {
          clearToken()
          set({ user: null, status: 'anonymous' })
        } else {
          set({ user: null, status: 'error' })
        }
      } finally {
        if (pendingRestore?.promise === promise) pendingRestore = null
      }
    })()
    pendingRestore = { token, promise, version }
    return promise
  },

  updateProfile: async (payload) => {
    const version = generation
    const token = readToken()
    const { data } = await api.patch('/users/me', payload)
    if (version === generation && readToken() === token) set({ user: data })
    return data
  },

  updateWallet: async (wallet_address) => {
    const version = generation
    const token = readToken()
    const { data } = await api.put('/users/me/wallet', { wallet_address })
    if (version === generation && readToken() === token) set({ user: data })
    return data
  },

  logout: async () => {
    const version = ++generation
    const token = readToken()
    let serverRevoked = false
    try {
      if (token) {
        await api.post('/auth/logout')
        serverRevoked = true
      }
    } catch {
      // Local logout must remain possible when the backend is unavailable.
    } finally {
      if (generation === version && readToken() === token) {
        clearToken()
        set({ user: null, status: 'anonymous' })
      }
    }
    return serverRevoked
  },

  clear: () => {
    ++generation
    set({ user: null, status: 'anonymous' })
  },
}))

window.addEventListener(SESSION_EXPIRED_EVENT, () =>
  useAuthStore.getState().clear(),
)
window.addEventListener('storage', (event) => {
  if (event.key === TOKEN_KEY || event.key === null) {
    useAuthStore.getState().clear()
    if (readToken()) useAuthStore.getState().restore()
  }
})

export default useAuthStore
