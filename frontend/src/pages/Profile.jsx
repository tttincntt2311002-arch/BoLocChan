import { useState } from 'react'
import { Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import useAuthStore from '../hooks/useAuthStore'
import { authErrorMessage, roleLabel } from '../utils/session'

export default function Profile() {
  const { user, updateProfile, updateWallet } = useAuthStore()
  const [name, setName] = useState(user.full_name)
  const [email, setEmail] = useState(user.email)
  const [wallet, setWallet] = useState(user.wallet_address || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(event, action) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await action()
      toast.success('Đã lưu thay đổi')
    } catch (err) {
      setError(err.response?.status === 409 ? 'Email hoặc địa chỉ ví đã được liên kết với tài khoản khác.' : authErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return <>
    <div className="page-heading"><div><div className="eyebrow">CÀI ĐẶT / HỒ SƠ</div>
      <h1>Hồ sơ cá nhân</h1><p>Thông tin tài khoản đang đăng nhập.</p>
    </div></div>
    {error && <div role="alert" className="auth-error">{error}</div>}
    <div className="profile-layout">
      <section className="panel profile-panel">
        <h2>Thông tin cá nhân</h2>
        <p className="panel-subtitle">Cập nhật tên và địa chỉ email của bạn.</p>
        <form className="modal-form" onSubmit={event => save(event, () => updateProfile({ full_name: name.trim(), email: email.trim() }))}>
          <label>Họ và tên<input required maxLength={150} value={name} onChange={e => setName(e.target.value)} disabled={busy}/></label>
          <label>Email<input required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy}/></label>
          <label>Vai trò<input readOnly value={roleLabel(user.role)}/></label>
          <div className="profile-save"><button type="submit" className="button button-primary" disabled={busy}>Lưu thay đổi</button></div>
        </form>
      </section>
      <section className="panel wallet-panel">
        <div className="wallet-panel-heading"><div className="wallet-big-icon"><Wallet size={21}/></div>
          <div><h2>Ví blockchain</h2><p>Địa chỉ ví nhận chứng nhận.</p></div>
        </div>
        <div className={`wallet-status ${user.wallet_address ? 'is-connected' : ''}`}><i/>{user.wallet_address ? 'Đã liên kết địa chỉ' : 'Chưa liên kết địa chỉ'}</div>
        <form className="modal-form" onSubmit={event => save(event, () => updateWallet(wallet.trim() || null))}>
          <label>Địa chỉ ví Ethereum<input value={wallet} onChange={e => setWallet(e.target.value)}
            pattern="0x[0-9a-fA-F]{40}" maxLength={42} placeholder="0x..." disabled={busy}/></label>
          <button type="submit" disabled={busy} className="button button-primary wallet-connect">Lưu địa chỉ ví</button>
        </form>
        <p className="auth-hint">Để trống và lưu để bỏ liên kết. Liên kết địa chỉ không thay thế đăng nhập tài khoản.</p>
      </section>
    </div>
  </>
}
