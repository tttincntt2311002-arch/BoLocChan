/** Organizer dashboard – scaffold */
import useWalletStore from '@/hooks/useWalletStore'
import { formatAddress } from '@/utils/web3'

export default function DashboardPage() {
  const { address, isConnected } = useWalletStore()

  if (!isConnected) {
    return (
      <div className="container-main py-12 text-center">
        <div className="card max-w-md mx-auto py-16">
          <p className="text-4xl mb-4">🦊</p>
          <h2 className="mb-2">Kết nối ví để tiếp tục</h2>
          <p className="text-gray-400 text-sm">Dashboard chỉ dành cho ban tổ chức đã kết nối MetaMask.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container-main py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="mb-1">📊 Dashboard</h1>
          <p className="text-gray-400 text-sm font-mono">{address}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        {[
          { label: 'Sự kiện đã tạo',    value: '–', color: 'text-primary-400' },
          { label: 'Chứng nhận đã cấp', value: '–', color: 'text-blockchain-success' },
          { label: 'Đang chờ mint',      value: '–', color: 'text-blockchain-warning' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card">
            <p className="text-gray-400 text-sm mb-1">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="card text-center py-16 text-gray-500">
        <p className="text-4xl mb-4">🚧</p>
        <p>Chức năng đang được phát triển</p>
      </div>
    </div>
  )
}
