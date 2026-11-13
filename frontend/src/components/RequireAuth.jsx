import { Navigate, Outlet, useLocation } from 'react-router-dom'
import useAuthStore from '../hooks/useAuthStore'
import { homeForRole } from '../utils/session'

export function SessionStatus() {
  const { status, restore, logout } = useAuthStore()
  return <div className="session-status" role="status" aria-live="polite">
    <h1>{status === 'error' ? 'Chưa kết nối được máy chủ' : 'Đang kiểm tra phiên đăng nhập…'}</h1>
    {status === 'error' && <>
      <p>Hãy kiểm tra backend rồi thử lại.</p>
      <div className="session-actions">
        <button className="button button-primary" onClick={restore}>Thử lại</button>
        <button className="button button-outline" onClick={logout}>Về đăng nhập</button>
      </div>
    </>}
  </div>
}

export default function RequireAuth({ roles }) {
  const { user, status } = useAuthStore()
  const location = useLocation()
  if (status === 'checking' || status === 'error') return <SessionStatus />
  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (roles && !roles.includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />
  return <Outlet />
}
