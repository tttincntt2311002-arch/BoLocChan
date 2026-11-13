/**
 * Navbar component with MetaMask connect button
 */
import { Link, NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import useWalletStore from '@/hooks/useWalletStore'
import { formatAddress } from '@/utils/web3'

const NAV_LINKS = [
  { to: '/',            label: 'Trang chủ' },
  { to: '/events',      label: 'Sự kiện' },
  { to: '/certificates', label: 'Chứng nhận' },
  { to: '/verify',      label: 'Xác thực' },
  { to: '/dashboard',   label: 'Dashboard' },
]

export default function Navbar() {
  const { address, isConnected, isWrongNetwork, isConnecting, connect, disconnect, switchNetwork } = useWalletStore()

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-blockchain-darker/80 backdrop-blur-md border-b border-gray-800">
      <div className="container-main flex items-center justify-between h-16">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-blockchain-accent flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <span className="font-bold text-white hidden sm:block">SBT Certificate</span>
        </Link>

        {/* Nav links */}
        <ul className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-500/20 text-primary-400'
                      : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                  )
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Wallet connect */}
        <div className="flex items-center gap-2">
          {isConnected && isWrongNetwork && (
            <button onClick={switchNetwork} className="btn-danger text-xs px-3 py-1.5">
              ⚠ Sai mạng
            </button>
          )}

          {isConnected ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-blockchain-success animate-pulse" />
                <span className="wallet-address">{formatAddress(address)}</span>
              </div>
              <button onClick={disconnect} className="btn-secondary text-xs px-3 py-1.5">
                Ngắt kết nối
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="btn-primary text-sm"
            >
              {isConnecting ? 'Đang kết nối...' : '🦊 Kết nối ví'}
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
