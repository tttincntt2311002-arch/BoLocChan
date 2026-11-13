import axios from 'axios'
import { APP_CONFIG } from './constants'
import { clearToken, readToken, SESSION_EXPIRED_EVENT } from './session'

const api = axios.create({
  baseURL: APP_CONFIG.apiBaseUrl,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = readToken()
  if (token && !config.skipAuth)
    config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // An old request must not clear a newer login, and a rejected login must
    // not invalidate another authenticated session.
    const token = readToken()
    if (
      error.response?.status === 401 &&
      token &&
      error.config?.headers?.Authorization === `Bearer ${token}`
    ) {
      clearToken()
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    }
    return Promise.reject(error)
  },
)

export default api

export async function allPages(path, params = {}) {
  const items = []
  let total
  do {
    const { data } = await api.get(path, {
      params: { ...params, skip: items.length, limit: 100 },
    })
    items.push(...data.items)
    total = data.total
    if (!data.items.length) break
  } while (items.length < total)
  return items
}
