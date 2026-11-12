// scripts/exportAbi.js
// Standalone ABI export (without deploying)
const fs = require("fs");
const path = require("path");

const ARTIFACT_PATH = path.join(
  __dirname,
  "../artifacts/contracts/SBTCertificate.sol/SBTCertificate.json"
);

const TARGETS = [
  path.join(__dirname, "../../frontend/src/utils/SBTCertificate.abi.json"),
  path.join(__dirname, "../../backend/app/core/SBTCertificate.abi.json"),
];

function exportAbi() {
  if (!fs.existsSync(ARTIFACT_PATH)) {
    console.error(
      "Artifact not found. Run `npm run compile` in the blockchain directory first."
    );
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));
  const exportData = {
    contractName: "SBTCertificate",
    contractAddress: process.env.SBT_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000",
    abi: artifact.abi,
    exportedAt: new Date().toISOString(),
  };

  for (const target of TARGETS) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(exportData, null, 2));
    console.log("Exported ABI to:", target);
  }
}

exportAbi();
