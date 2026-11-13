import { useEffect, useState } from 'react'
import {
  Link,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import {
  ArrowRight,
  Award,
  BadgeCheck,
  Blocks,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  FileBadge,
  Fingerprint,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Dashboard from '@/pages/DashboardPage'
import EventsPage from '@/pages/EventsPage'
import CertificatesPage from '@/pages/CertificatesPage'
import MyCertificates from '@/pages/MyCertificates'
import VerifyPage from '@/pages/VerifyPage'
import WalletButton from '@/components/WalletButton'
import useWalletStore from '@/hooks/useWalletStore'
import { APP_CONFIG } from '@/utils/constants'
import useAuthStore from '@/hooks/useAuthStore'
import RequireAuth, { SessionStatus } from '@/components/RequireAuth'
import AuthPage from '@/pages/AuthPage'
import Profile from '@/pages/Profile'
import { roleLabel } from '@/utils/session'
import './index.css'

const navGroups = [
  {
    label: 'WORKSPACE',
    items: [
      { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
      { to: '/events', label: 'Sự kiện', icon: CalendarDays },
      { to: '/certificates', label: 'Chứng nhận', icon: FileBadge },
    ],
  },
  {
    label: 'CÁ NHÂN',
    items: [
      { to: '/my-certificates', label: 'Bộ sưu tập', icon: Award },
      { to: '/verify', label: 'Tra cứu chứng nhận', icon: ShieldCheck },
    ],
  },
]

function AppShell({ children }) {
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [loggingOut, setLoggingOut] = useState(false)
  const isManager = ['admin', 'organizer'].includes(user?.role)
  const initials = (user?.full_name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  const { isConnected, isWrongNetwork } = useWalletStore()
  async function handleLogout() {
    setLoggingOut(true)
    const revoked = await logout()
    navigate('/login', { replace: true })
    if (revoked) toast.success('Đã đăng xuất')
    else toast('Đã đăng xuất trên trình duyệt. Máy chủ hiện chưa kết nối.')
  }
  if (!user) return null
  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          aria-label="Đóng menu"
          className="mobile-scrim"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Fingerprint size={21} />
          </span>
          <span>
            Soul<span className="brand-light">Pass</span>
            <small>CREDENTIALS, REIMAGINED</small>
          </span>
        </Link>
        <div className="workspace">
          <div className="workspace-icon">SP</div>
          <div>
            <b>SoulPass Workspace</b>
            <small>{roleLabel(user.role)}</small>
          </div>
          <ChevronDown size={15} />
        </div>
        {navGroups
          .map((group) => ({
            ...group,
            items: group.items.filter(
              (item) =>
                isManager || !['/dashboard', '/certificates'].includes(item.to),
            ),
          }))
          .map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  onClick={() => setMobileOpen(false)}
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? 'active' : ''}`
                  }
                >
                  <Icon size={18} strokeWidth={1.8} />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">
              <CircleHelp size={17} />
            </div>
            <b>Cần trợ giúp?</b>
            <p>Đội ngũ của chúng tôi luôn sẵn sàng hỗ trợ.</p>
            <button onClick={() => navigate('/verify')}>
              Trung tâm trợ giúp <ArrowRight size={14} />
            </button>
          </div>
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `nav-link profile-link ${isActive ? 'active' : ''}`
            }
          >
            <Settings size={18} /> Cài đặt hồ sơ
          </NavLink>
          <div className="user-card">
            <div className="avatar">{initials}</div>
            <div>
              <b>{user.full_name}</b>
              <small>{roleLabel(user.role)}</small>
            </div>
            <button
              aria-label="Đăng xuất"
              title="Đăng xuất"
              disabled={loggingOut}
              onClick={handleLogout}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button
            aria-label="Mở menu"
            className="icon-button mobile-menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={19} />
          </button>
          <div className="breadcrumb">
            Không gian tổ chức <span>/</span> {pageTitle(location.pathname)}
          </div>
          <div className="top-actions">
            <span className="chain-pill">
              <i />{' '}
              {isConnected
                ? isWrongNetwork
                  ? 'Sai mạng'
                  : APP_CONFIG.chainName
                : 'Chưa kết nối ví'}
            </span>
            <WalletButton />
          </div>
        </header>
        <div className="page-content">{children ?? <Outlet />}</div>
        <footer className="footer">
          <span>© SoulPass</span>
          <span>
            Được bảo vệ bởi blockchain <span className="footer-sep">·</span>{' '}
            <a href="/verify">Trung tâm trợ giúp</a>
          </span>
        </footer>
      </main>
    </div>
  )
}
function pageTitle(path) {
  return (
    {
      '/dashboard': 'Tổng quan',
      '/events': 'Sự kiện',
      '/certificates': 'Chứng nhận',
      '/my-certificates': 'Bộ sưu tập',
      '/verify': 'Tra cứu',
      '/profile': 'Hồ sơ',
    }[path] || 'Tổng quan'
  )
}
function Button({
  children,
  variant = 'primary',
  onClick,
  to,
  icon: Icon,
  ...props
}) {
  const cls = `button button-${variant}`
  return to ? (
    <Link className={cls} to={to} {...props}>
      {Icon && <Icon size={16} />} {children}
    </Link>
  ) : (
    <button className={cls} onClick={onClick} {...props}>
      {Icon && <Icon size={16} />} {children}
    </button>
  )
}
function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Fingerprint size={21} />
          </span>
          <span>
            Soul<span className="brand-light">Pass</span>
          </span>
        </Link>
        <nav>
          <a href="#features">Tính năng</a>
          <a href="#about">Soulbound Token</a>
          <Link to="/verify">Tra cứu chứng nhận</Link>
        </nav>
        <div>
          <Button variant="ghost" to="/login">
            Đăng nhập
          </Button>
          <Button to="/register">
            Bắt đầu miễn phí <ArrowRight size={15} />
          </Button>
        </div>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <Sparkles size={14} /> CHỨNG NHẬN SỐ THẾ HỆ MỚI
          </div>
          <h1>
            Thành tựu của bạn,
            <br />
            <span>bất biến trên blockchain.</span>
          </h1>
          <p>
            Phát hành và quản lý chứng nhận kỹ thuật số không thể chuyển nhượng.
            Minh bạch, xác thực tức thì và thuộc về chính bạn.
          </p>
          <div className="hero-actions">
            <Button to="/register" icon={ArrowRight}>
              Khám phá nền tảng
            </Button>
            <Button to="/verify" variant="outline" icon={ShieldCheck}>
              Tra cứu chứng nhận
            </Button>
          </div>
          <div className="hero-proof">
            <div className="proof-avatars">
              <span>AL</span>
              <span>TK</span>
              <span>MN</span>
            </div>
            <span>
              <b>Soulbound Token</b> gắn liền với ví của bạn
            </span>
            <span className="proof-divider" />
            <span className="proof-check">
              <ShieldCheck size={16} /> Bảo mật on-chain
            </span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="glow-orb" />
          <div className="certificate-art">
            <div className="cert-top">
              <span className="cert-brand">
                <Fingerprint size={14} /> SOULPASS
              </span>
              <span className="cert-verified">
                <BadgeCheck size={14} /> MẪU MINH HỌA
              </span>
            </div>
            <div className="cert-emblem">
              <Award size={35} />
            </div>
            <div className="cert-label">CERTIFICATE OF ACHIEVEMENT</div>
            <div className="cert-name">
              Web3 Developer
              <br />
              Bootcamp
            </div>
            <div className="cert-rule" />
            <div className="cert-recipient">AWARDED TO</div>
            <div className="cert-recipient-name">Người nhận chứng nhận</div>
            <div className="cert-bottom">
              <span>CERTIFICATE PREVIEW</span>
              <span className="cert-sig">✦ SOULBOUND TOKEN</span>
            </div>
          </div>
          <div className="float-verified">
            <span>
              <ShieldCheck size={17} />
            </span>
            <div>
              <b>Xác minh on-chain</b>
              <small>Ethereum Sepolia</small>
            </div>
            <Check size={17} />
          </div>
          <div className="float-token">
            <span className="token-icon">
              <Blocks size={19} />
            </span>
            <div>
              <b>Soulbound Token</b>
              <small>Không thể chuyển nhượng</small>
            </div>
          </div>
        </div>
      </section>
      <section className="landing-trust">
        <span>DÀNH CHO CỘNG ĐỒNG VÀ TỔ CHỨC</span>
        <div>
          <b>Câu lạc bộ</b>
          <b>Học viện</b>
          <b>Cộng đồng</b>
          <b>Ban tổ chức</b>
        </div>
      </section>
      <section className="landing-section" id="features">
        <div className="section-center">
          <div className="eyebrow">CHỨNG NHẬN, ĐƯỢC TÁI ĐỊNH NGHĨA</div>
          <h2>
            Mọi thành tựu xứng đáng
            <br />
            được ghi nhận trọn đời.
          </h2>
          <p>
            Một cách đơn giản và đáng tin cậy để xác minh năng lực, đóng góp và
            thành tích.
          </p>
        </div>
        <div className="feature-grid">
          <Feature
            icon={Fingerprint}
            title="Thuộc về bạn"
            text="Soulbound Token gắn liền với ví người nhận. Chứng nhận không thể bán hoặc chuyển nhượng."
          />
          <Feature
            icon={ShieldCheck}
            title="Xác minh tức thì"
            text="Bất kỳ ai cũng có thể kiểm tra tính xác thực và nguồn phát hành trên blockchain."
          />
          <Feature
            icon={Blocks}
            title="Minh bạch on-chain"
            text="Mỗi chứng nhận có mã định danh và lịch sử giao dịch công khai, không thể chỉnh sửa."
          />
        </div>
      </section>
      <section className="sbt-section" id="about">
        <div className="sbt-badge">
          <Fingerprint size={28} />
        </div>
        <div>
          <div className="eyebrow">HIỂU VỀ SOULBOUND TOKEN</div>
          <h2>
            Chứng nhận mang dấu ấn
            <br />
            riêng của bạn.
          </h2>
          <p>
            Soulbound Token (SBT) là tài sản số không thể chuyển nhượng. Khi một
            tổ chức trao chứng nhận cho bạn, token được liên kết vĩnh viễn với
            ví cá nhân – như một hồ sơ thành tựu đáng tin cậy trên blockchain.
          </p>
          <Link to="/verify" className="text-link">
            Tìm hiểu cách xác minh <ArrowRight size={15} />
          </Link>
        </div>
        <div className="sbt-stat">
          <strong>100%</strong>
          <span>Minh bạch & xác thực</span>
          <i>
            <Check size={18} />
          </i>
        </div>
      </section>
      <section className="landing-cta">
        <div>
          <h2>
            Sẵn sàng ghi nhận điều
            <br />
            xứng đáng?
          </h2>
          <p>Bắt đầu phát hành chứng nhận số miễn phí hôm nay.</p>
        </div>
        <Button to="/register">
          Tạo tài khoản miễn phí <ArrowRight size={15} />
        </Button>
      </section>
      <footer className="landing-footer">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Fingerprint size={20} />
          </span>
          <span>
            Soul<span className="brand-light">Pass</span>
          </span>
        </Link>
        <span>© SoulPass. Chứng nhận cho một tương lai minh bạch.</span>
        <div>
          <a href="#features">Điều khoản</a>
          <a href="#features">Bảo mật</a>
          <Link to="/verify">Tra cứu</Link>
        </div>
      </footer>
    </div>
  )
}
function Feature({ icon: Icon, title, text }) {
  return (
    <div className="feature-card">
      <div className="feature-icon">
        <Icon size={21} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  )
}

function NotFound() {
  return (
    <div className="empty-state not-found">
      <Blocks size={32} />
      <h1>Không tìm thấy trang</h1>
      <p>Đường dẫn này không tồn tại.</p>
      <Button to="/dashboard">Về tổng quan</Button>
    </div>
  )
}
function PublicVerification() {
  const status = useAuthStore((state) => state.status)
  if (status === 'checking') return <SessionStatus />
  if (status === 'authenticated')
    return (
      <AppShell>
        <VerifyPage />
      </AppShell>
    )
  return (
    <div className="public-tool">
      <header>
        <Link to="/" className="brand">
          SoulPass
        </Link>
        <Link to="/login" className="button button-primary">
          Đăng nhập
        </Link>
      </header>
      <main className="public-tool-content">
        <VerifyPage />
      </main>
    </div>
  )
}

function App() {
  const restore = useAuthStore((state) => state.restore)
  const initWallet = useWalletStore((state) => state.init)
  useEffect(() => initWallet(), [initWallet])
  useEffect(() => {
    restore()
  }, [restore])
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<AuthPage key="login" mode="login" />} />
      <Route
        path="/register"
        element={<AuthPage key="register" mode="register" />}
      />
      <Route
        path="/forgot-password"
        element={<AuthPage key="forgot" mode="forgot" />}
      />
      <Route path="/verify" element={<PublicVerification />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/events" element={<EventsPage />} />
          <Route path="/my-certificates" element={<MyCertificates />} />
          <Route path="/profile" element={<Profile />} />
          <Route element={<RequireAuth roles={['admin', 'organizer']} />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/events/new" element={<EventsPage />} />
            <Route path="/certificates" element={<CertificatesPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
export default App
