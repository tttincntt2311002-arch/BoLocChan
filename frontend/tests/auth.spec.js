import { test, expect } from '@playwright/test'

const API = 'http://127.0.0.1:8011/api/v1'
const PASSWORD = 'DemoSBT2026!'

test('all public routes and authenticated routes render without overflow or runtime errors on mobile and desktop', async ({
  page,
}) => {
  test.setTimeout(120000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of [
      '/',
      '/login',
      '/register',
      '/forgot-password',
      '/verify',
      '/page-that-does-not-exist',
    ]) {
      await page.goto(route)
      await expect(page.locator('h1')).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true)
    }
  }
  await signIn(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of [
      '/dashboard',
      '/events',
      '/events/new',
      '/certificates',
      '/my-certificates',
      '/profile',
      '/verify',
    ]) {
      await page.goto(route)
      await expect(page.locator('h1')).toBeVisible()
      await expect(
        page.getByText('Đang tải dữ liệu…', { exact: true }),
      ).toHaveCount(0)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true)
    }
  }
  expect(errors).toEqual([])
})

test('event loading and network failure display retry and recover', async ({
  page,
}) => {
  await signIn(page, 'organizer@example.com')
  await expect(page).toHaveURL(/\/dashboard$/)
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  await page.route('**/api/v1/events?**', async (route) => {
    await gate
    await route.abort('connectionfailed')
  })
  await page.goto('/events')
  await expect(
    page.getByRole('status').filter({ hasText: 'Đang tải dữ liệu' }),
  ).toBeVisible()
  release()
  await expect(page.getByRole('alert')).toContainText(
    'Không kết nối được backend',
  )
  await page.unroute('**/api/v1/events?**')
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('article').first()).toBeVisible()
})

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort())
})

async function signIn(page, email = 'admin@example.com', password = PASSWORD) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
}

test('private routes redirect to login and reject incorrect credentials', async ({
  page,
}) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com')
  await page.getByLabel('Mật khẩu', { exact: true }).fill('WrongPassword2026!')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Email hoặc mật khẩu không đúng',
  )
  expect(
    await page.evaluate(() => localStorage.getItem('sbt_access_token')),
  ).toBeNull()
})

test('admin signs in, sees real identity, and keeps the session after reload', async ({
  page,
}) => {
  await signIn(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(
    page.getByRole('heading', { name: 'Xin chào, Demo Admin', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.user-card')).toContainText('Quản trị viên')
  await expect(page.locator('.user-card')).not.toContainText('Minh Le')
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Xin chào, Demo Admin', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Cài đặt hồ sơ', exact: true }).click()
  await expect(page.getByLabel('Họ và tên', { exact: true })).toHaveValue(
    'Demo Admin',
  )
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(
    'admin@example.com',
  )
  await expect(page.getByLabel('Vai trò', { exact: true })).toHaveValue(
    'Quản trị viên',
  )
  await expect(page.getByLabel('Vai trò', { exact: true })).toHaveAttribute(
    'readonly',
    '',
  )
})

test('logout clears browser credentials and revokes the actual backend token', async ({
  page,
  request,
}) => {
  await signIn(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  const token = await page.evaluate(() =>
    localStorage.getItem('sbt_access_token'),
  )
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(
    await page.evaluate(() => localStorage.getItem('sbt_access_token')),
  ).toBeNull()
  const response = await request.get(API + '/auth/me', {
    headers: { Authorization: 'Bearer ' + token },
  })
  expect(response.status()).toBe(401)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
})

test('participants cannot open management routes or trust a persisted admin role', async ({
  page,
}) => {
  await signIn(page, 'participant@example.com')
  await expect(page).toHaveURL(/\/my-certificates$/)
  await page.evaluate(() =>
    localStorage.setItem(
      'sbt-wallet-store',
      JSON.stringify({
        state: { user: { full_name: 'Fake Admin', role: 'admin' } },
        version: 0,
      }),
    ),
  )
  await page.reload()
  await expect(page.locator('.user-card')).toContainText('Người tham gia')
  await expect(
    page.getByRole('link', { name: 'Tổng quan', exact: true }),
  ).toHaveCount(0)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/my-certificates$/)
  await page.goto('/events/new')
  await expect(page).toHaveURL(/\/my-certificates$/)
  await page.goto('/events')
  await expect(
    page.getByRole('button', { name: 'Tạo sự kiện', exact: true }),
  ).toHaveCount(0)
})

test('invalid persisted tokens are removed instead of opening a private page', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('sbt_access_token', 'invalid.jwt.token'),
  )
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  expect(
    await page.evaluate(() => localStorage.getItem('sbt_access_token')),
  ).toBeNull()
  await expect(
    page.getByRole('heading', { name: 'Chào mừng trở lại' }),
  ).toBeVisible()
})

