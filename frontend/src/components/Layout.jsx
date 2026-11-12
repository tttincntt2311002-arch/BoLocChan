/**
 * Root layout wrapper – shared Navbar + Outlet
 */
import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import Navbar from './Navbar'
import useWalletStore from '@/hooks/useWalletStore'

export default function Layout() {
  const init = useWalletStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  return (
    <div className="min-h-screen bg-grid">
      <Navbar />
      <main className="pt-16">
        <Outlet />
      </main>
    </div>
  )
}
