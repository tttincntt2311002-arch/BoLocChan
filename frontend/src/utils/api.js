/**
 * Axios instance configured for the SBT Certificate System API
 */
import axios from 'axios'
import { APP_CONFIG } from './constants'

const api = axios.create({
  baseURL: APP_CONFIG.apiBaseUrl,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// ── Request interceptor: attach JWT token ─────────────────────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('sbt_access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor: handle 401 ──────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('sbt_access_token')
      // TODO: redirect to login / trigger wallet reconnect
    }
    return Promise.reject(error)
  }
)

export default api