test('registration creates a real participant and supports profile updates', async ({
  page,
  request,
}) => {
  const email = 'browser-' + Date.now() + '@example.com'
  await page.goto('/register')
  await page
    .getByLabel('Họ và tên', { exact: true })
    .fill('Browser Participant')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page
    .getByLabel('Mật khẩu', { exact: true })
    .fill('BrowserPassword2026!')
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email)
  await page
    .getByLabel('Mật khẩu', { exact: true })
    .fill('BrowserPassword2026!')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL(/\/my-certificates$/)
  await page.goto('/profile')
  await page
    .getByLabel('Họ và tên', { exact: true })
    .fill('Updated Browser Name')
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click()
  await expect(page.locator('.user-card')).toContainText('Updated Browser Name')
  await page.reload()
  await expect(page.getByLabel('Họ và tên', { exact: true })).toHaveValue(
    'Updated Browser Name',
  )
  const token = await page.evaluate(() =>
    localStorage.getItem('sbt_access_token'),
  )
  const response = await request.get(API + '/auth/me', {
    headers: { Authorization: 'Bearer ' + token },
  })
  expect((await response.json()).role).toBe('participant')
})

test('temporary backend failure retains the token and allows session retry', async ({
  page,
}) => {
  await signIn(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  const token = await page.evaluate(() =>
    localStorage.getItem('sbt_access_token'),
  )
  await page.route('**/auth/me', (route) => route.abort('connectionfailed'))
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Chưa kết nối được máy chủ' }),
  ).toBeVisible()
  expect(
    await page.evaluate(() => localStorage.getItem('sbt_access_token')),
  ).toBe(token)
  await page.unroute('**/auth/me')
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Xin chào, Demo Admin', exact: true }),
  ).toBeVisible()
})

