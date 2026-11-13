# SBT Certificate System

QR, PDF, full on-chain verification and certificate history are documented in
[CERTIFICATE_FEATURES.md](CERTIFICATE_FEATURES.md). Upgrade Alembic to `head`
and set `PUBLIC_FRONTEND_URL` to the frontend origin used by QR scanners.

The existing React UI uses FastAPI `/api/v1` endpoints and JWT sessions. Wallet
connection is independent of account login: disconnecting MetaMask does not
erase the JWT or change the server role. No frontend or backend issuance code
accepts a private key. MetaMask signs each mint.

## Run on Windows PowerShell

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
# Copy .env.example to .env if .env does not exist; generate SECRET_KEY.
.venv\Scripts\python.exe -m alembic upgrade head
.venv\Scripts\python.exe -m app.cli create-admin --email you@example.com --name "Administrator"
.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

The backend must allow the actual frontend origin in `CORS_ORIGINS`, for example
`http://localhost:5173,http://127.0.0.1:5173`. Existing database upgrades are
additive. Do not delete the database or use `create_all` to bypass Alembic.
The optional `backend/seed.py` creates demo accounts only when explicitly run;
it never fabricates an issued blockchain certificate.

## Sepolia configuration

Set the same deployed **SoulboundCertificate** address and chain in both apps.
Keep RPC credentials and Pinata tokens in backend `.env`; Vite values are public.
Use a public or domain-restricted RPC endpoint for the browser.

| Backend `.env` | Frontend `.env` |
| --- | --- |
| `CHAIN_ID=11155111` | `VITE_CHAIN_ID=11155111` |
| `SBT_CONTRACT_ADDRESS=0x...` | `VITE_SBT_CONTRACT_ADDRESS=0x...` |
| `WEB3_PROVIDER_URL=https://...` | `VITE_RPC_URL=https://...` |
| `MIN_CONFIRMATIONS=2` | Read from backend before minting |
| `SBT_DEPLOYMENT_BLOCK=<deployment block>` | Not required |
| `PINATA_JWT=...` (optional) | Never expose this token |

Restart both services after changing configuration. `/api/v1/blockchain/config`
reports the public chain/contract/confirmation settings without revealing RPC
credentials. The frontend checks them before minting. The configured address
must have deployed bytecode and the signing wallet must have `ORGANIZER_ROLE`.
JWT organizer permission and contract organizer permission are separate grants.

The contract administrator grants the role using their own wallet or the
existing deployment tooling. The minting wallet needs Sepolia ETH for gas.
The browser always requests a network switch before signing on the wrong chain.

## Issue and verify

1. Sign in as administrator or organizer. Create an organization and an active
   event in **Sự kiện**. Participants register, then an event manager marks their
   attendance **Đã tham dự**.
2. Participants link their receiving addresses in **Hồ sơ**, optionally using
   the connected MetaMask address. Address linking retains the existing API
   behavior and does not claim cryptographic proof of wallet ownership.
3. In **Cấp chứng nhận SBT**, select an event and an attended participant.
   Supply an accessible `ipfs://` metadata JSON containing a `name`, or create
   and pin metadata through the backend with an IPFS image and configured Pinata.
4. Confirm the mint in MetaMask. The browser estimates gas, checks role and
   balance, reserves the mint attempt, broadcasts, stores the hash in a local
   outbox and submits it to the backend. It waits for confirmations, extracts
   the decimal Token ID from `CertificateIssued`, and requests confirmation.
5. FastAPI independently verifies chain, receipt destination/status, canonical
   block, confirmations, emitting contract, event ID, recipient, token ID,
   metadata URI and current certificate state before marking `issued`.
   The issue date comes from the blockchain event timestamp.
6. **Bộ sưu tập** filters the signed-in account's certificates by the current
   wallet. **Đối chiếu blockchain** reads owner, event, URI and revocation directly
   using a read-only ethers provider, then compares with backend verification.
   Token IDs remain decimal strings, including `0` and the full uint256 range.
   Sepolia transaction hashes link to Etherscan.

## Pending, failure and recovery

- Unique database constraints, optimistic concurrency, a server mint lock and
  the contract's permanent `(recipient, eventId)` guard prevent duplicate
  certificates. Rapid clicks do not create more records or mints.
- Definite MetaMask rejection before broadcast releases the attempt. RPC or
  browser timeouts preserve pending state; they never imply a failed mint.
- The local outbox preserves transaction hashes if the backend is temporarily
  offline. **Đồng bộ** resubmits the hash and requests server verification.
- If the browser closes before even storing the hash, the backend scans indexed
  `CertificateIssued` logs starting at the block saved before the signature
  request. Every recovered receipt is fully revalidated. Cursors advance only
  after successful bounded scans and overlap unconfirmed blocks.
- The FastAPI recovery worker runs every `SYNC_INTERVAL_SECONDS` (default 15)
  for pending records with a mint attempt or transaction hash, independently of
  browsers. An API restart resumes persisted attempts/cursors. Multiple workers
  use the existing optimistic revision checks; a competing update is retried
  in a later iteration.
- Manual `POST /certificates/{id}/sync` also repairs older pending records;
  set `SBT_DEPLOYMENT_BLOCK` for these scans and repeat until the cursor catches
  up. Imported records without a mint attempt/hash are not scanned automatically.
- A successful gas speed-up replacement must share the original sender and
  nonce. Confirmed reverts/cancellations become `failed` only after canonical
  confirmation; retry preserves the same certificate record. A fresh browser
  attempt is blocked while another claim is active (10 minutes). After that,
  old logs must be scanned before a new claim can start. Unknown pending
  transactions are never blindly marked failed.
- Database revocation retains the existing registry API semantics. Direct
  on-chain revocation is detected during live verification. Neither is erased
  by replaying an old mint receipt.

## Validation

```powershell
cd backend
.venv\Scripts\python.exe -m pytest -q
.venv\Scripts\python.exe -m ruff check app main.py tests
cd ../blockchain
npm.cmd ci
npm.cmd test
npm.cmd run test:integration
cd ../frontend
npm.cmd ci
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

Browser tests use isolated SQLite, Vite, a disposable Hardhat node and an
EIP-1193 wallet adapter connected to real local EVM bytecode. They cover JWT,
role protection, wallet events/rejection and actual browser mint/receipt/log
recovery. Metadata retrieval is intercepted with a fixed test JSON, while
backend chain verification uses real JSON-RPC. These tests neither control the
user's MetaMask extension nor prove a public Sepolia deployment. A final Sepolia
test requires the actual contract/RPC configuration and the user's wallet
confirmation; no private key is requested by the app.

Reference: [ethers v6 providers](https://docs.ethers.org/v6/api/providers/) and
[MetaMask provider events](https://docs.metamask.io/metamask-connect/evm/reference/provider-api/).
