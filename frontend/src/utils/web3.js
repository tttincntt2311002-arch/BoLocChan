/**
 * Web3 / ethers.js v6 utilities for MetaMask and contract interaction
 */
import { ethers } from 'ethers'
import { APP_CONFIG, SEPOLIA_CHAIN_PARAMS } from './constants'

/**
 * Returns a BrowserProvider connected to MetaMask
 * @throws Error if MetaMask is not installed
 */
export function getProvider() {
  if (!window.ethereum) {
    throw new Error('MetaMask không được tìm thấy. Vui lòng cài đặt MetaMask extension.')
  }
  return new ethers.BrowserProvider(window.ethereum)
}

/**
 * Requests wallet connection and returns the first account address
 */
export async function connectWallet() {
  const provider = getProvider()
  const accounts = await provider.send('eth_requestAccounts', [])
  return accounts[0]
}

/**
 * Returns the currently connected account (or null)
 */
export async function getConnectedAccount() {
  if (!window.ethereum) return null
  const accounts = await window.ethereum.request({ method: 'eth_accounts' })
  return accounts[0] || null
}

/**
 * Switches MetaMask to Sepolia. Adds the network if not present.
 */
export async function switchToSepolia() {
  const targetChainId = SEPOLIA_CHAIN_PARAMS.chainId
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetChainId }],
    })
  } catch (error) {
    // Chain not added – add it
    if (error.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [SEPOLIA_CHAIN_PARAMS],
      })
    } else {
      throw error
    }
  }
}

/**
 * Returns the current chain ID from MetaMask
 */
export async function getChainId() {
  if (!window.ethereum) return null
  const provider = getProvider()
  const network = await provider.getNetwork()
  return Number(network.chainId)
}

/**
 * Returns true if the connected chain is Sepolia
 */
export async function isOnSepolia() {
  const chainId = await getChainId()
  return chainId === APP_CONFIG.chainId
}

/**
 * Formats a hex wallet address to shorter display form
 * e.g. 0x1234...abcd
 */
export function formatAddress(address, chars = 4) {
  if (!address) return ''
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

/**
 * Formats wei to ETH string with given decimal places
 */
export function formatEther(wei, decimals = 4) {
  return parseFloat(ethers.formatEther(wei)).toFixed(decimals)
}

/**
 * Returns an IPFS URL via the configured gateway
 */
export function ipfsToHttp(ipfsUri) {
  if (!ipfsUri) return ''
  if (ipfsUri.startsWith('ipfs://')) {
    return `${APP_CONFIG.ipfsGateway}${ipfsUri.slice(7)}`
  }
  return ipfsUri
}

/**
 * Subscribe to MetaMask account / chain change events
 */
export function subscribeToWalletEvents({ onAccountsChanged, onChainChanged }) {
  if (!window.ethereum) return () => {}

  const handleAccounts = (accounts) => onAccountsChanged?.(accounts)
  const handleChain    = (chainId)  => onChainChanged?.(Number(chainId))

  window.ethereum.on('accountsChanged', handleAccounts)
  window.ethereum.on('chainChanged',    handleChain)

  // Returns an unsubscribe function
  return () => {
    window.ethereum.removeListener('accountsChanged', handleAccounts)
    window.ethereum.removeListener('chainChanged',    handleChain)
  }
}
