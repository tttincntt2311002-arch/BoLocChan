import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import useAuthStore from '@/hooks/useAuthStore'
import useWalletStore from '@/hooks/useWalletStore'
import useApiData from '@/hooks/useApiData'
import WalletButton from '@/components/WalletButton'
import CertificateTools from '@/components/CertificateTools'
import { CertificateDetails } from '@/components/DataUI'
import {
  Badge,
  DataState,
  Heading,
  TxLink,
  dateText,
} from '@/components/DataUI'
import api, { allPages } from '@/utils/api'
import { errorMessage } from '@/utils/errors'
import { mintCertificate, syncCertificate } from '@/utils/issuance'
import { loadMetadata } from '@/utils/web3'

export default function CertificatesPage() {
  const user = useAuthStore((state) => state.user)
  const address = useWalletStore((state) => state.address)
  const [search] = useSearchParams()
  const [eventId, setEventId] = useState(search.get('event') || '')
  const [recipientId, setRecipientId] = useState('')
  const [uri, setUri] = useState('')
  const [mode, setMode] = useState('uri')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [selectedCertificate, setSelectedCertificate] = useState(null)
  const working = useRef(false)
  const state = useApiData(async () => {
    const [events, certificates] = await Promise.all([
      allPages('/events', { managed_only: true }),
      allPages('/certificates'),
    ])
    return { events, certificates }
  }, [user.id])
  const people = useApiData(
    () =>
      eventId
        ? allPages(`/events/${eventId}/participants`, { status: 'attended' })
        : Promise.resolve([]),
    [eventId],
  )
  const selectedEvent = state.data?.events.find((e) => e.id === eventId)
  const existing = state.data?.certificates.find(
    (c) => c.event_id === eventId && c.recipient_id === recipientId,
  )
  const list =
    state.data?.certificates.filter(
      (c) => !eventId || c.event_id === eventId,
    ) || []
  const reload = state.reload

  useEffect(() => {
    const timer = setInterval(() => {
      if (!working.current) reload()
    }, 15000)
    return () => clearInterval(timer)
  }, [reload])

  async function run(callback) {
    if (working.current) return
    working.current = true
    setBusy(true)
    setError('')
    try {
      const result = await callback()
      if (result?.status === 'issued')
        toast.success(`Đã xác minh và lưu chứng nhận Token #${result.token_id}`)
      else if (result?.status === 'failed') setError(result.failure_reason)
      else if (result)
        setStage(
          'Giao dịch còn pending hoặc đang quét event logs. Hệ thống sẽ tiếp tục đồng bộ.',
        )
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      working.current = false
      setBusy(false)
      await state.reload()
    }
  }
  async function issue(e) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    await run(async () => {
      if (!address)
        throw new Error('Hãy kết nối MetaMask trước khi cấp chứng nhận.')
      if (!selectedEvent || !recipientId)
        throw new Error('Hãy chọn sự kiện và người đã tham dự.')
      let certificate = existing
      if (!certificate) {
        let metadataUri = uri.trim()
        if (mode === 'upload') {
          setStage('Đang chuẩn bị và tải metadata lên IPFS…')
          const { data } = await api.post(
            '/ipfs/upload/metadata',
            {
              name: `Chứng nhận ${selectedEvent.name}`,
              description: String(
                form.get('description') ||
                  selectedEvent.description ||
                  selectedEvent.name,
              ),
              image: String(form.get('image') || ''),
              attributes: [
                { trait_type: 'event_id', value: eventId },
                { trait_type: 'recipient_id', value: recipientId },
              ],
            },
            { timeout: 45000 },
          )
          metadataUri = data.uri
        }
        await loadMetadata(metadataUri)
        certificate = (
          await api.post('/certificates/issue', {
            event_id: eventId,
            recipient_id: recipientId,
            token_uri: metadataUri,
          })
        ).data
      }
      return await mintCertificate(certificate, address, user.id, setStage)
    })
  }
  return (
    <>
      <Heading
        title="Cấp chứng nhận SBT"
        description="Chỉ người đã được điểm danh tham dự mới đủ điều kiện nhận chứng nhận."
        actions={<WalletButton />}
      />
      <DataState {...state} />
      <DataState error={error} />
      {stage && (
        <p role="status" className="sync-status">
          {stage}
        </p>
      )}
      <section className="panel data-panel">
        <form className="modal-form" onSubmit={issue}>
          <label>
            Sự kiện
            <select
              required
              value={eventId}
              disabled={busy}
              onChange={(e) => {
                setEventId(e.target.value)
                setRecipientId('')
              }}
            >
              <option value="">Chọn sự kiện</option>
              {state.data?.events
                .filter((e) => !['draft', 'cancelled'].includes(e.status))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </label>
          <DataState {...people} />
          <label>
            Người đã tham dự
            <select
              required
              value={recipientId}
              disabled={busy || people.loading}
              onChange={(e) => setRecipientId(e.target.value)}
            >
              <option value="">Chọn người nhận</option>
              {people.data?.map((p) => (
                <option
                  key={p.id}
                  value={p.user_id}
                  disabled={!p.wallet_address}
                >
                  {p.full_name} · {p.wallet_address || 'Chưa liên kết ví'}
                </option>
              ))}
            </select>
          </label>
          {existing ? (
            <p>
              Chứng nhận hiện có: <Badge status={existing.status} /> · Metadata:{' '}
              {existing.token_uri}
            </p>
          ) : (
            <>
              <label>
                Metadata
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  disabled={busy}
                >
                  <option value="uri">Dùng metadata đã có trên IPFS</option>
                  <option value="upload">Tạo metadata và tải lên IPFS</option>
                </select>
              </label>
              {mode === 'uri' ? (
                <label>
                  Metadata URI
                  <input
                    required
                    placeholder="ipfs://CID/metadata.json"
                    value={uri}
                    onChange={(e) => setUri(e.target.value)}
                    disabled={busy}
                  />
                </label>
              ) : (
                <>
                  <label>
                    Ảnh chứng nhận trên IPFS
                    <input
                      required
                      name="image"
                      placeholder="ipfs://CID/certificate.png"
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Mô tả metadata
                    <textarea name="description" rows={3} disabled={busy} />
                  </label>
                  <p className="auth-hint">
                    Chức năng tải lên cần cấu hình Pinata ở backend.
                  </p>
                </>
              )}
            </>
          )}
          <button
            className="button button-primary"
            disabled={busy || ['issued', 'revoked'].includes(existing?.status)}
          >
            {busy
              ? 'Đang xử lý…'
              : existing?.tx_hash
                ? 'Đồng bộ giao dịch'
                : 'Cấp chứng nhận qua MetaMask'}
          </button>
        </form>
      </section>
      <section className="panel data-panel">
        <h2>Danh sách chứng nhận</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sự kiện / ví nhận</th>
                <th>Token ID</th>
                <th>Ngày cấp</th>
                <th>Trạng thái</th>
                <th>Giao dịch</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>
                    {state.data.events.find((e) => e.id === c.event_id)?.name ||
                      c.event_id}
                    <small className="hash-text">{c.recipient_wallet}</small>
                  </td>
                  <td>{c.token_id ?? '—'}</td>
                  <td>{dateText(c.issued_at)}</td>
                  <td>
                    <Badge status={c.status} />
                    {c.failure_reason && <small>{c.failure_reason}</small>}
                  </td>
                  <td>
                    <TxLink hash={c.tx_hash} chainId={c.chain_id} />
                  </td>
                  <td>
                    <button
                      className="button button-outline"
                      onClick={() => setSelectedCertificate(c.id)}
                    >
                      Xem chứng nhận
                    </button>
                    {c.status === 'pending' && (
                      <button
                        disabled={busy}
                        className="button button-outline"
                        onClick={() => run(() => syncCertificate(c, user.id))}
                      >
                        Đồng bộ
                      </button>
                    )}
                    {['pending', 'failed'].includes(c.status) && !c.tx_hash && (
                      <button
                        disabled={busy}
                        className="button button-outline"
                        onClick={() =>
                          run(() =>
                            mintCertificate(c, address, user.id, setStage),
                          )
                        }
                      >
                        Tiếp tục cấp
                      </button>
                    )}
                    {c.status === 'failed' && c.tx_hash && (
                      <button
                        disabled={busy}
                        className="button button-outline"
                        onClick={() =>
                          run(() =>
                            mintCertificate(c, address, user.id, setStage),
                          )
                        }
                      >
                        Thử lại
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!state.loading && !list.length && <p>Chưa có chứng nhận.</p>}
      </section>
      {state.data?.certificates
        .filter((c) => c.id === selectedCertificate)
        .map((c) => (
          <section className="panel data-panel" key={c.id}>
            <CertificateDetails
              certificate={c}
              eventName={
                state.data.events.find((e) => e.id === c.event_id)?.name
              }
            />
            <CertificateTools
              certificate={c}
              canRevoke={state.data.events.some((e) => e.id === c.event_id)}
              onChanged={state.reload}
            />
          </section>
        ))}
    </>
  )
}
