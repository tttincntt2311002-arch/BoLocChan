// Disposable EVM for browser tests. Development keys never leave Hardhat.
const { spawn, spawnSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const { createRequire } = require('node:module')
const root = path.resolve(__dirname, '../../blockchain')
const { ethers } = createRequire(path.join(root, 'package.json'))('ethers')
const rpc = 'http://127.0.0.1:18545'
const compile = spawnSync(
  process.execPath,
  [path.join(root, 'node_modules/hardhat/internal/cli/cli.js'), 'compile'],
  {
    cwd: root,
    windowsHide: true,
    stdio: 'pipe',
    timeout: 60000,
  },
)
if (compile.error || compile.status !== 0) {
  console.error(
    'Test contract compilation failed. Run npm.cmd run compile in blockchain for details.',
  )
  process.exit(1)
}
const child = spawn(
  process.execPath,
  [
    path.join(root, 'node_modules/hardhat/internal/cli/cli.js'),
    'node',
    '--hostname',
    '127.0.0.1',
    '--port',
    '18545',
  ],
  {
    cwd: root,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)
child.stdout.on('data', () => {})
child.stderr.on('data', () => {})
let launchError
child.on('error', (error) => {
  launchError = error
})
const provider = new ethers.JsonRpcProvider(rpc, undefined, {
  pollingInterval: 100,
})
let server
async function main() {
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (launchError) throw launchError
    if (child.exitCode !== null)
      throw new Error('Browser-test Hardhat node stopped')
    try {
      await provider.send('eth_chainId', [])
      ready = true
      break
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!ready) throw new Error('Browser-test RPC did not start')
  const signer = await provider.getSigner(0)
  const artifact = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        'artifacts/contracts/SoulboundCertificate.sol/SoulboundCertificate.json',
      ),
    ),
  )
  const contract = await new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    signer,
  ).deploy(await signer.getAddress())
  await contract.waitForDeployment()
  await (
    await contract.grantRole(
      await contract.ORGANIZER_ROLE(),
      await signer.getAddress(),
    )
  ).wait()
  await (
    await contract.grantRole(
      await contract.ORGANIZER_ROLE(),
      await (await provider.getSigner(1)).getAddress(),
    )
  ).wait()
  if (
    (await contract.getAddress()).toLowerCase() !==
    '0x5fbdb2315678afecb367f032d93f642f64180aa3'
  )
    throw new Error('Unexpected test contract address')
  server = http
    .createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5178')
      res.setHeader('Access-Control-Allow-Headers', 'content-type')
      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }
      if (req.method === 'GET') {
        res.end('ready')
        return
      }
      try {
        let body = ''
        for await (const chunk of req) body += chunk
        const response = await fetch(rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        })
        res.setHeader('Content-Type', 'application/json')
        res.end(await response.text())
      } catch {
        res.writeHead(502)
        res.end('RPC unavailable')
      }
    })
    .listen(18546, '127.0.0.1')
  console.log(
    'Browser-test EVM deployed; backend will independently verify real receipts.',
  )
}
function stop(code = 0) {
  server?.close()
  provider.destroy()
  child.kill()
  process.exit(typeof code === 'number' ? code : 0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
main().catch((error) => {
  console.error(error.message)
  stop(1)
})
