import { ethers } from 'ethers'

export function certificateIdentity({ chainId, contractAddress, tokenId }) {
  const chain = String(chainId || '')
  const token = String(tokenId ?? '')
  if (!/^[1-9][0-9]*$/.test(chain) || !Number.isSafeInteger(Number(chain)))
    throw new Error('Chain ID không hợp lệ.')
  if (
    !ethers.isAddress(contractAddress) ||
    contractAddress.toLowerCase() === ethers.ZeroAddress
  )
    throw new Error('Contract Address không hợp lệ.')
  if (!/^(0|[1-9][0-9]{0,77})$/.test(token) || BigInt(token) >= 2n ** 256n)
    throw new Error('Token ID phải là số uint256 thập phân.')
  return {
    chainId: Number(chain),
    contractAddress: ethers.getAddress(contractAddress),
    tokenId: token,
  }
}

export function parseCertificateQr(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error('QR không chứa đường dẫn xác thực hợp lệ.')
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.pathname.replace(/\/$/, '') !== '/verify'
  )
    throw new Error('QR không phải đường dẫn xác thực chứng nhận.')
  const keys = ['chainId', 'contractAddress', 'tokenId']
  if (keys.some((key) => url.searchParams.getAll(key).length !== 1))
    throw new Error('QR thiếu hoặc trùng thông tin định danh chứng nhận.')
  return certificateIdentity(
    Object.fromEntries(keys.map((key) => [key, url.searchParams.get(key)])),
  )
}

export function certificatePath(certificate) {
  const identity = certificateIdentity({
    chainId: certificate.chain_id,
    contractAddress: certificate.contract_address,
    tokenId: certificate.token_id,
  })
  return (
    '/verify?' +
    new URLSearchParams(
      Object.fromEntries(
        Object.entries(identity).map(([key, value]) => [key, String(value)]),
      ),
    )
  )
}
