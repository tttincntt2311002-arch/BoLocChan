/**
 * Shared application constants
 * All values are read from VITE_ environment variables
 */

const chainId = Number(import.meta.env.VITE_CHAIN_ID || 11155111)
const networkDefaults = {
  11155111: {
    name: 'Sepolia',
    rpcUrl: 'https://rpc.sepolia.org',
    blockExplorerUrl: 'https://sepolia.etherscan.io',
  },
  31337: {
    name: 'Hardhat Local',
    rpcUrl: 'http://127.0.0.1:8545',
    blockExplorerUrl: '',
  },
}[chainId]

export const APP_CONFIG = {
  name: import.meta.env.VITE_APP_NAME || 'SBT Certificate System',
  apiBaseUrl:
    import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1',
  chainId,
  chainName:
    import.meta.env.VITE_CHAIN_NAME ||
    networkDefaults?.name ||
    `Chain ${chainId}`,
  rpcUrl: import.meta.env.VITE_RPC_URL || networkDefaults?.rpcUrl || '',
  blockExplorerUrl: (
    import.meta.env.VITE_BLOCK_EXPLORER_URL ??
    networkDefaults?.blockExplorerUrl ??
    ''
  ).replace(/\/+$/, ''),
  contractAddress:
    import.meta.env.VITE_SBT_CONTRACT_ADDRESS ||
    '0x0000000000000000000000000000000000000000',
  ipfsGateway:
    import.meta.env.VITE_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/',
}

export const CHAIN_PARAMS = {
  chainId: `0x${APP_CONFIG.chainId.toString(16)}`,
  chainName: APP_CONFIG.chainName,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: [APP_CONFIG.rpcUrl],
  ...(APP_CONFIG.blockExplorerUrl
    ? { blockExplorerUrls: [APP_CONFIG.blockExplorerUrl] }
    : {}),
}

export const CERTIFICATE_STATUS = {
  PENDING: 'pending',
  MINTING: 'minting',
  ISSUED: 'issued',
  REVOKED: 'revoked',
  FAILED: 'failed',
}

export const API_ENDPOINTS = {
  // Email/password JWT authentication
  AUTH_LOGIN: '/auth/login',
  AUTH_ME: '/auth/me',
  AUTH_LOGOUT: '/auth/logout',
  // Users
  USERS: '/users',
  // Events
  EVENTS: '/events',
  // Certificates
  CERTIFICATES: '/certificates',
  CERTIFICATES_ISSUE: '/certificates/issue',
  CERTIFICATES_BATCH: '/certificates/issue/batch',
  // Verification (public)
  VERIFY_TOKEN: (id) => `/verify/token/${id}`,
  VERIFY_CERT: (id) => `/verify/certificate/${id}`,
  // IPFS
  IPFS_METADATA: '/ipfs/upload/metadata',
}
