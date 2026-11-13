import { useState } from 'react'
import useApiData from '@/hooks/useApiData'
import api, { allPages } from '@/utils/api'
import { errorMessage } from '@/utils/errors'
import { DataState, TxLink, dateText } from './DataUI'

export function HistoryTable({ entries, chainId, privateView = false }) {
  if (!entries?.length)
    return <p className="empty-history">Chưa có lịch sử giao dịch.</p>
  return (
    <div className="table-wrap">
      <table className="history-table">
        <thead>
          <tr>
            <th>Hoạt động</th>
            <th>Thời gian giao dịch</th>
            <th>Người thực hiện</th>
            <th>Transaction Hash</th>
            <th>Nguồn</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={entry.id || `${entry.action}:${entry.tx_hash}:${index}`}>
              <td>
                {{
                  issued: 'Cấp chứng nhận',
                  revoked: 'Thu hồi',
                  revocation_failed: 'Thu hồi thất bại',
                }[entry.action] || entry.action}
              </td>
              <td>
                {dateText(entry.transaction_time)}
                {privateView && (
                  <small>Ghi nhận: {dateText(entry.created_at)}</small>
                )}
              </td>
              <td>
                {privateView && entry.actor_name}
                <span className="hash-text">
                  {entry.actor_address ||
                    (!entry.actor_name ? 'Chưa xác định' : '')}
                </span>
              </td>
              <td>
                <TxLink hash={entry.tx_hash} chainId={chainId} />
              </td>
              <td>
                {entry.source === 'blockchain' ? 'Blockchain' : 'Hệ thống'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CertificateHistory({ certificate, onChanged }) {
  const state = useApiData(
    () => allPages(`/certificates/${certificate.id}/history`),
    [certificate.id],
  )
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function refresh() {
    setBusy(true)
    setError('')
    try {
      const { data } = await api.get('/verify/blockchain', {
        params: {
          chain_id: certificate.chain_id,
          contract_address: certificate.contract_address,
          token_id: certificate.token_id,
        },
        timeout: 90000,
      })
      if (!['VALID', 'REVOKED'].includes(data.status))
        throw new Error(data.message)
      await state.reload()
      onChanged?.()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="certificate-history">
      <div className="panel-heading">
        <h3>Lịch sử chứng nhận</h3>
        {certificate.token_id != null && (
          <button
            className="button button-outline"
            disabled={busy}
            onClick={refresh}
          >
            {busy ? 'Đang đồng bộ…' : 'Đồng bộ on-chain'}
          </button>
        )}
      </div>
      <DataState {...state} />
      <DataState error={error} />
      <HistoryTable
        entries={state.data}
        chainId={certificate.chain_id}
        privateView
      />
    </div>
  )
}
