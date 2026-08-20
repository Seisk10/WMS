import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, TrendingUp, AlertTriangle,
  Package, ArrowLeftRight, RefreshCw, AlertCircle,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { apiFetch, isApiError } from '../lib/api'

// ── Types ──────────────────────────────────────────────────────────────────

interface WeeklyMovementItem {
  date: string
  entradas: number
  saidas: number
}

interface ChartPoint {
  label: string
  entradas: number
  saidas: number
}

interface DashboardStats {
  totalProducts: number
  movementsToday: number
  openDivergences: number
  activeSessions: number
}

// ── Card config ────────────────────────────────────────────────────────────

type StatKey = keyof DashboardStats

interface CardConfig {
  key: StatKey
  label: string
  sub: string
  icon: React.ElementType
  /** Returns tailwind classes based on the live value */
  accent: (v: number | null) => string
}

const CARDS: CardConfig[] = [
  {
    key: 'totalProducts',
    label: 'Total de Produtos',
    sub: 'SKUs cadastrados',
    icon: Package,
    accent: () => 'text-slate-600 bg-slate-100',
  },
  {
    key: 'movementsToday',
    label: 'Movimentações Hoje',
    sub: 'entradas e saídas',
    icon: ArrowLeftRight,
    accent: (v) => v && v > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 bg-slate-100',
  },
  {
    key: 'openDivergences',
    label: 'Divergências',
    sub: 'registros com delta ≠ 0',
    icon: AlertTriangle,
    accent: (v) => v && v > 0 ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50',
  },
  {
    key: 'activeSessions',
    label: 'Sessões Ativas',
    sub: 'inventários em andamento',
    icon: TrendingUp,
    accent: (v) => v && v > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 bg-slate-100',
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function formatStat(value: number): string {
  return value.toLocaleString('pt-BR')
}

const WEEK_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function toChartPoints(items: WeeklyMovementItem[]): ChartPoint[] {
  return items.map(({ date, entradas, saidas }) => {
    const [y, m, d] = date.split('-').map(Number)
    return { label: WEEK_PT[new Date(y, m - 1, d).getDay()], entradas, saidas }
  })
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)

  const [chartData, setChartData] = useState<ChartPoint[] | null>(null)
  const [chartLoading, setChartLoading] = useState(true)
  const [chartError, setChartError] = useState(false)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const data = await apiFetch<DashboardStats>('/dashboard/stats')
      setStats(data)
      setFetchedAt(new Date())
    } catch (err) {
      // Non-auth errors (auth errors redirect via ProtectedRoute)
      if (isApiError(err) && err.status === 401) return
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchStats() }, [fetchStats])

  useEffect(() => {
    apiFetch<WeeklyMovementItem[]>('/dashboard/movimentacoes-semana')
      .then((items) => setChartData(toChartPoints(items)))
      .catch(() => setChartError(true))
      .finally(() => setChartLoading(false))
  }, [])

  return (
    <div className="p-5 lg:p-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
            <LayoutDashboard size={18} className="text-slate-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 leading-tight">Dashboard</h1>
            <p className="text-xs text-slate-500">
              {fetchedAt
                ? `Atualizado às ${fetchedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : 'Visão geral do depósito F01'}
            </p>
          </div>
        </div>

        <button
          onClick={() => void fetchStats()}
          disabled={loading}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-40 transition-colors"
          aria-label="Atualizar métricas"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          <span>Não foi possível carregar as métricas.</span>
          <button
            onClick={() => void fetchStats()}
            className="ml-auto text-xs font-semibold text-red-700 underline underline-offset-2 hover:text-red-900"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-8">
        {CARDS.map(({ key, label, sub, icon: Icon, accent }) => {
          const value = stats?.[key] ?? null
          const accentClass = accent(value)
          const isLoading = loading && value === null

          return (
            <div
              key={key}
              className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3"
            >
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                isLoading ? 'bg-slate-100 text-slate-300' : accentClass
              }`}>
                <Icon size={18} />
              </div>
              <div>
                <div className={`text-2xl font-bold leading-none mb-1 transition-colors ${
                  isLoading ? 'text-slate-300' : 'text-slate-900'
                }`}>
                  {value !== null ? formatStat(value) : '—'}
                </div>
                <div className="text-xs font-medium text-slate-700 leading-tight">{label}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Movimentações — 7 dias</p>
            <p className="text-[11px] text-slate-400 mt-0.5">contagem por dia</p>
          </div>
          <div className="flex items-center gap-3.5">
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-emerald-500" />
              Entradas
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-slate-400" />
              Saídas
            </span>
          </div>
        </div>

        {chartLoading ? (
          <div className="h-44 animate-pulse rounded-xl bg-slate-100" />
        ) : chartError ? (
          <div className="flex h-44 items-center justify-center">
            <p className="text-sm text-red-500">Erro ao carregar o gráfico.</p>
          </div>
        ) : chartData?.every((p) => p.entradas === 0 && p.saidas === 0) ? (
          <div className="flex h-44 items-center justify-center">
            <p className="text-sm text-slate-400">Nenhuma movimentação nos últimos 7 dias.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={176}>
            <BarChart
              data={chartData ?? []}
              barSize={12}
              barGap={3}
              margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
              />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 4px rgba(0,0,0,.06)',
                }}
              />
              <Bar dataKey="entradas" name="Entradas" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="saidas" name="Saídas" fill="#94a3b8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
