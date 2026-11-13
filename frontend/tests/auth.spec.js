import { test, expect } from '@playwright/test'

const API = 'http://127.0.0.1:8011/api/v1'
const PASSWORD = 'DemoSBT2026!'

async function signIn(page, email = 'admin@example.com', password = PASSWORD) {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
}

test('private routes redirect to login and reject incorrect credentials', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com')
  await page.getByLabel('Mật khẩu', { exact: true }).fill('WrongPassword2026!')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Email hoặc mật khẩu không đúng')
  expect(await page.evaluate(() => localStorage.getItem('sbt_access_token'))).toBeNull()
})

test('admin signs in, sees real identity, and keeps the session after reload', async ({ page }) => {
  await signIn(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Xin chào, Demo Admin', exact: true })).toBeVisible()
  await expect(page.locator('.user-card')).toContainText('Quản trị viên')
  await expect(page.locator('.user-card')).not.toContainText('Minh Le')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Xin chào, Demo Admin', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Cài đặt hồ sơ', exact: true }).click()
  await expect(page.getByLabel('Họ và tên', { exact: true })).toHaveValue('Demo Admin')
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('admin@example.com')
  await expect(page.getByLabel('Vai trò', { exact: true })).toHaveValue('Quản trị viên')
  await expect(page.getByLabel('Vai trò', { exact: true })).toHaveAttribute('readonly', '')
})

test('logout clears browser credentials and revokes the actual backend token', async ({ page, request }) => {
  await signIn(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  const token = await page.evaluate(() => localStorage.getItem('sbt_access_token'))
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => localStorage.getItem('sbt_access_token'))).toBeNull()
  const response = await request.get(API + '/auth/me', { headers: { Authorization: 'Bearer ' + token } })
  expect(response.status()).toBe(401)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
})

test('participants cannot open management routes or trust a persisted admin role', async ({ page }) => {
  await signIn(page, 'participant@example.com')
  await expect(page).toHaveURL(/\/my-certificates$/)
  await page.evaluate(() => localStorage.setItem('sbt-wallet-store', JSON.stringify({
    state: { user: { full_name: 'Fake Admin', role: 'admin' } }, version: 0,
  })))
  await page.reload()
  await expect(page.locator('.user-card')).toContainText('Người tham gia')
  await expect(page.getByRole('link', { name: 'Tổng quan', exact: true })).toHaveCount(0)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/my-certificates$/)
  await page.goto('/events/new')
  await expect(page).toHaveURL(/\/my-certificates$/)
  await page.goto('/events')
  await expect(page.getByRole('button', { name: 'Tạo sự kiện', exact: true })).toHaveCount(0)
})

test('invalid persisted tokens are removed instead of opening a private page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sbt_access_token', 'invalid.jwt.token'))
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => localStorage.getItem('sbt_access_token'))).toBeNull()
  await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible()
})

test('registration creates a real participant and supports profile updates', async ({ page, request }) => {
  const email = 'browser-' + Date.now() + '@example.com'
  await page.goto('/register')
  await page.getByLabel('Họ và tên', { exact: true }).fill('Browser Participant')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('BrowserPassword2026!')
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('BrowserPassword2026!')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL(/\/my-certificates$/)
  await page.goto('/profile')
  await page.getByLabel('Họ và tên', { exact: true }).fill('Updated Browser Name')
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click()
  await expect(page.locator('.user-card')).toContainText('Updated Browser Name')
  await page.reload()
  await expect(page.getByLabel('Họ và tên', { exact: true })).toHaveValue('Updated Browser Name')
  const token = await page.evaluate(() => localStorage.getItem('sbt_access_token'))
  const response = await request.get(API + '/auth/me', { headers: { Authorization: 'Bearer ' + token } })
  expect((await response.json()).role).toBe('participant')
})

test('temporary backend failure retains the token and allows session retry', async ({ page }) => {
  await signIn(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  const token = await page.evaluate(() => localStorage.getItem('sbt_access_token'))
  await page.route('**/auth/me', route => route.abort('connectionfailed'))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Chưa kết nối được máy chủ' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('sbt_access_token'))).toBe(token)
  await page.unroute('**/auth/me')
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Xin chào, Demo Admin', exact: true })).toBeVisible()
})

test('logout is synchronized across browser tabs', async ({ page, context }) => {
  await signIn(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  const second = await context.newPage()
  await second.goto('/profile')
  await expect(second.getByRole('heading', { name: 'Hồ sơ cá nhân', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(second).toHaveURL(/\/login$/)
})

test('verification stays public and password recovery does not pretend to send mail', async ({ page }) => {
  await page.goto('/verify')
  await expect(page.getByRole('heading', { name: 'Tra cứu chứng nhận', exact: true })).toBeVisible()
  await page.goto('/forgot-password')
  await expect(page.getByText('Liên hệ quản trị viên để được hỗ trợ khôi phục quyền truy cập.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Gửi liên kết' })).toHaveCount(0)
})

test('logout stays reachable in the mobile navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page)
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.getByRole('button', { name: 'Mở menu', exact: true }).click()
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
})