test('logout is synchronized across browser tabs', async ({
  page,
  context,
}) => {
  await signIn(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  const second = await context.newPage()
  await second.goto('/profile')
  await expect(
    second.getByRole('heading', { name: 'Hồ sơ cá nhân', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(second).toHaveURL(/\/login$/)
})

test('verification stays public and password recovery does not pretend to send mail', async ({
  page,
}) => {
  await page.goto('/verify')
  await expect(
    page.getByRole('heading', { name: 'Tra cứu chứng nhận', exact: true }),
  ).toBeVisible()
  await page.goto('/forgot-password')
  await expect(
    page.getByText(
      'Liên hệ quản trị viên để được hỗ trợ khôi phục quyền truy cập.',
    ),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Gửi liên kết' })).toHaveCount(
    0,
  )
})

test('logout stays reachable in the mobile navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.getByRole('button', { name: 'Mở menu', exact: true }).click()
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
})

for (const operation of ['logout', 'profile', 'wallet']) {
  test(`a delayed ${operation} response cannot overwrite a newer login`, async ({
    page,
    request,
  }) => {
    await signIn(page)
    await expect(page).toHaveURL(/\/dashboard$/)
    const oldToken = await page.evaluate(() =>
      localStorage.getItem('sbt_access_token'),
    )
    const oldUser = await (
      await request.get(API + '/auth/me', {
        headers: { Authorization: 'Bearer ' + oldToken },
      })
    ).json()
    let release, started
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const requestStarted = new Promise((resolve) => {
      started = resolve
    })
    const endpoint =
      operation === 'logout'
        ? '**/auth/logout'
        : operation === 'profile'
          ? '**/users/me'
          : '**/users/me/wallet'
    await page.route(endpoint, async (route) => {
      started()
      await gate
      if (operation === 'logout') await route.fulfill({ status: 204 })
      else
        await route.fulfill({
          json: { ...oldUser, full_name: 'Stale Admin Response' },
        })
    })
    await page.evaluate(async (operation) => {
      const { default: auth } = await import('/src/hooks/useAuthStore.js')
      window.pendingOldSession =
        operation === 'logout'
          ? auth.getState().logout()
          : operation === 'profile'
            ? auth.getState().updateProfile({ full_name: 'Old update' })
            : auth.getState().updateWallet('0x' + '9'.repeat(40))
    }, operation)
    await requestStarted
    await page.evaluate(async () => {
      const { default: auth } = await import('/src/hooks/useAuthStore.js')
      await auth.getState().login('participant@example.com', 'DemoSBT2026!')
    })
    const newToken = await page.evaluate(() =>
      localStorage.getItem('sbt_access_token'),
    )
    release()
    await page.evaluate(() => window.pendingOldSession)
    await expect(page.locator('.user-card')).toContainText('Người tham gia')
    await expect(page.locator('.user-card')).not.toContainText(
      'Stale Admin Response',
    )
    expect(
      await page.evaluate(() => localStorage.getItem('sbt_access_token')),
    ).toBe(newToken)
  })
}

for (const scenario of [
  {
    name: 'pending without a transaction',
    status: 'pending',
    tx_hash: null,
    verdict: 'PENDING',
    hint: 'Tiếp tục cấp',
  },
  {
    name: 'pending with a submitted transaction',
    status: 'pending',
    tx_hash: '0x' + 'a'.repeat(64),
    verdict: 'PENDING',
    hint: 'Đồng bộ',
  },
  {
    name: 'failed before mint',
    status: 'failed',
    tx_hash: null,
    verdict: 'FAILED',
    hint: 'thử lại',
  },
]) {
  test(`certificate lookup distinguishes ${scenario.name} from a missing token`, async ({
    page,
  }) => {
    const id = '550e8400-e29b-41d4-a716-446655440000'
    let blockchainRequests = 0
    page.on('request', (request) => {
      if (request.url().includes('/verify/blockchain')) blockchainRequests++
    })
    await page.route(`**/verify/certificate/${id}`, (route) =>
      route.fulfill({
        json: {
          is_valid: false,
          on_chain_verified: false,
          source: 'database',
          certificate: {
            id,
            event_name: 'Pending certificate workshop',
            organization_name: 'Test organization',
            status: scenario.status,
            tx_hash: scenario.tx_hash,
            chain_id: 31337,
            token_id: null,
            contract_address: '0x' + 'a'.repeat(40),
          },
        },
      }),
    )
    await page.goto(`/verify?id=${id}`)
    await page
      .getByRole('button', { name: 'Xác minh chứng nhận', exact: true })
      .click()
    await expect(page.locator('.verification-verdict')).toHaveText(
      scenario.verdict,
    )
    const result = page.locator('.verification-result')
    await expect(result).toContainText(`Mã chứng nhận: ${id}`)
    await expect(result).toContainText('Token ID: Chưa được cấp')
    await expect(result).toContainText(scenario.hint)
    await expect(result).not.toContainText(`Token ID: ${id}`)
    expect(blockchainRequests).toBe(0)
  })
}

test('editing the verification input discards a delayed result for the old token', async ({
  page,
}) => {
  await page.goto('/verify')
  await page.evaluate(async () => {
    const { default: api } = await import('/src/utils/api.js')
    const original = api.get.bind(api)
    api.get = (path, config) =>
      path.startsWith('/verify/')
        ? new Promise((resolve) => {
            window.finishVerification = resolve
          })
        : original(path, config)
  })
  await page.getByLabel('Token ID', { exact: true }).fill('37')
  await page
    .getByRole('button', { name: 'Xác minh chứng nhận', exact: true })
    .click()
  await page.getByLabel('Token ID', { exact: true }).fill('38')
  await page.evaluate(async () => {
    window.finishVerification({
      data: {
        is_valid: true,
        on_chain_verified: true,
        certificate: {
          event_name: 'Old token result',
          organization_name: 'Test',
          status: 'issued',
          token_id: '37',
          issued_at: '2026-11-13T00:00:00Z',
          tx_hash: null,
        },
      },
    })
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    )
  })
  await expect(
    page.getByText('Old token result', { exact: false }),
  ).toHaveCount(0)
  await expect(page.getByLabel('Token ID', { exact: true })).toHaveValue('38')
})
