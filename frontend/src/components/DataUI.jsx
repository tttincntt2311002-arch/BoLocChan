import { Link } from 'react-router-dom'
import { transactionUrl } from '@/utils/web3'
import { certificatePath } from '@/utils/certificateLinks'

export const dateText = (value) =>
  value ? new Date(value).toLocaleString('vi-VN') : '—'
export const statusText = (status) =>
  ({
    pending: 'Đang chờ',
    issued: 'Đã cấp',
    failed: 'Thất bại',
    revoked: 'Đã thu hồi',
    active: 'Đang mở',
    draft: 'Bản nháp',
    closed: 'Đã đóng',
    completed: 'Hoàn tất',
    cancelled: 'Đã hủy',
    attended: 'Đã tham dự',
    confirmed: 'Đã xác nhận',
    registered: 'Đã đăng ký',
    absent: 'Vắng mặt',
  })[status] || status
export function Heading({ title, description, actions }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  )
}
export function Badge({ status }) {
  return <span className={`badge badge-${status}`}>{statusText(status)}</span>
}
export function DataState({ loading, error, reload }) {
  if (error)
    return (
      <div role="alert" className="auth-error">
        {error}{' '}
        {reload && (
          <button className="button button-outline" onClick={reload}>
            Thử lại
          </button>
        )}
      </div>
    )
  return loading ? (
    <p role="status" className="data-loading">
      Đang tải dữ liệu…
    </p>
  ) : null
}
export function TxLink({ hash, chainId }) {
  if (!hash) return <span>—</span>
  const url = transactionUrl(hash, chainId)
  return url ? (
    <a
      className="text-link hash-text"
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      {hash}
    </a>
  ) : (
    <span className="hash-text">{hash}</span>
  )
}
export function CertificateDetails({ certificate, eventName }) {
  return (
    <div className="certificate-details">
      <h3>{eventName || certificate.event_id}</h3>
      <Badge status={certificate.status} />
      <p>Token ID: {certificate.token_id ?? 'Chưa xác nhận'}</p>
      <p>Ngày cấp: {dateText(certificate.issued_at)}</p>
      <p className="hash-text">Ví nhận: {certificate.recipient_wallet}</p>
      <p>
        Transaction Hash:{' '}
        <TxLink hash={certificate.tx_hash} chainId={certificate.chain_id} />
      </p>
      {certificate.failure_reason && (
        <p role="alert">{certificate.failure_reason}</p>
      )}
      <Link to={certificate.token_id != null ? certificatePath(certificate) : `/verify?id=${certificate.id}`} className="text-link">
        Tra cứu chứng nhận
      </Link>
    </div>
  )
}
