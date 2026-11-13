// Sepolia-only transaction guards. Never log config objects or raw provider errors.
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");

const CHAIN_ID = 11155111;
const ROOT = path.resolve(__dirname, "../..");
const DEPLOYMENT_FILE = path.join(ROOT, "deployments/sepolia.json");

class DeploymentError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function validKey(value) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value || "")) return false;
  try { new ethers.SigningKey(value).publicKey; return true; } catch { return false; }
}

function configurationStatus(env = process.env) {
  let rpcValid = false;
  try {
    const url = new URL(env.SEPOLIA_RPC_URL);
    rpcValid = ["http:", "https:"].includes(url.protocol) && !/YOUR_|REPLACE_|<|>/.test(env.SEPOLIA_RPC_URL);
  } catch {}
  return {
    SEPOLIA_RPC_URL: !env.SEPOLIA_RPC_URL?.trim() ? "missing" : rpcValid ? "configured" : "invalid",
    DEPLOYER_PRIVATE_KEY: !env.DEPLOYER_PRIVATE_KEY?.trim() ? "missing" : validKey(env.DEPLOYER_PRIVATE_KEY.trim()) ? "configured" : "invalid",
    ETHERSCAN_API_KEY: env.ETHERSCAN_API_KEY?.trim() ? "configured" : "missing_optional_for_deploy",
  };
}

function requireEnvironment({ requireKey = true, env = process.env } = {}) {
  const status = configurationStatus(env);
  const required = ["SEPOLIA_RPC_URL", ...(requireKey ? ["DEPLOYER_PRIVATE_KEY"] : [])];
  const missing = required.filter(name => status[name] !== "configured");
  if (missing.length) throw new DeploymentError("MISSING_CONFIGURATION", "Set valid values locally in blockchain/.env: " + missing.join(", "));
  const confirmations = Number(env.SEPOLIA_CONFIRMATIONS || 2);
  if (!Number.isInteger(confirmations) || confirmations < 1 || confirmations > 64) {
    throw new DeploymentError("INVALID_CONFIGURATION", "SEPOLIA_CONFIRMATIONS must be between 1 and 64");
  }
  let maxCostWei;
  try { maxCostWei = ethers.parseEther(env.MAX_TRANSACTION_COST_ETH || "0.02"); } catch {}
  if (!maxCostWei || maxCostWei <= 0n) throw new DeploymentError("INVALID_CONFIGURATION", "MAX_TRANSACTION_COST_ETH must be a positive ETH amount");
  return { confirmations, maxCostWei };
}

function address(value, label) {
  try {
    const normalized = ethers.getAddress(value);
    if (normalized === ethers.ZeroAddress) throw new Error();
    return normalized;
  } catch { throw new DeploymentError("INVALID_ADDRESS", label + " must be a nonzero Ethereum address"); }
}

async function assertSepolia(provider, networkName) {
  if (networkName !== "sepolia") throw new DeploymentError("WRONG_NETWORK", "This command only accepts --network sepolia");
  // Query RPC directly instead of trusting Hardhat's configured chain ID.
  const actual = BigInt(await provider.send("eth_chainId", []));
  if (actual !== BigInt(CHAIN_ID)) throw new DeploymentError("WRONG_CHAIN", "RPC is not Ethereum Sepolia (11155111). No transaction was sent.");
}

async function transactionPlan(provider, signer, request, maxCostWei, networkName = "sepolia") {
  await assertSepolia(provider, networkName);
  if (BigInt(request.value || 0) !== 0n) throw new DeploymentError("VALUE_FORBIDDEN", "Only gas expenditure is allowed; ETH value transfers are disabled");
  const from = await signer.getAddress();
  const estimate = await provider.estimateGas({ ...request, from });
  const gasLimit = (estimate * 120n + 99n) / 100n;
  const fees = await provider.getFeeData();
  const feePerGas = fees.maxFeePerGas ?? fees.gasPrice;
  if (!feePerGas || feePerGas <= 0n) throw new DeploymentError("NO_FEE_DATA", "RPC did not provide valid transaction fees");
  const maximumCost = gasLimit * feePerGas;
  if (maximumCost > maxCostWei) throw new DeploymentError("COST_LIMIT", "Estimated maximum gas cost exceeds MAX_TRANSACTION_COST_ETH");
  const balance = await provider.getBalance(from);
  if (balance < maximumCost) {
    throw new DeploymentError("INSUFFICIENT_SEPOLIA_ETH",
      "Insufficient Sepolia ETH: balance " + ethers.formatEther(balance) +
      ", estimated maximum transaction cost " + ethers.formatEther(maximumCost));
  }
  const feeOverrides = fees.maxFeePerGas != null
    ? { maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 0n }
    : { gasPrice: fees.gasPrice };
  return {
    request: { ...request, ...feeOverrides, gasLimit, chainId: CHAIN_ID },
    summary: {
      deployerAddress: from, balanceSepoliaETH: ethers.formatEther(balance),
      estimatedGas: estimate.toString(), gasLimit: gasLimit.toString(),
      maximumTransactionCostSepoliaETH: ethers.formatEther(maximumCost),
    },
  };
}

