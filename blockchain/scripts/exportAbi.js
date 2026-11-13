// Deterministic ABI export; no deployment or private key is required.
const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();

function exportAbi({ contractAddress = process.env.SBT_CONTRACT_ADDRESS || null, network = null } = {}) {
  if (contractAddress && !/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
    throw new Error("SBT_CONTRACT_ADDRESS must be a 20-byte hex address");
  }
  const artifactPath = path.join(__dirname, "../artifacts/contracts/SoulboundCertificate.sol/SoulboundCertificate.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const payload = JSON.stringify({
    contractName: "SoulboundCertificate", contractAddress, network, abi: artifact.abi,
  }, null, 2) + "\n";
  for (const target of [
    "../../frontend/src/utils/SoulboundCertificate.abi.json",
    "../../backend/app/core/SoulboundCertificate.abi.json",
  ]) {
    const absolute = path.resolve(__dirname, target);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, payload);
    console.log("ABI exported:", path.relative(path.join(__dirname, "../.."), absolute));
  }
}

if (require.main === module) {
  try { exportAbi(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { exportAbi };
