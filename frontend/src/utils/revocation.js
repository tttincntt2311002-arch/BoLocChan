import api from './api'
import { mintContext } from './web3'

const active = new Set()
export async function revokeCertificate(certificate, address, stage) {
  if (active.has(certificate.id)) throw new Error('Chứng nhận đang được xử lý.')
  active.add(certificate.id)
  let context
  try {
    if (certificate.revocation_tx_hash)
      return (
        await api.post(
          `/certificates/${certificate.id}/sync`,
          {},
          { timeout: 90000 },
        )
      ).data
    context = await mintContext(address, { allowAdmin: true })
    if (await context.contract.isRevoked(certificate.token_id)) {
      await api.get('/verify/blockchain', {
        params: {
          chain_id: certificate.chain_id,
          contract_address: certificate.contract_address,
          token_id: certificate.token_id,
        },
        timeout: 90000,
      })
      return (await api.get(`/certificates/${certificate.id}`)).data
    }
    await context.contract.revokeCertificate.estimateGas(certificate.token_id)
    stage('Hãy xác nhận thu hồi trong MetaMask…')
    const tx = await context.contract.revokeCertificate(certificate.token_id)
    stage('Đã gửi giao dịch thu hồi. Đang chờ xác nhận…')
    await api
      .patch(`/certificates/${certificate.id}/revocation-transaction`, {
        tx_hash: tx.hash,
      })
      .catch(() => {})
    await tx.wait(context.config.min_confirmations, 120000)
    const { data } = await api.get('/verify/blockchain', {
      params: {
        chain_id: certificate.chain_id,
        contract_address: certificate.contract_address,
        token_id: certificate.token_id,
      },
      timeout: 90000,
    })
    if (data.status !== 'REVOKED')
      throw new Error('Chưa xác minh được thu hồi. Hãy đồng bộ lại lịch sử.')
    return (await api.get(`/certificates/${certificate.id}`)).data
  } finally {
    context?.provider.destroy()
    active.delete(certificate.id)
  }
}
