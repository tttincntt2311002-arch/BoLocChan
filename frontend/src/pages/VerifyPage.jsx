import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '@/utils/api'
import { APP_CONFIG } from '@/utils/constants'
import {
  certificateIdentity,
  parseCertificateQr,
} from '@/utils/certificateLinks'
import { errorMessage } from '@/utils/errors'
import { DataState, Heading, dateText } from '@/components/DataUI'
import QrScanner from '@/components/QrScanner'
import { HistoryTable } from '@/components/CertificateHistory'

const checkLabels = {
  chain_id: 'Đúng chain ID',
  contract_address: 'Đúng contract của tổ chức',
  contract_deployed: 'Contract đã triển khai',
  token_exists: 'Token tồn tại',
  owner_of: 'ownerOf khớp người nhận',
  locked: 'Token bị khóa (Soulbound)',
  metadata_uri: 'Metadata URI hợp lệ',
  registry_matches: 'Dữ liệu hệ thống khớp blockchain',
  mint_transaction: 'Receipt và sự kiện mint hợp lệ',
  not_revoked: 'Chưa bị thu hồi',
}

export default function VerifyPage() {
  const [params, setParams] = useSearchParams()
  const [type, setType] = useState('token'),
    [value, setValue] = useState('')
  const [chain, setChain] = useState(String(APP_CONFIG.chainId)),
    [contract, setContract] = useState(APP_CONFIG.contractAddress)
  const [result, setResult] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const request = useRef(null)
  const search = params.toString()
  const verifyIdentity = useCallback(async (identity) => {
    const version = ++generation.current
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setResult(null)
    setError('')
    try {
      const checked = certificateIdentity(identity)
      const { data } = await api.get('/verify/blockchain', {
        params: {
          chain_id: checked.chainId,
          contract_address: checked.contractAddress,
          token_id: checked.tokenId,
        },
        timeout: 90000,
        signal: controller.signal,
      })
      if (version === generation.current) setResult(data)
    } catch (err) {
      if (version === generation.current) setError(errorMessage(err))
    } finally {
      if (version === generation.current) setBusy(false)
    }
  }, [])
  useEffect(() => {
    generation.current++
    setResult(null)
    setError('')
    setBusy(false)
    const query = new URLSearchParams(search)
    if (
      ['chainId', 'contractAddress', 'tokenId'].some((key) => query.has(key))
    ) {
      try {
        const identity = parseCertificateQr(
          `${window.location.origin}/verify?${search}`,
        )
        setType('token')
        setChain(String(identity.chainId))
        setContract(identity.contractAddress)
        setValue(identity.tokenId)
        verifyIdentity(identity)
      } catch (err) {
        setError(err.message)
      }
    } else {
      setType(query.has('id') ? 'certificate' : 'token')
      setValue(query.get('id') || '')
    }
    const counter = generation,
      activeRequest = request
    return () => {
      counter.current++
      activeRequest.current?.abort()
    }
  }, [search, verifyIdentity])
  function invalidate() {
    generation.current++
    request.current?.abort()
    setResult(null)
    setError('')
    setBusy(false)
  }
  async function verify(event) {
    event.preventDefault()
    if (type === 'token')
      return verifyIdentity({
        chainId: chain,
        contractAddress: contract,
        tokenId: value.trim(),
      })
    const version = ++generation.current
    setBusy(true)
    setResult(null)
    setError('')
    try {
      const { data } = await api.get(
        `/verify/certificate/${encodeURIComponent(value.trim())}`,
      )
      if (version !== generation.current) return
      const certificate = data.certificate
      if (certificate.token_id == null) {
        setResult({
          status: 'NOT FOUND',
          message: 'Chứng nhận chưa được xác nhận trên blockchain.',
          checks: {},
          history: [],
        })
        setBusy(false)
        return
      }
      await verifyIdentity({
        chainId: certificate.chain_id,
        contractAddress: certificate.contract_address,
        tokenId: certificate.token_id,
      })
    } catch (err) {
      if (version === generation.current) {
        setError(errorMessage(err))
        setBusy(false)
      }
    }
  }
  function scanned(identity) {
    invalidate()
    setParams(
      Object.fromEntries(
        Object.entries(identity).map(([key, value]) => [key, String(value)]),
      ),
    )
  }
  return (
    <>
      <Heading
        title="Tra cứu chứng nhận"
        description="Xác minh trực tiếp chain, owner, khóa Soulbound, metadata, receipt mint và trạng thái thu hồi."
      />
      <section className="panel data-panel">
        <QrScanner onScan={scanned} />
        <form className="modal-form" onSubmit={verify}>
          <label>
            Tra cứu bằng
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value)
                invalidate()
              }}
            >
              <option value="token">Contract Address và Token ID</option>
              <option value="certificate">Mã chứng nhận</option>
            </select>
          </label>
          {type === 'token' && (
            <div className="form-two">
              <label>
                Chain ID
                <input
                  required
                  inputMode="numeric"
                  value={chain}
                  onChange={(e) => {
                    setChain(e.target.value)
                    invalidate()
                  }}
                />
              </label>
              <label>
                Contract Address
                <input
                  required
                  value={contract}
                  onChange={(e) => {
                    setContract(e.target.value)
                    invalidate()
                  }}
                />
              </label>
            </div>
          )}
          <label>
            {type === 'token' ? 'Token ID' : 'Mã chứng nhận'}
            <input
              required
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                invalidate()
              }}
              placeholder={type === 'token' ? '0' : 'UUID chứng nhận'}
              pattern={type === 'token' ? '(0|[1-9][0-9]*)' : undefined}
            />
          </label>
          <button className="button button-primary" disabled={busy}>
            Xác minh chứng nhận
          </button>
        </form>
        <DataState loading={busy} error={error} />
        {result && (
          <div
            role="status"
            className={`verification-result verification-${(result.status || 'INVALID').replace(' ', '-').toLowerCase()}`}
          >
            <span className="verification-verdict">{result.status}</span>
            <h2>
              {
                {
                  VALID: 'Chứng nhận hợp lệ trên blockchain',
                  REVOKED: 'Chứng nhận đã bị thu hồi',
                  INVALID: 'Chứng nhận không hợp lệ',
                  'NOT FOUND': 'Không tìm thấy chứng nhận',
                }[result.status]
              }
            </h2>
            <p>{result.message}</p>
            {result.event_name && <h3>{result.event_name}</h3>}
            {result.organization_name && <p>{result.organization_name}</p>}
            <p>
              Token ID: {result.token_id ?? value} · Chain ID:{' '}
              {result.chain_id ?? chain}
            </p>
            {result.issued_at && <p>Ngày cấp: {dateText(result.issued_at)}</p>}
            {result.owner_address && (
              <p className="hash-text">ownerOf: {result.owner_address}</p>
            )}
            {result.metadata_uri && (
              <p className="hash-text">Metadata URI: {result.metadata_uri}</p>
            )}
            <ul className="verification-checks">
              {Object.entries(result.checks || {}).map(([key, passed]) => (
                <li key={key} className={passed ? 'check-pass' : 'check-fail'}>
                  {passed ? '✓' : '✕'} {checkLabels[key] || key}
                </li>
              ))}
            </ul>
            <h3>Lịch sử cấp phát và thu hồi</h3>
            <HistoryTable entries={result.history} chainId={result.chain_id} />
          </div>
        )}
      </section>
    </>
  )
}
