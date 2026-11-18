import toast from 'react-hot-toast'
import useWalletStore from '@/hooks/useWalletStore'
import { formatAddress } from '@/utils/web3'
import { errorMessage } from '@/utils/errors'
import { APP_CONFIG } from '@/utils/constants'

export default function WalletButton() {
  const {
    address,
    isConnected,
    isConnecting,
    isWrongNetwork,
    connect,
    switchNetwork,
  } = useWalletStore()
  async function act() {
    try {
      if (isWrongNetwork) await switchNetwork()
      else if (!isConnected) await connect()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }
  return (
    <button
      type="button"
      className="wallet-button"
      disabled={isConnecting}
      onClick={act}
      title={address || 'Kết nối MetaMask'}
    >
      <span
        className={`wallet-dot ${!isConnected || isWrongNetwork ? 'wallet-unlinked' : ''}`}
      />
      <span className="wallet-label">
        {isConnecting
          ? 'Đang kết nối…'
          : isWrongNetwork
            ? `Chuyển sang ${APP_CONFIG.chainName}`
            : isConnected
              ? formatAddress(address)
              : 'Kết nối MetaMask'}
      </span>
    </button>
  )
}
