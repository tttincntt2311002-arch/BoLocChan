import { useState } from 'react'
import QRCode from 'qrcode'
import api from '@/utils/api'
import useApiData from '@/hooks/useApiData'
import useWalletStore from '@/hooks/useWalletStore'
import { errorMessage } from '@/utils/errors'
import { revokeCertificate } from '@/utils/revocation'
import { DataState } from './DataUI'
import CertificateHistory from './CertificateHistory'

export default function CertificateTools({
  certificate,
  canRevoke = false,
  onChanged,
}) {
  const [open, setOpen] = useState(''),
    [busy, setBusy] = useState(false)
  const [error, setError] = useState(''),
    [stage, setStage] = useState('')
  const address = useWalletStore((state) => state.address)
  const confirmed =
    certificate.token_id != null &&
    ['issued', 'revoked'].includes(certificate.status)
  const qr = useApiData(async () => {
    if (open !== 'qr') return null
    const { data } = await api.get(`/certificates/${certificate.id}/document`)
    return {
      ...data,
      png: await QRCode.toDataURL(data.verification_url, {
        width: 320,
        margin: 4,
        errorCorrectionLevel: 'M',
      }),
    }
  }, [certificate.id, open])
  async function pdf() {
    setBusy(true)
    setError('')
    try {
      const { data } = await api.get(`/certificates/${certificate.id}/pdf`, {
        responseType: 'blob',
        timeout: 90000,
      })
      const url = URL.createObjectURL(data),
        link = document.createElement('a')
      link.href = url
      link.download = `certificate-${certificate.token_id}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      if (err.response?.data instanceof Blob) {
        try {
          err.response.data = JSON.parse(await err.response.data.text())
        } catch {
          /* Use HTTP status. */
        }
      }
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  async function revoke() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await revokeCertificate(certificate, address, setStage)
      setStage('Đã đồng bộ kết quả thu hồi từ blockchain.')
      setOpen('history')
      onChanged?.()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="certificate-tools">
      <div className="certificate-actions">
        <button
          className="button button-outline"
          type="button"
          disabled={!confirmed || busy}
          onClick={() => setOpen(open === 'qr' ? '' : 'qr')}
        >
          QR xác thực
        </button>
        <button
          className="button button-outline"
          type="button"
          disabled={certificate.status !== 'issued' || busy}
          onClick={pdf}
        >
          {busy ? 'Đang xử lý…' : 'Tải PDF'}
        </button>
        <button
          className="button button-outline"
          type="button"
          onClick={() => setOpen(open === 'history' ? '' : 'history')}
        >
          Lịch sử
        </button>
        {canRevoke && certificate.status === 'issued' && (
          <button
            className="button button-danger"
            type="button"
            disabled={busy}
            onClick={() => setOpen('revoke')}
          >
            Thu hồi on-chain
          </button>
        )}
      </div>
      <DataState error={error} />
      {stage && (
        <p role="status" className="sync-status">
          {stage}
        </p>
      )}
      {open === 'qr' && (
        <div className="certificate-qr">
          <DataState {...qr} />
          {qr.data && (
            <>
              <img
                src={qr.data.png}
                alt={`QR xác thực Token ${certificate.token_id}`}
              />
              <p>
                QR chỉ chứa định danh blockchain, không chứa tên hoặc email.
              </p>
              <a
                className="button button-outline"
                download={`certificate-${certificate.token_id}-qr.png`}
                href={qr.data.png}
              >
                Tải QR Code
              </a>
              <a
                className="text-link hash-text"
                href={qr.data.verification_url}
              >
                Mở trang xác thực
              </a>
            </>
          )}
        </div>
      )}
      {open === 'history' && (
        <CertificateHistory certificate={certificate} onChanged={onChanged} />
      )}
      {open === 'revoke' && (
        <div className="revoke-confirm">
          <p>
            Thu hồi Token #{certificate.token_id} trên blockchain. MetaMask sẽ
            yêu cầu xác nhận giao dịch và phí gas.
          </p>
          <button
            className="button button-danger"
            disabled={busy}
            onClick={revoke}
          >
            Xác nhận thu hồi qua MetaMask
          </button>
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() => setOpen('')}
          >
            Hủy
          </button>
        </div>
      )}
    </div>
  )
}
