import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Fingerprint, LockKeyhole } from 'lucide-react'
import toast from 'react-hot-toast'
import useAuthStore from '../hooks/useAuthStore'
import { authErrorMessage, safeDestination } from '../utils/session'
import { SessionStatus } from '../components/RequireAuth'

export default function AuthPage({ mode }) {
  const register = mode === 'register'
  const forgot = mode === 'forgot'
  const navigate = useNavigate()
  const location = useLocation()
  const { user, status, login, register: registerAccount } = useAuthStore()
  const [email, setEmail] = useState(location.state?.registeredEmail || '')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (status === 'checking' || status === 'error') return <SessionStatus />
  if (status === 'authenticated') {
    return <Navigate to={safeDestination(location.state?.from, user.role)} replace />
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (register && new TextEncoder().encode(password).length > 72) {
      setError('Mật khẩu không được vượt quá 72 byte UTF-8.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (register) {
        await registerAccount({ email: email.trim(), full_name: fullName.trim(), password })
        setPassword('')
        toast.success('Tạo tài khoản thành công. Bạn có thể đăng nhập.')
        navigate('/login', { replace: true, state: { registeredEmail: email.trim(), from: location.state?.from } })
      } else {
        const account = await login(email.trim(), password)
        setPassword('')
        toast.success('Đăng nhập thành công')
        navigate(safeDestination(location.state?.from, account.role), { replace: true })
      }
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const title = register ? 'Tạo tài khoản mới' : forgot ? 'Quên mật khẩu' : 'Chào mừng trở lại'
  return <div className="auth-page">
    <Link to="/" className="brand"><span className="brand-mark"><Fingerprint size={21}/></span><span>Soul<span className="brand-light">Pass</span></span></Link>
    <div className="auth-card">
      <div className="auth-icon"><LockKeyhole size={22}/></div>
      <div className="eyebrow">SOULPASS WORKSPACE</div>
      <h1>{title}</h1>
      <p>{register ? 'Tạo tài khoản để tham gia sự kiện và quản lý chứng nhận.' : forgot ? 'Liên hệ quản trị viên để được hỗ trợ khôi phục quyền truy cập.' : 'Đăng nhập bằng tài khoản của bạn để mở không gian làm việc.'}</p>
      {forgot ? <Link className="button button-primary auth-submit" to="/login">Về đăng nhập</Link> :
        <form onSubmit={submit} aria-busy={busy}>
          {register && <label htmlFor="full-name">Họ và tên
            <input id="full-name" name="name" autoComplete="name" required maxLength={150}
              value={fullName} onChange={e => setFullName(e.target.value)} disabled={busy} placeholder="Họ và tên"/>
          </label>}
          <label htmlFor="auth-email">Email
            <input id="auth-email" name="email" required type="email" autoComplete="username" maxLength={254}
              value={email} onChange={e => setEmail(e.target.value)} disabled={busy} placeholder="you@example.com"/>
          </label>
          <label htmlFor="auth-password">Mật khẩu
            <input id="auth-password" name="password" required type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              minLength={register ? 10 : 1} maxLength={register ? 72 : 256}
              pattern={register ? '(?=.*[A-Za-zÀ-ỹ])(?=.*[0-9]).{10,}' : undefined}
              title={register ? 'Ít nhất 10 ký tự, có chữ và số, tối đa 72 byte UTF-8' : undefined}
              value={password} onChange={e => setPassword(e.target.value)} disabled={busy}
              placeholder={register ? 'Ít nhất 10 ký tự, có chữ và số' : 'Nhập mật khẩu'}/>
          </label>
          {register && <p className="auth-hint">Ít nhất 10 ký tự, có chữ và số; tối đa 72 byte UTF-8.</p>}
          {!register && <div className="forgot-row"><span/><Link to="/forgot-password">Quên mật khẩu?</Link></div>}
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button type="submit" disabled={busy} className="button button-primary auth-submit">
            {busy ? 'Đang xử lý…' : register ? 'Tạo tài khoản' : 'Đăng nhập'} <ArrowRight size={16}/>
          </button>
        </form>}
      {!forgot && <div className="auth-switch">
        {register ? <>Đã có tài khoản? <Link to="/login" state={{ from: location.state?.from }}>Đăng nhập</Link></> :
          <>Chưa có tài khoản? <Link to="/register" state={{ from: location.state?.from }}>Đăng ký miễn phí</Link></>}
      </div>}
    </div>
    <p className="auth-foot">SoulPass · Chứng nhận số và quản lý sự kiện</p>
  </div>
}
