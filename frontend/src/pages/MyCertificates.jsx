import { useEffect, useRef, useState } from 'react'
import useAuthStore from '@/hooks/useAuthStore'
import useWalletStore from '@/hooks/useWalletStore'
import useApiData from '@/hooks/useApiData'
import WalletButton from '@/components/WalletButton'
import CertificateTools from '@/components/CertificateTools'
import { CertificateDetails, DataState, Heading } from '@/components/DataUI'
import api, { allPages } from '@/utils/api'
import { errorMessage } from '@/utils/errors'
import {
  contractAddress,
  getContract,
  getReadProvider,
  loadMetadata,
} from '@/utils/web3'

export default function MyCertificates() {
  const user = useAuthStore((state) => state.user)
  const { address, isWrongNetwork } = useWalletStore()
  const [checks, setChecks] = useState({})
  const [busy, setBusy] = useState(null)
  const generation = useRef(0)
  useEffect(() => {
    generation.current++
    setChecks({})
    setBusy(null)
  }, [address])
  const state = useApiData(async () => {
    if (!address) return { certificates: [], events: [] }
    const [certificates, events] = await Promise.all([
      allPages('/certificates', { wallet_address: address, mine: true }),
      allPages('/events'),
    ])
    return { certificates, events }
  }, [user.id, address])
  async function verify(certificate) {
    const version = generation.current
    setBusy(certificate.id)
    try {
      if (certificate.token_id == null)
        throw new Error('Chứng nhận chưa có Token ID được backend xác nhận.')
      const provider = getReadProvider()
      if (
        Number((await provider.getNetwork()).chainId) !== certificate.chain_id
      )
        throw new Error('RPC đang kết nối sai mạng.')
      if (
        contractAddress().toLowerCase() !==
        certificate.contract_address?.toLowerCase()
      )
        throw new Error('Contract không khớp cấu hình.')
      const contract = getContract(provider)
      const [owner, record, uri, backend] = await Promise.all([
        contract.ownerOf(certificate.token_id),
        contract.getCertificate(certificate.token_id),
        contract.tokenURI(certificate.token_id),
        api.get('/verify/blockchain', {
          params: {
            chain_id: certificate.chain_id,
            contract_address: certificate.contract_address,
            token_id: certificate.token_id,
          },
          timeout: 90000,
        }),
      ])
      if (
        owner.toLowerCase() !== address.toLowerCase() ||
        record.recipient.toLowerCase() !== address.toLowerCase() ||
        record.eventId !== certificate.event_id ||
        uri !== certificate.token_uri
      )
        throw new Error(
          'Dữ liệu blockchain không khớp ví, sự kiện hoặc metadata của chứng nhận.',
        )
      if (
        record.revoked ||
        backend.data.status !== 'VALID' ||
        !backend.data.on_chain_verified
      )
        throw new Error('Chứng nhận đã bị thu hồi hoặc không còn hiệu lực.')
      let metadataError = ''
      try {
        await loadMetadata(uri)
      } catch (error) {
        metadataError = errorMessage(error)
      }
      if (version === generation.current)
        setChecks((previous) => ({
          ...previous,
          [certificate.id]: {
            valid: true,
            message: 'Đã đối chiếu backend và blockchain.',
            metadataError,
          },
        }))
    } catch (error) {
      if (version === generation.current)
        setChecks((previous) => ({
          ...previous,
          [certificate.id]: { valid: false, message: errorMessage(error) },
        }))
    } finally {
      if (version === generation.current) setBusy(null)
    }
  }
  return (
    <>
      <Heading
        title="Chứng nhận của tôi"
        description="Chứng nhận của tài khoản đăng nhập thuộc ví MetaMask hiện tại."
        actions={<WalletButton />}
      />
      {!address ? (
        <p className="empty-state">
          Kết nối MetaMask để xem chứng nhận thuộc ví của bạn.
        </p>
      ) : (
        <>
          <p className="hash-text">Ví hiện tại: {address}</p>
          {isWrongNetwork && (
            <p role="alert" className="auth-error">
              Ví đang ở sai mạng. Chọn chuyển sang Sepolia.
            </p>
          )}
          <DataState {...state} />
          {state.data && <p>{state.data.certificates.length} chứng nhận</p>}
          <div className="certificate-grid">
            {state.data?.certificates.map((c) => (
              <article className="panel data-panel" key={`${address}:${c.id}`}>
                <CertificateDetails
                  certificate={c}
                  eventName={
                    state.data.events.find((e) => e.id === c.event_id)?.name
                  }
                />
                <CertificateTools certificate={c} onChanged={state.reload} />
                {c.token_id != null && (
                  <button
                    className="button button-outline"
                    disabled={Boolean(busy)}
                    onClick={() => verify(c)}
                  >
                    Đối chiếu blockchain
                  </button>
                )}
                {checks[c.id] && (
                  <div
                    role="status"
                    className={
                      checks[c.id].valid ? 'sync-status' : 'auth-error'
                    }
                  >
                    {checks[c.id].message}
                    {checks[c.id].metadataError && (
                      <p>{checks[c.id].metadataError}</p>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
          {!state.loading &&
            !state.error &&
            !state.data?.certificates.length && (
              <p className="empty-state">
                Chưa có chứng nhận cho ví hiện tại trong tài khoản này.
              </p>
            )}
        </>
      )}
    </>
  )
}
