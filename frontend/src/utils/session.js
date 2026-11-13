// Only the token is persisted. Identity and role are reloaded from /auth/me.
export const TOKEN_KEY = 'sbt_access_token'
export const SESSION_EXPIRED_EVENT = 'sbt:session-expired'

export const readToken = () => localStorage.getItem(TOKEN_KEY)
export const saveToken = token => localStorage.setItem(TOKEN_KEY, token)

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  // Remove credentials left by the old wallet store as well.
  const legacy = localStorage.getItem('sbt-wallet-store')
  if (legacy) {
    try {
      const data = JSON.parse(legacy)
      if (data.state) {
        data.state.accessToken = null
        data.state.user = null
        localStorage.setItem('sbt-wallet-store', JSON.stringify(data))
      }
    } catch {
      localStorage.removeItem('sbt-wallet-store')
    }
  }
}

export const roleLabel = role => ({
  admin: 'Quản trị viên',
  organizer: 'Người tổ chức',
  participant: 'Người tham gia',
})[role] || 'Tài khoản'

export const homeForRole = role => role === 'participant' ? '/my-certificates' : '/dashboard'

export function safeDestination(from, role) {
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//') || from.includes('\\')) {
    return homeForRole(role)
  }
  const path = from.split(/[?#]/)[0]
  if (!['/dashboard', '/events', '/events/new', '/certificates', '/my-certificates', '/profile', '/verify'].includes(path)) {
    return homeForRole(role)
  }
  if (role === 'participant' && ['/dashboard', '/events/new', '/certificates'].includes(path)) {
    return homeForRole(role)
  }
  return from
}

export function authErrorMessage(error) {
  if (!error.response) return 'Không kết nối được máy chủ. Hãy kiểm tra backend và thử lại.'
  const { status, data } = error.response
  if (status === 401) return 'Email hoặc mật khẩu không đúng, hoặc tài khoản đã bị vô hiệu hóa.'
  if (status === 409) return 'Email đã được sử dụng. Hãy đăng nhập hoặc dùng email khác.'
  if (status === 422) return 'Thông tin chưa hợp lệ. Mật khẩu đăng ký cần ít nhất 10 ký tự, có chữ và số, tối đa 72 byte UTF-8.'
  if (status === 429) return 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.'
  return data?.error?.message || 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.'
}
