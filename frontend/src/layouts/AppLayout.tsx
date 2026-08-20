import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ArrowLeftRight,
  ClipboardList,
  LogOut,
  Package,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/movimentacao', icon: ArrowLeftRight, label: 'Movimentação' },
  { to: '/inventario', icon: ClipboardList, label: 'Inventário' },
] as const

export default function AppLayout() {
  const navigate = useNavigate()

  function handleLogout() {
    localStorage.removeItem('wms_token')
    navigate('/login')
  }

  return (
    <div className="flex h-dvh bg-slate-50">
      {/* ── Sidebar (desktop lg+) ── */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-slate-900 text-white">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-700/60">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500">
            <Package size={15} strokeWidth={2.5} className="text-white" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight">WMS Cassol</span>
            <span className="text-[11px] text-slate-400 mt-0.5">Filial F01 — Campinas</span>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon size={17} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 pb-4 border-t border-slate-700/60 pt-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut size={17} strokeWidth={2} />
            Sair
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-2.5 px-4 h-14 bg-white border-b border-slate-200 shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500">
            <Package size={15} strokeWidth={2.5} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-900">WMS Cassol</span>
          <span className="text-xs text-slate-400 ml-1">F01</span>
        </header>

        <main className="flex-1 overflow-y-auto pb-[68px] lg:pb-0">
          <Outlet />
        </main>
      </div>

      {/* ── Bottom nav (mobile) ── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex z-10">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                isActive ? 'text-slate-900' : 'text-slate-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
