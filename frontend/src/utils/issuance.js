import { ethers } from 'ethers'
import api from './api'
import {
  getChainId,
  getConnectedAccount,
  issuedToken,
  loadMetadata,
  mintContext,
} from './web3'
import { wasRejected } from './errors'
import { APP_CONFIG } from './constants'

const active = new Set()
const outboxKey = (userId) => `sbt-mint-outbox:${userId}`
function readOutbox(userId) {
  try {
    const stored = JSON.parse(localStorage.getItem(outboxKey(userId)) || '{}')
    if (!stored || typeof stored !== 'object' || Array.isArray(stored))
      return {}
    return Object.fromEntries(
      Object.entries(stored).filter(([, hash]) =>
        /^0x[0-9a-f]{64}$/i.test(hash),
      ),
    )
  } catch {
    return {}
  }
}
function remember(userId, certificateId, hash) {
  try {
    localStorage.setItem(
      outboxKey(userId),
      JSON.stringify({ ...readOutbox(userId), [certificateId]: hash }),
    )
  } catch {
    /* Server log recovery remains available. */
  }
}
function forget(userId, certificateId) {
  const records = readOutbox(userId)
  delete records[certificateId]
  try {
    localStorage.setItem(outboxKey(userId), JSON.stringify(records))
  } catch {
    /* Optional browser cache. */
  }
}
export async function syncCertificate(certificate, userId) {
  const hash = readOutbox(userId)[certificate.id]
  if (
    hash &&
    hash !== certificate.tx_hash &&
    certificate.status === 'pending'
  ) {
    await api.patch(`/certificates/${certificate.id}/transaction`, {
      tx_hash: hash,
    })
  }
  const { data } = await api.post(
    `/certificates/${certificate.id}/sync`,
    {},
    { timeout: 60000 },
  )
  if (['issued', 'failed', 'revoked'].includes(data.status))
    forget(userId, certificate.id)
  return data
}

export async function mintCertificate(certificate, address, userId, stage) {
  if (active.has(certificate.id))
    throw new Error('Chứng nhận đang được xử lý trong trình duyệt này.')
  active.add(certificate.id)
  let context, attempt, tx
  let claimed = false
  let broadcastRequested = false
  try {
    stage('Đang kiểm tra ví, metadata và contract…')
    context = await mintContext(address)
    const { data: fresh } = await api.get(`/certificates/${certificate.id}`)
    certificate = fresh
    if (certificate.status === 'issued') return certificate
    if (certificate.status === 'failed') {
      // The server has established failure. Never attach this failed hash to
      // the new attempt, including when the worker failed it while we were away.
      forget(userId, certificate.id)
      certificate = (await api.post(`/certificates/${certificate.id}/retry`))
        .data
    }
    if (certificate.tx_hash || readOutbox(userId)[certificate.id])
      return await syncCertificate(certificate, userId)
    if (certificate.status !== 'pending')
      throw new Error('Chứng nhận không còn ở trạng thái chờ cấp.')
    if (
      !ethers.isAddress(certificate.recipient_wallet) ||
      certificate.recipient_wallet === ethers.ZeroAddress
    )
      throw new Error('Ví người nhận không hợp lệ.')
    if (
      await context.contract.hasCertificate(
        certificate.recipient_wallet,
        certificate.event_id,
      )
    ) {
      const recovered = await syncCertificate(certificate, userId)
      if (recovered.status === 'pending')
        throw new Error(
          'Ví đã có chứng nhận cho sự kiện này. Tiếp tục đồng bộ event logs; không gửi thêm giao dịch.',
        )
      return recovered
    }
    const metadata = await loadMetadata(certificate.token_uri)
    const hash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(metadata)))
    const args = [
      certificate.recipient_wallet,
      certificate.event_id,
      certificate.token_uri,
      hash,
    ]
    const gas = await context.contract.mintCertificate.estimateGas(...args)
    const fees = await context.provider.getFeeData()
    const balance = await context.provider.getBalance(address)
    if (balance < gas * (fees.maxFeePerGas ?? fees.gasPrice ?? 0n))
      throw new Error('Ví không đủ Sepolia ETH để trả gas.')
    attempt = crypto.randomUUID()
    await api.post(`/certificates/${certificate.id}/mint-claim`, {
      attempt_id: attempt,
    })
    claimed = true
    if (
      (await getConnectedAccount())?.toLowerCase() !== address.toLowerCase() ||
      (await getChainId()) !== APP_CONFIG.chainId
    ) {
      throw new Error(
        'Ví hoặc mạng đã thay đổi trong lúc chuẩn bị. Hãy đồng bộ rồi thử lại.',
      )
    }
    stage('Hãy xác nhận giao dịch trong MetaMask…')
    broadcastRequested = true
    tx = await context.contract.mintCertificate(...args)
    remember(userId, certificate.id, tx.hash)
    stage('Đã gửi giao dịch. Đang chờ blockchain xác nhận…')
    // A temporary backend outage must not interrupt receipt tracking.
    await api
      .patch(`/certificates/${certificate.id}/transaction`, {
        tx_hash: tx.hash,
      })
      .catch(() => {})
    let receipt
    try {
      receipt = await tx.wait(context.config.min_confirmations, 120000)
    } catch (error) {
      if (error.code !== 'TRANSACTION_REPLACED') throw error
      remember(userId, certificate.id, error.replacement.hash)
      await api.patch(`/certificates/${certificate.id}/transaction`, {
        tx_hash: error.replacement.hash,
      })
      if (error.cancelled)
        return await syncCertificate(
          { ...certificate, tx_hash: error.replacement.hash },
          userId,
        )
      receipt = error.receipt
    }
    if (!receipt || receipt.status !== 1)
      throw new Error(
        'Giao dịch thất bại. Hãy đồng bộ trạng thái từ blockchain.',
      )
    const tokenId = issuedToken(receipt, certificate)
    stage('Backend đang xác minh receipt và event CertificateIssued…')
    const { data } = await api.post(
      `/certificates/${certificate.id}/confirm`,
      { token_id: tokenId, tx_hash: receipt.hash },
      { timeout: 60000 },
    )
    forget(userId, certificate.id)
    return data
  } catch (error) {
    if (claimed && !tx && (!broadcastRequested || wasRejected(error))) {
      await api
        .post(`/certificates/${certificate.id}/mint-release`, {
          attempt_id: attempt,
        })
        .catch(() => {})
    }
    throw error
  } finally {
    active.delete(certificate.id)
    context?.provider.destroy()
  }
}
