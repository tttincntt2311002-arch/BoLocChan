import { test, expect } from '@playwright/test'
import QRCode from 'qrcode'
import { readFile, writeFile } from 'node:fs/promises'
import { Contract, JsonRpcProvider, id } from 'ethers'

const API = 'http://127.0.0.1:8011/api/v1'
const adminWallet = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const recipientWallet = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'

test('admin provisions organizer, organizer manages attendance, participant links wallet, public QR detects revocation', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(120000)
  const account = 'qa-organizer-' + Date.now() + '@example.com'
  const created = await request.post(API + '/auth/register', {
    data: {
      email: account,
      full_name: 'QA Organizer',
      password: 'DemoSBT2026!',
    },
  })
  expect(created.status()).toBe(201)
  const organizer = await created.json()
  await wallet(page)
  await login(page)
  const adminToken = await page.evaluate(() =>
    localStorage.getItem('sbt_access_token'),
  )
  const promoted = await request.patch(`${API}/users/${organizer.id}`, {
    headers: { Authorization: 'Bearer ' + adminToken },
    data: { role: 'organizer' },
  })
  expect(promoted.ok()).toBeTruthy()
  const users = await (
    await request.get(API + '/users', {
      headers: { Authorization: 'Bearer ' + adminToken },
    })
  ).json()
  const person = users.items.find(
    (item) => item.email === 'participant@example.com',
  )
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
  await login(page, account)
  await page.goto('/events')
  await page.getByLabel('Tên tổ chức', { exact: true }).fill('QA Organization')
  await page.getByLabel('Slug', { exact: true }).fill('qa-org-' + Date.now())
  await page.getByRole('button', { name: 'Tạo tổ chức', exact: true }).click()
  await expect(page.getByLabel('Tên tổ chức', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Tạo sự kiện', exact: true }).click()
  const name = 'QA Organizer Event ' + Date.now()
  await page.getByLabel('Tên sự kiện', { exact: true }).fill(name)
  await page
    .getByLabel('Ngày bắt đầu', { exact: true })
    .fill('2099-01-02T10:00')
  await page
    .getByLabel('Ngày kết thúc', { exact: true })
    .fill('2099-01-02T09:00')
  await page.getByRole('button', { name: 'Lưu sự kiện', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Ngày kết thúc phải sau ngày bắt đầu',
  )
  await page
    .getByLabel('Ngày kết thúc', { exact: true })
    .fill('2099-01-02T12:00')
  await page.getByRole('button', { name: 'Lưu sự kiện', exact: true }).click()
  const row = page.locator('article').filter({ hasText: name })
  await expect(row).toBeVisible()
  const headers = {
    Authorization:
      'Bearer ' +
      (await page.evaluate(() => localStorage.getItem('sbt_access_token'))),
  }
  const events = await (
    await request.get(API + '/events', { headers, params: { q: name } })
  ).json()
  const event = events.items.find((item) => item.name === name)
  expect(event).toBeTruthy()
  await row
    .getByRole('button', { name: 'Chi tiết & người tham gia', exact: true })
    .click()
  await page
    .getByLabel('Mã tài khoản người tham gia', { exact: true })
    .fill(person.id)
  await page
    .getByRole('button', { name: 'Thêm người tham gia', exact: true })
    .click()
  await page
    .getByLabel('Điểm danh Demo Participant', { exact: true })
    .selectOption('attended')
  await expect(
    page.getByLabel('Điểm danh Demo Participant', { exact: true }),
  ).toBeEnabled()

  // Separate participant browser session; use a wallet address distinct from the organizer.
  const recipientContext = await browser.newContext()
  const recipient = await recipientContext.newPage()
  const anonymousContext = await browser.newContext()
  const anonymous = await anonymousContext.newPage()
  try {
    await wallet(recipient, { account: recipientWallet })
    await recipient.route('https://fonts.googleapis.com/**', (route) =>
      route.abort(),
    )
    await anonymous.route('https://fonts.googleapis.com/**', (route) =>
      route.abort(),
    )
    await login(recipient, 'participant@example.com')
    await recipient.goto('/profile')
    await recipient
      .getByRole('button', {
        name: 'Liên kết ví MetaMask hiện tại',
        exact: true,
      })
      .click()
    await expect(
      recipient.getByLabel('Địa chỉ ví Ethereum', { exact: true }),
    ).toHaveValue(recipientWallet)
    await page.goto(`/certificates?event=${event.id}`)
    await page
      .getByRole('combobox', { name: 'Người đã tham dự', exact: true })
      .selectOption(person.id)
    await page
      .getByLabel('Metadata URI', { exact: true })
      .fill('ipfs://bafytest/metadata.json')
    await page
      .getByRole('button', { name: 'Cấp chứng nhận qua MetaMask', exact: true })
      .click()
    await expect(
      page.getByText(/Đã xác minh và lưu chứng nhận Token #/),
    ).toBeVisible({ timeout: 30000 })
    const records = await (
      await request.get(API + '/certificates', {
        headers,
        params: { event_id: event.id },
      })
    ).json()
    expect(records.total).toBe(1)
    expect(records.items[0].status).toBe('issued')
    await recipient.goto('/my-certificates')
    await expect(
      recipient.locator('article').filter({ hasText: name }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Xem chứng nhận', exact: true })
      .click()
    await page.getByRole('button', { name: 'QR xác thực', exact: true }).click()
    const qr = await page
      .getByRole('img', {
        name: `QR xác thực Token ${records.items[0].token_id}`,
      })
      .getAttribute('src')
    const qrBytes = Buffer.from(qr.split(',')[1], 'base64')
    await anonymous.goto('http://127.0.0.1:5178/verify')
    const scan = () =>
      anonymous.getByLabel('Tải ảnh QR', { exact: true }).setInputFiles({
        name: 'certificate.png',
        mimeType: 'image/png',
        buffer: qrBytes,
      })
    await scan()
    await expect(anonymous.locator('.verification-verdict')).toHaveText(
      'VALID',
      { timeout: 15000 },
    )
    await page
      .getByRole('button', { name: 'Thu hồi on-chain', exact: true })
      .click()
    await page
      .getByRole('button', {
        name: 'Xác nhận thu hồi qua MetaMask',
        exact: true,
      })
      .click()
    await expect(
      page.getByText('Đã đồng bộ kết quả thu hồi từ blockchain.', {
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 })
    await anonymous.reload()
    await expect(anonymous.locator('.verification-verdict')).toHaveText(
      'REVOKED',
      { timeout: 15000 },
    )
    await scan()
    await expect(anonymous.locator('.verification-verdict')).toHaveText(
      'REVOKED',
      { timeout: 15000 },
    )
    expect(
      await anonymous.evaluate(() => localStorage.getItem('sbt_access_token')),
    ).toBeNull()
  } finally {
    await recipientContext.close()
    await anonymousContext.close()
  }
})

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort())
  await page.route('**/ipfs/bafytest*/metadata.json', (route) =>
    route.fulfill({
      json: {
        name: 'Browser EVM certificate',
        description: 'Integration test metadata',
      },
    }),
  )
})

async function wallet(page, options = {}) {
  await page.addInitScript(
    ({ adminWallet, options }) => {
      const listeners = new Map()
      const state = {
        account: adminWallet,
        connected: true,
        chain: '0x7a69',
        sends: 0,
        ...options,
      }
      window.testWallet = state
      state.emit = (event, value) =>
        (listeners.get(event) || []).forEach((listener) => listener(value))
      window.ethereum = {
        isMetaMask: true,
        on: (event, listener) =>
          listeners.set(event, [...(listeners.get(event) || []), listener]),
        removeListener: (event, listener) =>
          listeners.set(
            event,
            (listeners.get(event) || []).filter((item) => item !== listener),
          ),
        request: async ({ method, params = [] }) => {
          if (method === 'eth_accounts')
            return state.connected ? [state.account] : []
          if (method === 'eth_chainId') return state.chain
          if (method === 'eth_requestAccounts') {
            if (state.rejectConnect)
              throw Object.assign(new Error('User rejected'), { code: 4001 })
            state.connected = true
            return [state.account]
          }
          if (
            method === 'wallet_switchEthereumChain' ||
            method === 'wallet_addEthereumChain'
          ) {
            state.chain = params[0].chainId
            state.emit('chainChanged', state.chain)
            return null
          }
          if (method === 'eth_getBalance' && state.noGas) return '0x0'
          if (method === 'eth_sendTransaction') {
            if (state.rejectMint)
              throw Object.assign(new Error('User rejected transaction'), {
                code: 4001,
              })
            state.sends++
          }
          const response = await fetch('http://127.0.0.1:18546', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          })
          const payload = await response.json()
          if (payload.error)
            throw Object.assign(new Error(payload.error.message), {
              code: payload.error.code,
              data: payload.error.data,
            })
          return payload.result
        },
      }
    },
    { adminWallet, options },
  )
}

async function login(page, email = 'admin@example.com') {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('DemoSBT2026!')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.locator('.user-card')).toBeVisible()
}

async function prepare(page, request) {
  await login(page)
  const token = await page.evaluate(() =>
    localStorage.getItem('sbt_access_token'),
  )
  const headers = { Authorization: 'Bearer ' + token }
  const organizations = await (
    await request.get(API + '/organizations', { headers })
  ).json()
  const users = await (await request.get(API + '/users', { headers })).json()
  const person = users.items.find((u) => u.email === 'participant@example.com')
  // Wallet link through the participant's own authenticated API.
  const participantLogin = await (
    await request.post(API + '/auth/login', {
      data: { email: 'participant@example.com', password: 'DemoSBT2026!' },
    })
  ).json()
  await request.put(API + '/users/me/wallet', {
    headers: { Authorization: 'Bearer ' + participantLogin.access_token },
    data: { wallet_address: recipientWallet },
  })
  const start = new Date(Date.now() + 86400000)
  const event = await (
    await request.post(API + '/events', {
      headers,
      data: {
        organization_id: organizations.items[0].id,
        name: 'Browser Mint ' + Date.now(),
        start_date: start.toISOString(),
        end_date: new Date(+start + 3600000).toISOString(),
        status: 'active',
      },
    })
  ).json()
  const participant = await (
    await request.post(`${API}/events/${event.id}/participants`, {
      headers,
      data: { user_id: person.id },
    })
  ).json()
  const attended = await request.patch(
    `${API}/events/${event.id}/participants/${participant.id}`,
    { headers, data: { status: 'attended' } },
  )
  expect(attended.ok()).toBeTruthy()
  await page.goto(`/certificates?event=${event.id}`)
  await page
    .getByRole('combobox', { name: 'Người đã tham dự', exact: true })
    .selectOption(person.id)
  await page
    .getByLabel('Metadata URI', { exact: true })
    .fill('ipfs://bafytest/metadata.json')
  return { event, headers, recipientId: person.id }
}

test('metadata upload excludes recipient identifiers before pinning', async ({
  page,
  request,
}) => {
  await wallet(page)
  const { recipientId } = await prepare(page, request)
  let submitted
  await page.route('**/ipfs/upload/metadata', async (route) => {
    submitted = route.request().postDataJSON()
    await route.fulfill({
      status: 503,
      json: { error: { message: 'Pinning disabled in privacy test' } },
    })
  })
  await page
    .getByRole('combobox', { name: 'Metadata', exact: true })
    .selectOption('upload')
  await page
    .getByLabel('Ảnh chứng nhận trên IPFS', { exact: true })
    .fill('ipfs://bafyimage')
  await page
    .getByRole('button', { name: 'Cấp chứng nhận qua MetaMask', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Pinning disabled in privacy test',
  )
  expect(submitted.attributes).toHaveLength(1)
  expect(submitted.attributes[0].trait_type).toBe('event_id')
  expect(JSON.stringify(submitted)).not.toContain(recipientId)
  expect(await page.evaluate(() => window.testWallet.sends)).toBe(0)
})

test('a pending revocation never displays a successful revocation', async ({
  page,
  request,
}) => {
  await wallet(page)
  const { event, headers } = await prepare(page, request)
  await page
    .getByRole('button', { name: 'Cấp chứng nhận qua MetaMask', exact: true })
    .click()
  await expect(
    page.getByText(/Đã xác minh và lưu chứng nhận Token #/),
  ).toBeVisible({ timeout: 30000 })
  const records = await (
    await request.get(API + '/certificates', {
      headers,
      params: { event_id: event.id },
    })
  ).json()
  const certificate = records.items[0]
  const pending = await request.patch(
    `${API}/certificates/${certificate.id}/revocation-transaction`,
    {
      headers,
      data: { tx_hash: '0x' + '1'.repeat(64) },
    },
  )
  expect(pending.ok()).toBeTruthy()
  expect(await page.evaluate(() => window.testWallet.sends)).toBe(1)
  await page.reload()
  await page
    .getByRole('button', { name: 'Xem chứng nhận', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Thu hồi on-chain', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Xác nhận thu hồi qua MetaMask', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Giao dịch thu hồi chưa được xác nhận',
  )
  await expect(
    page.getByText('Đã đồng bộ kết quả thu hồi từ blockchain.', {
      exact: true,
    }),
  ).toHaveCount(0)
  expect(
    (
      await (
        await request.get(`${API}/certificates/${certificate.id}`, { headers })
      ).json()
    ).status,
  ).toBe('issued')
  // The injected provider is recreated on reload; sync must not broadcast.
  expect(await page.evaluate(() => window.testWallet.sends)).toBe(0)
})

test('missing MetaMask and rejected connection show actionable errors', async ({
  page,
}) => {
  await login(page)
  await page
    .getByRole('button', { name: 'Kết nối MetaMask', exact: true })
    .click()
  await expect(
    page.getByText(
      'Chưa cài MetaMask. Hãy cài extension MetaMask để kết nối ví.',
      { exact: true },
    ),
  ).toBeVisible()
  await wallet(page, { connected: false, rejectConnect: true })
  await page.reload()
  await page
    .getByRole('button', { name: 'Kết nối MetaMask', exact: true })
    .click()
  await expect(
    page.getByText('Bạn đã từ chối yêu cầu trong MetaMask.', { exact: true }),
  ).toBeVisible()
})

test('network switching and wallet events update UI without clearing JWT', async ({
  page,
}) => {
  await wallet(page, { chain: '0x1' })
  await login(page)
  const token = await page.evaluate(() =>
    localStorage.getItem('sbt_access_token'),
  )
  await page
    .getByRole('button', { name: 'Chuyển sang Sepolia', exact: true })
    .click()
  await expect(page.locator('.top-actions')).toContainText('Hardhat Test')
  await page.evaluate((address) => {
    window.testWallet.account = address
    window.testWallet.emit('accountsChanged', [address])
  }, recipientWallet)
  await expect(page.locator('.wallet-label')).toContainText('0x3C44')
  await page.evaluate(() => {
    window.testWallet.chain = '0x1'
    window.testWallet.emit('chainChanged', '0x1')
  })
  await expect(
    page.getByRole('button', { name: 'Chuyển sang Sepolia', exact: true }),
  ).toBeVisible()
  await page.evaluate(() => {
    window.testWallet.connected = false
    window.testWallet.emit('accountsChanged', [])
  })
  await expect(
    page.getByRole('button', { name: 'Kết nối MetaMask', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => localStorage.getItem('sbt_access_token')),
  ).toBe(token)
})

test('browser mints once through BrowserProvider; FastAPI verifies actual EVM receipt', async ({
  page,
  request,
}) => {
  await wallet(page)
  const { event, headers } = await prepare(page, request)
  await page
    .getByRole('button', { name: 'Cấp chứng nhận qua MetaMask', exact: true })
    .click()
  await expect(
    page.getByText(/Đã xác minh và lưu chứng nhận Token #/),
  ).toBeVisible({ timeout: 30000 })
  expect(await page.evaluate(() => window.testWallet.sends)).toBe(1)
  const records = await (
    await request.get(API + '/certificates', {
      headers,
      params: { event_id: event.id },
    })
  ).json()
  expect(records.total).toBe(1)
  expect(records.items[0].status).toBe('issued')
  expect(records.items[0].tx_hash).toMatch(/^0x[0-9a-f]{64}$/)
  const verified = await (
    await request.get(
      `${API}/verify/certificate/${records.items[0].id}?on_chain=true`,
    )
  ).json()
  expect(verified.on_chain_verified).toBe(true)
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
  await login(page, 'participant@example.com')
  await page.evaluate((address) => {
    window.testWallet.account = address
    window.testWallet.emit('accountsChanged', [address])
  }, recipientWallet)
  const card = page.locator('article').filter({ hasText: event.name })
  await expect(card).toBeVisible()
  await card
    .getByRole('button', { name: 'Đối chiếu blockchain', exact: true })
    .click()
  await expect(
    card.getByText('Đã đối chiếu backend và blockchain.', { exact: true }),
  ).toBeVisible({ timeout: 30000 })
  await page.evaluate((address) => {
    window.testWallet.account = address
    window.testWallet.emit('accountsChanged', [address])
  }, adminWallet)
  await expect(card).toHaveCount(0)
})

test('rejecting mint releases the lock and preserves pending status', async ({
  page,
  request,
}) => {
  await wallet(page, { rejectMint: true })
  const { event, headers } = await prepare(page, request)
  await page
    .getByRole('button', { name: 'Cấp chứng nhận qua MetaMask', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Bạn đã từ chối yêu cầu trong MetaMask.',
  )
  const records = await (
    await request.get(API + '/certificates', {
      headers,
      params: { event_id: event.id },
    })
  ).json()
  expect(records.items[0].status).toBe('pending')
  expect(records.items[0].tx_hash).toBeNull()
  expect(records.items[0].mint_attempt_id).toBeNull()
})

test('lost browser hash is recovered from real CertificateIssued logs after reload', async ({
  page,
  request,
}) => {
  await wallet(page)
  const { event, headers } = await prepare(page, request)
  await page.route('**/certificates/*/transaction', (route) => route.abort())
  await page.route('**/certificates/*/confirm', (route) => route.abort())
  await page
    .getByRole('button', { name: 'Cấp chứng nhận qua MetaMask', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Không kết nối được backend',
    { timeout: 30000 },
  )
  const before = await (
    await request.get(API + '/certificates', {
      headers,
      params: { event_id: event.id },
    })
  ).json()
  expect(before.items[0].status).toBe('pending')
  expect(before.items[0].tx_hash).toBeNull()
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (key.startsWith('sbt-mint-outbox:')) localStorage.removeItem(key)
  })
  await page.reload()
  await page.getByRole('button', { name: 'Đồng bộ', exact: true }).click()
  await expect(
    page.getByText(/Đã xác minh và lưu chứng nhận Token #/),
  ).toBeVisible({ timeout: 30000 })
  const after = await (
    await request.get(API + '/certificates', {
      headers,
      params: { event_id: event.id },
    })
  ).json()
  expect(after.items[0].status).toBe('issued')
})

test('insufficient gas never sends a transaction or marks a certificate issued', async ({
  page,
  request,
}) => {
  await wallet(page, { noGas: true })
  const { event, headers } = await prepare(page, request)
  await page
    .getByRole('button', { name: 'Cấp chứng nhận qua MetaMask', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Ví không đủ Sepolia ETH để trả gas.',
  )
  expect(await page.evaluate(() => window.testWallet.sends)).toBe(0)
  const records = await (
    await request.get(API + '/certificates', {
      headers,
      params: { event_id: event.id },
    })
  ).json()
  expect(records.items[0].status).toBe('pending')
  expect(records.items[0].tx_hash).toBeNull()
})

test('unavailable metadata does not reserve or mint a certificate', async ({
  page,
  request,
}) => {
  await wallet(page)
  const { event, headers } = await prepare(page, request)
  await page.route('**/ipfs/bafytest*/metadata.json', (route) => route.abort())
  await page
    .getByRole('button', { name: 'Cấp chứng nhận qua MetaMask', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Không tải được metadata từ IPFS.',
  )
  expect(await page.evaluate(() => window.testWallet.sends)).toBe(0)
  const records = await (
    await request.get(API + '/certificates', {
      headers,
      params: { event_id: event.id },
    })
  ).json()
  expect(records.total).toBe(0)
})

test('retry clears a failed outbox hash before sending a new mint', async ({
  page,
  request,
}) => {
  await wallet(page)
  const { event, headers, recipientId } = await prepare(page, request)
  const certificate = await (
    await request.post(API + '/certificates/issue', {
      headers,
      data: {
        event_id: event.id,
        recipient_id: recipientId,
        token_uri: 'ipfs://bafytest/metadata.json',
      },
    })
  ).json()
  const rpc = await (
    await request.post('http://127.0.0.1:18546', {
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendTransaction',
        params: [
          { from: adminWallet, to: adminWallet, value: '0x0', gas: '0x5208' },
        ],
      },
    })
  ).json()
  expect(rpc.result).toMatch(/^0x[0-9a-f]{64}$/)
  await request.patch(`${API}/certificates/${certificate.id}/transaction`, {
    headers,
    data: { tx_hash: rpc.result },
  })
  const failed = await (
    await request.post(`${API}/certificates/${certificate.id}/sync`, {
      headers,
    })
  ).json()
  expect(failed.status).toBe('failed')
  await page.evaluate(
    async ({ id, hash }) => {
      const { default: auth } = await import('/src/hooks/useAuthStore.js')
      localStorage.setItem(
        `sbt-mint-outbox:${auth.getState().user.id}`,
        JSON.stringify({ [id]: hash }),
      )
    },
    { id: certificate.id, hash: rpc.result },
  )
  await page.reload()
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(
    page.getByText(/Đã xác minh và lưu chứng nhận Token #/),
  ).toBeVisible()
  const recovered = await (
    await request.get(`${API}/certificates/${certificate.id}`, { headers })
  ).json()
  expect(recovered.status).toBe('issued')
  expect(recovered.tx_hash).not.toBe(rpc.result)
  expect(await page.evaluate(() => window.testWallet.sends)).toBe(1)
})

test('invalid browser outbox contents do not prevent minting', async ({
  page,
  request,
}) => {
  await wallet(page)
  await prepare(page, request)
  await page.evaluate(async () => {
    const { default: auth } = await import('/src/hooks/useAuthStore.js')
    localStorage.setItem(`sbt-mint-outbox:${auth.getState().user.id}`, 'null')
  })
  await page
    .getByRole('button', { name: 'Cấp chứng nhận qua MetaMask', exact: true })
    .click()
  await expect(
    page.getByText(/Đã xác minh và lưu chứng nhận Token #/),
  ).toBeVisible()
})

test('a stale wallet refresh cannot reconnect a disconnected account', async ({
  page,
}) => {
  await wallet(page)
  await login(page)
  const result = await page.evaluate(async (address) => {
    const { default: walletStore } =
      await import('/src/hooks/useWalletStore.js')
    const original = window.ethereum.request
    let release
    const delayed = new Promise((resolve) => {
      release = resolve
    })
    let first = true
    window.ethereum.request = async (args) => {
      if (args.method === 'eth_accounts' && first) {
        first = false
        return delayed
      }
      return original(args)
    }
    const refresh = walletStore.getState().refresh()
    window.testWallet.connected = false
    window.testWallet.emit('accountsChanged', [])
    await walletStore.getState().refresh()
    release([address])
    await refresh
    return walletStore.getState().isConnected
  }, adminWallet)
  expect(result).toBe(false)
  await expect(
    page.getByRole('button', { name: 'Kết nối MetaMask', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(async () => {
      const { wasRejected } = await import('/src/utils/errors.js')
      return wasRejected({
        code: 'UNKNOWN_ERROR',
        info: { error: { code: 4001 } },
      })
    }),
  ).toBe(true)
})

test('changing account before broadcast releases the unused mint claim', async ({
  page,
  request,
}) => {
  await wallet(page)
  const { event, headers } = await prepare(page, request)
  await page.route('**/certificates/*/mint-claim', async (route) => {
    const response = await route.fetch()
    await page.evaluate((address) => {
      window.testWallet.account = address
      window.testWallet.emit('accountsChanged', [address])
    }, recipientWallet)
    await route.fulfill({ response })
  })
  await page
    .getByRole('button', { name: 'Cấp chứng nhận qua MetaMask', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Ví hoặc mạng đã thay đổi',
  )
  const records = await (
    await request.get(API + '/certificates', {
      headers,
      params: { event_id: event.id },
    })
  ).json()
  expect(records.items[0].status).toBe('pending')
  expect(records.items[0].mint_attempt_id).toBeNull()
  expect(await page.evaluate(() => window.testWallet.sends)).toBe(0)
})

test('QR, PDF, full verification and revocation history use real EVM data', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90000)
  await wallet(page)
  const { event, headers } = await prepare(page, request)
  const logo = await QRCode.toBuffer('Test organization', { width: 64 })
  const uploaded = await request.put(
    `${API}/organizations/${event.organization_id}/logo`,
    {
      headers,
      multipart: {
        file: { name: 'organization.png', mimeType: 'image/png', buffer: logo },
      },
    },
  )
  expect(uploaded.ok()).toBeTruthy()
  await page
    .getByRole('button', { name: 'Cấp chứng nhận qua MetaMask', exact: true })
    .click()
  await expect(
    page.getByText(/Đã xác minh và lưu chứng nhận Token #/),
  ).toBeVisible()
  const records = await (
    await request.get(API + '/certificates', {
      headers,
      params: { event_id: event.id },
    })
  ).json()
  const certificate = records.items[0]
  const root = `${API}/certificates/${certificate.id}`
  const document = await (
    await request.get(root + '/document', { headers })
  ).json()
  const query = new URL(document.verification_url).searchParams
  expect([...query.keys()]).toEqual(['chainId', 'contractAddress', 'tokenId'])
  expect(query.get('tokenId')).toBe(certificate.token_id)
  expect(document.verification_url).not.toContain('participant')
  await page
    .getByRole('button', { name: 'Xem chứng nhận', exact: true })
    .click()
  await page.getByRole('button', { name: 'QR xác thực', exact: true }).click()
  await expect(
    page.getByRole('img', {
      name: `QR xác thực Token ${certificate.token_id}`,
    }),
  ).toBeVisible()
  const qrDownload = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Tải QR Code', exact: true }).click()
  const qr = await qrDownload
  const qrBytes = await readFile(await qr.path())
  expect(qrBytes.subarray(0, 4).toString('hex')).toBe('89504e47')
  const pdfDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Tải PDF', exact: true }).click()
  const pdf = await pdfDownload
  const pdfBytes = await readFile(await pdf.path())
  expect(pdfBytes.subarray(0, 4).toString()).toBe('%PDF')
  await writeFile(testInfo.outputPath('certificate.pdf'), pdfBytes)
  await page.goto('/verify')
  await page.getByLabel('Tải ảnh QR', { exact: true }).setInputFiles({
    name: 'certificate-qr.png',
    mimeType: 'image/png',
    buffer: qrBytes,
  })
  await expect(page.locator('.verification-verdict')).toHaveText('VALID')
  await expect(
    page.getByText(certificate.tx_hash, { exact: true }),
  ).toBeVisible()
  await page.getByLabel('Chain ID', { exact: true }).fill('1')
  await page
    .getByRole('button', { name: 'Xác minh chứng nhận', exact: true })
    .click()
  await expect(page.locator('.verification-verdict')).toHaveText('INVALID')
  await page.getByLabel('Chain ID', { exact: true }).fill('31337')
  await page.getByLabel('Token ID', { exact: true }).fill('999999999')
  await page
    .getByRole('button', { name: 'Xác minh chứng nhận', exact: true })
    .click()
  await expect(page.locator('.verification-verdict')).toHaveText('NOT FOUND')
  await page.goto(`/certificates?event=${event.id}`)
  await page
    .getByRole('button', { name: 'Xem chứng nhận', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Thu hồi on-chain', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Xác nhận thu hồi qua MetaMask', exact: true })
    .click()
  await expect(
    page.getByText('Đã đồng bộ kết quả thu hồi từ blockchain.', {
      exact: true,
    }),
  ).toBeVisible()
  const history = await (
    await request.get(root + '/history', { headers })
  ).json()
  expect(history.total).toBe(2)
  expect(history.items.map((row) => row.action)).toEqual(['issued', 'revoked'])
  expect(history.items[1].actor_address.toLowerCase()).toBe(
    adminWallet.toLowerCase(),
  )
  expect(history.items[1].tx_hash).not.toBe(certificate.tx_hash)
  expect((await request.get(root + '/pdf', { headers })).status()).toBe(409)
  await page.goto(document.verification_url)
  await expect(page.locator('.verification-verdict')).toHaveText('REVOKED', {
    timeout: 15000,
  })
  await expect(
    page.getByText(history.items[1].tx_hash, { exact: true }),
  ).toBeVisible()
})

test('camera denial and unrelated QR images show errors without navigating away', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('Denied', 'NotAllowedError')
        },
      },
    })
  })
  await page.goto('/verify')
  await page
    .getByRole('button', { name: 'Quét QR bằng camera', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'Bạn chưa cho phép truy cập camera',
  )
  await page.getByLabel('Tải ảnh QR', { exact: true }).setInputFiles({
    name: 'unrelated.png',
    mimeType: 'image/png',
    buffer: await QRCode.toBuffer('https://unrelated.example/sign'),
  })
  await expect(page.getByRole('alert')).toContainText(
    'QR không phải đường dẫn xác thực chứng nhận',
  )
  await expect(page).toHaveURL(/\/verify$/)
})

test('camera stream decodes a certificate QR and verifies its identity', async ({
  browser,
}, testInfo) => {
  test.setTimeout(45000)
  const identity =
    'http://127.0.0.1:5178/verify?chainId=31337&contractAddress=0x5fbdb2315678afecb367f032d93f642f64180aa3&tokenId=999999'
  const modules = QRCode.create(identity, {
    errorCorrectionLevel: 'M',
  }).modules
  const scale = 6,
    width = (modules.size + 8) * scale,
    y = Buffer.alloc(width * width, 235)
  for (let row = 0; row < modules.size; row++)
    for (let column = 0; column < modules.size; column++) {
      if (!modules.get(row, column)) continue
      for (let dy = 0; dy < scale; dy++)
        y.fill(
          16,
          ((row + 4) * scale + dy) * width + (column + 4) * scale,
          ((row + 4) * scale + dy) * width + (column + 5) * scale,
        )
    }
  const frame = Buffer.concat([
    Buffer.from(`YUV4MPEG2 W${width} H${width} F5:1 Ip A1:1 C420jpeg\nFRAME\n`),
    y,
    Buffer.alloc((width * width) / 2, 128),
  ])
  const source = testInfo.outputPath('qr-camera.y4m')
  await writeFile(source, frame)
  const cameraBrowser = await browser.browserType().launch({
    headless: true,
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${source}`,
    ],
  })
  try {
    const context = await cameraBrowser.newContext({ permissions: ['camera'] })
    const cameraPage = await context.newPage()
    await cameraPage.route('https://fonts.googleapis.com/**', (route) =>
      route.abort(),
    )
    await cameraPage.goto('http://127.0.0.1:5178/verify')
    await cameraPage
      .getByRole('button', { name: 'Quét QR bằng camera', exact: true })
      .click()
    await expect(
      cameraPage.getByLabel('Token ID', { exact: true }),
    ).toHaveValue('999999', { timeout: 15000 })
    await expect(cameraPage.locator('.verification-verdict')).toHaveText(
      'NOT FOUND',
      { timeout: 15000 },
    )
    await expect(
      cameraPage.getByLabel('Camera quét QR', { exact: true }),
    ).toBeHidden()
  } finally {
    await cameraBrowser.close()
  }
})

test('public verification validates a real token that has no SQLite certificate record', async ({
  page,
  request,
}) => {
  const provider = new JsonRpcProvider('http://127.0.0.1:18546')
  try {
    const signer = await provider.getSigner(0)
    const address = '0x5fbdb2315678afecb367f032d93f642f64180aa3'
    const contract = new Contract(
      address,
      [
        'function mintCertificate(address,string,string,bytes32) returns (uint256)',
        'event CertificateIssued(uint256 indexed tokenId,address indexed recipient,string indexed eventId,string metadataURI,bytes32 certificateHash,address issuer,uint256 issuedAt)',
      ],
      signer,
    )
    const eventId = 'standalone-' + Date.now()
    const transaction = await contract.mintCertificate(
      recipientWallet,
      eventId,
      'ipfs://bafytest/metadata.json',
      id(eventId),
    )
    const receipt = await transaction.wait()
    const event = receipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log)
        } catch {
          return null
        }
      })
      .find((log) => log?.name === 'CertificateIssued')
    const token = event.args.tokenId.toString()
    const result = await (
      await request.get(API + '/verify/blockchain', {
        params: { chain_id: 31337, contract_address: address, token_id: token },
      })
    ).json()
    expect(result.status).toBe('VALID')
    expect(result.event_name).toBe(eventId)
    expect(result.organization_name).toBeNull()
    expect(result.history[0].tx_hash).toBe(transaction.hash)
    await page.goto(
      `/verify?chainId=31337&contractAddress=${address}&tokenId=${token}`,
    )
    await expect(page.locator('.verification-verdict')).toHaveText('VALID', {
      timeout: 15000,
    })
  } finally {
    provider.destroy()
  }
})