async function sendPlanned(provider, signer, plan, networkName = "sepolia") {
  // Repeat the chain check at the actual broadcast boundary.
  await assertSepolia(provider, networkName);
  if (BigInt(plan.request.chainId) !== BigInt(CHAIN_ID)) throw new DeploymentError("WRONG_CHAIN", "Transaction chain ID is not Sepolia");
  return signer.sendTransaction(plan.request);
}

function saveDeployment(data, filename = DEPLOYMENT_FILE) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = filename + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(temporary, filename);
}

function loadDeployment(filename = DEPLOYMENT_FILE) {
  if (!fs.existsSync(filename)) throw new DeploymentError("NO_DEPLOYMENT", "No Sepolia deployment record exists. Deploy first.");
  let data;
  try { data = JSON.parse(fs.readFileSync(filename, "utf8")); } catch {
    throw new DeploymentError("INVALID_DEPLOYMENT", "Sepolia deployment record cannot be parsed");
  }
  if (data.chainId !== CHAIN_ID || data.contractName !== "SoulboundCertificate") {
    throw new DeploymentError("INVALID_DEPLOYMENT", "Deployment record is not a Sepolia SoulboundCertificate");
  }
  address(data.contractAddress, "Deployment contract address");
  return data;
}

async function inspectContract(hre, record) {
  await assertSepolia(hre.ethers.provider, hre.network.name);
  const code = await hre.ethers.provider.getCode(record.contractAddress);
  if (code === "0x") throw new DeploymentError("NO_BYTECODE", "No contract bytecode exists at the recorded Sepolia address");
  const artifact = await hre.artifacts.readArtifact("SoulboundCertificate");
  if (ethers.keccak256(code) !== ethers.keccak256(artifact.deployedBytecode)) {
    throw new DeploymentError("BYTECODE_MISMATCH", "Deployed runtime bytecode differs from the local compiled artifact");
  }
  const contract = await hre.ethers.getContractAt("SoulboundCertificate", record.contractAddress);
  const admin = address(record.adminAddress, "Recorded admin");
  const checks = {
    chainId: CHAIN_ID, contractAddress: record.contractAddress, bytecodeMatches: true,
    name: await contract.name(), symbol: await contract.symbol(),
    adminAddress: admin, adminHasRole: await contract.hasRole(ethers.ZeroHash, admin),
    supportsERC721: await contract.supportsInterface("0x80ac58cd"),
    supportsERC5192: await contract.supportsInterface("0xb45a3c0e"),
    totalSupply: (await contract.totalSupply()).toString(),
  };
  if (!checks.adminHasRole || !checks.supportsERC721 || !checks.supportsERC5192 ||
      checks.name !== "SBT Certificate" || checks.symbol !== "SBTC") {
    throw new DeploymentError("READ_CHECK_FAILED", "Contract admin/interface/metadata checks failed");
  }
  if (BigInt(checks.totalSupply) > 0n) {
    checks.tokenZeroOwner = await contract.ownerOf(0);
    checks.tokenZeroLocked = await contract.locked(0);
    checks.tokenZeroValid = await contract.verifyCertificate(0);
    if (!checks.tokenZeroLocked) throw new DeploymentError("READ_CHECK_FAILED", "Token zero is not locked");
  }
  return { contract, checks };
}

async function confirmedReceipt(tx, confirmations) {
  const receipt = await tx.wait(confirmations, 180000);
  if (!receipt || receipt.status !== 1) throw new DeploymentError("TRANSACTION_FAILED", "Transaction was not successful; retain its deployment record before retrying");
  return receipt;
}

function safeFailure(error) {
  if (error instanceof DeploymentError) console.error(error.code + ": " + error.message);
  else console.error("RPC_OR_TRANSACTION_ERROR: Operation failed. Raw provider details were suppressed to protect credentials. Check RPC availability and the recorded transaction hash before retrying.");
  process.exitCode = 1;
}

module.exports = {
  CHAIN_ID, ROOT, DEPLOYMENT_FILE, DeploymentError, validKey, configurationStatus, requireEnvironment,
  address, assertSepolia, transactionPlan, sendPlanned, saveDeployment, loadDeployment,
  inspectContract, confirmedReceipt, safeFailure,
};
