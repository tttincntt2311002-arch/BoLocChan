import { ethers } from 'ethers'
import axios from 'axios'
import exported from './SoulboundCertificate.abi.json'
import { APP_CONFIG, SEPOLIA_CHAIN_PARAMS } from './constants'
import api from './api'

let readProvider
export const certificateInterface = new ethers.Interface(exported.abi)
export function injectedWallet() {
  const injected = window.ethereum
  return (
    injected?.providers?.find((provider) => provider.isMetaMask) || injected
  )
}
export function getProvider() {
  const wallet = injectedWallet()
  if (!wallet)
    throw new Error(
      'Chưa cài MetaMask. Hãy cài extension MetaMask để kết nối ví.',
    )
  return new ethers.BrowserProvider(wallet)
}
export function getReadProvider() {
  if (!readProvider) {
    const request = new ethers.FetchRequest(APP_CONFIG.rpcUrl)
    request.timeout = 15000
    readProvider = new ethers.JsonRpcProvider(request)
  }
  return readProvider
}
export function contractAddress() {
  if (
    !ethers.isAddress(APP_CONFIG.contractAddress) ||
    APP_CONFIG.contractAddress === ethers.ZeroAddress
  ) {
    throw new Error(
      'Chưa cấu hình VITE_SBT_CONTRACT_ADDRESS của contract đã triển khai.',
    )
  }
  return ethers.getAddress(APP_CONFIG.contractAddress)
}
export function getContract(runner = getReadProvider()) {
  return new ethers.Contract(contractAddress(), exported.abi, runner)
}
export async function connectWallet() {
  const wallet = injectedWallet()
  if (!wallet)
    throw new Error(
      'Chưa cài MetaMask. Hãy cài extension MetaMask để kết nối ví.',
    )
  const accounts = await wallet.request({ method: 'eth_requestAccounts' })
  if (!accounts[0]) throw new Error('Bạn chưa kết nối ví.')
  return ethers.getAddress(accounts[0])
}
export async function getConnectedAccount() {
  const accounts = await injectedWallet()?.request({ method: 'eth_accounts' })
  return accounts?.[0] ? ethers.getAddress(accounts[0]) : null
}
export async function getChainId() {
  const chain = await injectedWallet()?.request({ method: 'eth_chainId' })
  return chain ? Number(chain) : null
}
export async function switchToSepolia() {
  const wallet = injectedWallet()
  if (!wallet) throw new Error('Chưa cài MetaMask.')
  try {
    await wallet.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_PARAMS.chainId }],
    })
  } catch (error) {
    if ((error.code ?? error.data?.originalError?.code) !== 4902) throw error
    await wallet.request({
      method: 'wallet_addEthereumChain',
      params: [SEPOLIA_CHAIN_PARAMS],
    })
    await wallet.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_PARAMS.chainId }],
    })
  }
  if ((await getChainId()) !== APP_CONFIG.chainId)
    throw new Error('Ví chưa chuyển sang mạng được cấu hình.')
}
export const isOnSepolia = async () =>
  (await getChainId()) === APP_CONFIG.chainId
export const formatAddress = (address, chars = 4) =>
  address ? `${address.slice(0, chars + 2)}…${address.slice(-chars)}` : ''
export const formatEther = (wei, decimals = 4) =>
  Number(ethers.formatEther(wei)).toFixed(decimals)
export const ipfsToHttp = (uri) =>
  uri?.startsWith('ipfs://')
    ? `${APP_CONFIG.ipfsGateway}${uri.slice(7)}`
    : uri || ''
export const transactionUrl = (hash, chainId = APP_CONFIG.chainId) =>
  Number(chainId) === 11155111 && /^0x[0-9a-f]{64}$/i.test(hash || '')
    ? `https://sepolia.etherscan.io/tx/${hash}`
    : null
export async function loadMetadata(uri) {
  if (!uri?.startsWith('ipfs://'))
    throw new Error('Metadata phải dùng URI ipfs://.')
  try {
    const { data } = await axios.get(ipfsToHttp(uri), { timeout: 15000 })
    if (!data || typeof data !== 'object' || typeof data.name !== 'string')
      throw new Error('Invalid metadata')
    return data
  } catch {
    throw new Error(
      'Không tải được metadata từ IPFS. Kiểm tra URI hoặc gateway rồi thử lại.',
    )
  }
}
export async function mintContext(
  expectedAddress,
  { allowAdmin = false } = {},
) {
  if (!expectedAddress || !(await getConnectedAccount()))
    throw new Error('Bạn chưa kết nối ví MetaMask.')
  if (!(await isOnSepolia())) await switchToSepolia()
  const { data: config } = await api.get('/blockchain/config')
  if (!config.configured)
    throw new Error(
      'Backend chưa cấu hình RPC và contract để xác minh giao dịch.',
    )
  if (
    config.chain_id !== APP_CONFIG.chainId ||
    config.contract_address.toLowerCase() !== contractAddress().toLowerCase()
  ) {
    throw new Error(
      'Cấu hình chain hoặc contract giữa frontend và backend không trùng nhau.',
    )
  }
  const provider = getProvider()
  try {
    const signer = await provider.getSigner(expectedAddress)
    if (
      (await signer.getAddress()).toLowerCase() !==
      expectedAddress.toLowerCase()
    )
      throw new Error('Tài khoản ví đã thay đổi. Hãy thử lại.')
    if ((await provider.getCode(contractAddress())) === '0x')
      throw new Error(
        'Không có smart contract tại địa chỉ đã cấu hình trên mạng này.',
      )
    const contract = getContract(signer)
    if (
      !(await contract.hasRole(
        await contract.ORGANIZER_ROLE(),
        expectedAddress,
      )) &&
      !(
        allowAdmin && (await contract.hasRole(ethers.ZeroHash, expectedAddress))
      )
    )
      throw new Error('Ví hiện tại chưa được cấp ORGANIZER_ROLE trên contract.')
    return { contract, provider, config }
  } catch (error) {
    provider.destroy()
    throw error
  }
}
export function issuedToken(receipt, certificate) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contractAddress().toLowerCase()) continue
    let parsed
    try {
      parsed = certificateInterface.parseLog(log)
    } catch {
      continue
    }
    if (
      parsed?.name === 'CertificateIssued' &&
      parsed.args.recipient.toLowerCase() ===
        certificate.recipient_wallet.toLowerCase() &&
      parsed.args.eventId.hash === ethers.id(certificate.event_id) &&
      parsed.args.metadataURI === certificate.token_uri
    )
      return parsed.args.tokenId.toString()
  }
  throw new Error(
    'Receipt không chứa CertificateIssued khớp với chứng nhận. Hãy đồng bộ lại.',
  )
}
export function subscribeToWalletEvents({
  onAccountsChanged,
  onChainChanged,
  onDisconnect,
}) {
  const wallet = injectedWallet()
  if (!wallet?.on) return () => {}
  const accounts = (value) => onAccountsChanged?.(value)
  const chain = (value) => onChainChanged?.(Number(value))
  const disconnect = () => onDisconnect?.()
  wallet.on('accountsChanged', accounts)
  wallet.on('chainChanged', chain)
  wallet.on('disconnect', disconnect)
  return () => {
    wallet.removeListener('accountsChanged', accounts)
    wallet.removeListener('chainChanged', chain)
    wallet.removeListener('disconnect', disconnect)
  }
}
