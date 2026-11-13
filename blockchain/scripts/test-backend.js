// Real local JSON-RPC + deployed EVM bytecode + the actual Python verifier.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { ethers } = require("ethers");

const root = path.resolve(__dirname, "..");
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function main() {
  const port = await freePort();
  const rpcUrl = "http://127.0.0.1:" + port;
  const cli = path.join(root, "node_modules/hardhat/internal/cli/cli.js");
  const server = spawn(process.execPath, [cli, "node", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HARDHAT_DISABLE_TELEMETRY_PROMPT: "true" },
  });
  // Hardhat prints its public development keys; deliberately do not echo that output.
  server.stdout.on("data", () => {});
  let errorOutput = "";
  server.stderr.on("data", data => { errorOutput = (errorOutput + data.toString()).slice(-2000); });
  let launchError;
  server.on("error", error => { launchError = error; });
  const provider = new ethers.JsonRpcProvider(rpcUrl, 31337, { staticNetwork: true, pollingInterval: 100 });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (launchError) throw launchError;
      if (server.exitCode !== null) throw new Error("Hardhat node stopped: " + errorOutput);
      try { await provider.send("eth_chainId", []); ready = true; break; } catch {}
      await sleep(100);
    }
    if (!ready) throw new Error("Hardhat JSON-RPC node did not become ready");
    const admin = await provider.getSigner(0);
    const organizer = await provider.getSigner(1);
    const recipient = await provider.getSigner(2);
    const artifact = JSON.parse(fs.readFileSync(path.join(root, "artifacts/contracts/SoulboundCertificate.sol/SoulboundCertificate.json"), "utf8"));
    const contract = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, admin).deploy(await admin.getAddress());
    await contract.waitForDeployment();
    await (await contract.grantRole(await contract.ORGANIZER_ROLE(), await organizer.getAddress())).wait();
    const eventId = randomUUID();
    const uri = "ipfs://bafyintegration/metadata.json";
    const hash = ethers.id("canonical integration certificate");
    const tx = await contract.connect(organizer).mintCertificate(await recipient.getAddress(), eventId, uri, hash);
    await tx.wait();
    await provider.send("evm_mine", []);
    const certificate = {
      event_id: eventId, recipient_wallet: (await recipient.getAddress()).toLowerCase(),
      token_uri: uri, token_id: "0", chain_id: 31337,
      contract_address: (await contract.getAddress()).toLowerCase(),
    };
    const defaultPython = path.resolve(root, "../backend/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
    const python = process.env.PYTHON || (fs.existsSync(defaultPython) ? defaultPython : "python");
    function check(expectedValid) {
      const result = spawnSync(python, [path.join(__dirname, "check-backend.py")], {
        cwd: root, windowsHide: true, encoding: "utf8", timeout: 30000,
        input: JSON.stringify({ rpc_url: rpcUrl, certificate, tx_hash: tx.hash.toLowerCase(), expected_valid: expectedValid }),
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error("Python verifier failed: " + result.stderr);
      return JSON.parse(result.stdout);
    }
    assert.equal(check(true).receipt_verified, true);
    assert.equal(await contract.locked(0), true);
    await (await contract.connect(organizer).revokeCertificate(0)).wait();
    assert.equal(check(false).is_valid, false);
    assert.equal(await contract.locked(0), true);
    assert.equal(await contract.ownerOf(0), await recipient.getAddress());
    console.log("PASS: deployed bytecode, organizer grant, mint receipt and metadata verified over real JSON-RPC.");
    console.log("PASS: Python backend confirms CertificateIssued, decodes live state and detects on-chain revocation.");
    console.log("PASS: revoked token remains owned and locked; no developer database or running server was modified.");
  } finally {
    provider.destroy();
    if (server.exitCode === null) server.kill();
    await Promise.race([new Promise(resolve => server.once("exit", resolve)), sleep(3000)]);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
