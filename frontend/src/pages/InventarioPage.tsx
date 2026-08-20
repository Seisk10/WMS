import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react'
import {
  ClipboardList, Plus, Search, Package, X, Eye, EyeOff,
  CheckCircle2, AlertCircle, AlertTriangle, ShieldAlert, Lock,
} from 'lucide-react'
import { apiFetch, isApiError, getTokenRole } from '../lib/api'

// ── Types ──────────────────────────────────────────────────────────────────

interface Location {
  id: number
  name: string
  type: 'gondola' | 'deposito'
}

interface ProductBalance {
  location_id: number
  location_name: string | null
  quantity: number
}

interface ProductDetail {
  id: number
  item_code: string
  name: string
  category: string
  balances: ProductBalance[]
}

interface SessionDetail {
  id: number
  title: string
  category: string
  status: 'EM_ANDAMENTO' | 'FINALIZADO' | 'CANCELADA'
  blind_count: boolean
  username: string
  created_at: string
  finalized_at: string | null
  close_justification: string | null
}

interface DivergenceViolation {
  product_id: number
  item_code: string
  product_name: string
  location_id: number
  location_name: string
  counted_quantity: number
  expected_quantity: number
  divergence: number
  divergence_pct: number | null
}

type ClosePhase = 'idle' | 'submitting' | 'violation' | 'forcing' | 'closed'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const SESSION_STORAGE_KEY = 'wms_active_session_id'

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SessionDetail['status'] }) {
  if (status === 'EM_ANDAMENTO') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Em andamento
      </span>
    )
  }
  if (status === 'CANCELADA') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-[11px] font-semibold text-red-500">
        <X size={10} />
        Cancelada
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
      <Lock size={10} />
      Finalizada
    </span>
  )
}

function ViolationsTable({ violations }: { violations: DivergenceViolation[] }) {
  const totalDivergence = violations.reduce((sum, v) => sum + Math.abs(v.divergence), 0)

  return (
    <div>
      {/* Summary */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-red-600">{violations.length} item{violations.length !== 1 ? 's' : ''}</span>
          {' '}acima do limite · divergência total: <span className="font-semibold text-slate-800">{totalDivergence} un.</span>
        </p>
      </div>

      {/* Table — scrollable on mobile */}
      <div className="overflow-x-auto rounded-xl border border-red-200">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-red-50 border-b border-red-200">
              <th className="text-left px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">Produto</th>
              <th className="text-left px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">Endereço</th>
              <th className="text-right px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">Esperado</th>
              <th className="text-right px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">Contado</th>
              <th className="text-right px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">Divergência</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-red-100 bg-white">
            {violations.map((v) => {
              const isMissing = v.divergence < 0
              const pctStr = v.divergence_pct !== null ? `${v.divergence_pct.toFixed(1)}%` : '∞%'
              return (
                <tr key={`${v.product_id}-${v.location_id}`} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-slate-900 max-w-[160px] truncate">{v.product_name}</p>
                    <p className="text-slate-400 font-mono">{v.item_code}</p>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{v.location_name}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-700">{v.expected_quantity}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-900">{v.counted_quantity}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`font-bold ${isMissing ? 'text-red-600' : 'text-amber-600'}`}>
                      {v.divergence > 0 ? '+' : ''}{v.divergence}
                    </span>
                    <span className={`ml-1 text-[10px] ${isMissing ? 'text-red-400' : 'text-amber-400'}`}>
                      ({pctStr})
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function InventarioPage() {
  const role = getTokenRole()
  const isAdmin = role === 'ADMIN'

  // Locations
  const [locations, setLocations] = useState<Location[]>([])

  // Session management
  const [sessionTab, setSessionTab] = useState<'create' | 'load'>('create')
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionError, setSessionError] = useState('')

  // Create form
  const [createTitle, setCreateTitle] = useState('')
  const [createCategory, setCreateCategory] = useState('')
  const [createBlind, setCreateBlind] = useState(false)
  const [creating, setCreating] = useState(false)

  // Load form
  const [loadId, setLoadId] = useState('')

  // Count form
  const countScanRef = useRef<HTMLInputElement>(null)
  const [countIdentifier, setCountIdentifier] = useState('')
  const [countScanLoading, setCountScanLoading] = useState(false)
  const [countScanError, setCountScanError] = useState('')
  const [countProduct, setCountProduct] = useState<ProductDetail | null>(null)
  const [countLocationId, setCountLocationId] = useState('')
  const [countQuantity, setCountQuantity] = useState('')
  const [countSubmitting, setCountSubmitting] = useState(false)
  const [countResult, setCountResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Close session
  const [closePhase, setClosePhase] = useState<ClosePhase>('idle')
  const [violations, setViolations] = useState<DivergenceViolation[]>([])
  const [justification, setJustification] = useState('')
  const [closeError, setCloseError] = useState('')
  const [closeResult, setCloseResult] = useState<{ adjusted: number; message: string } | null>(null)

  // Cancel session
  const [cancelling, setCancelling] = useState(false)
  const [cancelledToast, setCancelledToast] = useState<string | null>(null)

  // Force-close confirmation modal
  const [showForceConfirm, setShowForceConfirm] = useState(false)

  // Load locations and persisted session on mount
  useEffect(() => {
    apiFetch<Location[]>('/locations').then(setLocations).catch(() => {})

    const savedId = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (savedId) {
      void loadSession(Number(savedId))
    }
  }, [])

  // Auto-clear count result after 3s
  useEffect(() => {
    if (!countResult) return
    const t = setTimeout(() => setCountResult(null), 3000)
    return () => clearTimeout(t)
  }, [countResult])

  // Auto-dismiss cancel toast after 4s
  useEffect(() => {
    if (!cancelledToast) return
    const t = setTimeout(() => setCancelledToast(null), 4000)
    return () => clearTimeout(t)
  }, [cancelledToast])

  // Close confirmation modal on Escape
  useEffect(() => {
    if (!showForceConfirm) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowForceConfirm(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showForceConfirm])

  // ── Session operations ─────────────────────────────────────────────────

  async function loadSession(id: number) {
    setSessionLoading(true)
    setSessionError('')
    try {
      const data = await apiFetch<SessionDetail>(`/inventory/sessions/${id}`)
      setActiveSession(data)
      sessionStorage.setItem(SESSION_STORAGE_KEY, String(data.id))
      // Reset close state when loading a different session
      setClosePhase('idle')
      setViolations([])
      setJustification('')
      setCloseError('')
      setCloseResult(null)
    } catch (err) {
      setSessionError(isApiError(err) ? err.error.message : 'Sessão não encontrada.')
    } finally {
      setSessionLoading(false)
    }
  }

  async function handleCreateSession(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    setSessionError('')
    try {
      const created = await apiFetch<{ id: number; blind_count: boolean }>('/inventory/sessions', {
        method: 'POST',
        body: JSON.stringify({ title: createTitle.trim(), category: createCategory.trim(), blind_count: createBlind }),
      })
      // Fetch full session detail
      await loadSession(created.id)
      setCreateTitle('')
      setCreateCategory('')
      setCreateBlind(false)
    } catch (err) {
      setSessionError(isApiError(err) ? err.error.message : 'Erro ao criar sessão.')
    } finally {
      setCreating(false)
    }
  }

  async function handleLoadSession(e: FormEvent) {
    e.preventDefault()
    const id = Number(loadId)
    if (!id || id <= 0) { setSessionError('Informe um ID válido.'); return }
    await loadSession(id)
  }

  function handleClearSession() {
    setActiveSession(null)
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
    setClosePhase('idle')
    setViolations([])
    setCloseError('')
    setCloseResult(null)
    setCountProduct(null)
    setCountIdentifier('')
    setCountQuantity('')
    setCountLocationId('')
  }

  async function handleCancelSession() {
    if (!activeSession) return
    setCancelling(true)
    try {
      await apiFetch(`/inventory/sessions/${activeSession.id}/cancel`, { method: 'POST' })
      const sessionId = activeSession.id
      handleClearSession()
      setCancelledToast(`Sessão #${sessionId} cancelada. Todos os produtos foram desbloqueados.`)
    } catch (err) {
      setCloseError(isApiError(err) ? err.error.message : 'Erro ao cancelar a sessão.')
    } finally {
      setCancelling(false)
    }
  }

  // ── Count operations ───────────────────────────────────────────────────

  async function handleCountScan(e?: FormEvent) {
    e?.preventDefault()
    const q = countIdentifier.trim()
    if (!q) return
    setCountScanError('')
    setCountScanLoading(true)
    try {
      const data = await apiFetch<ProductDetail>(`/products/${encodeURIComponent(q)}`)
      setCountProduct(data)
      // Suggest first location if product has a single balance
      if (!countLocationId && data.balances.length === 1) {
        setCountLocationId(String(data.balances[0].location_id))
      }
    } catch (err) {
      setCountScanError(isApiError(err) ? err.error.message : 'Produto não encontrado.')
      setCountProduct(null)
    } finally {
      setCountScanLoading(false)
    }
  }

  async function handleRegisterCount(e: FormEvent) {
    e.preventDefault()
    if (!countProduct || !activeSession) return
    setCountSubmitting(true)
    try {
      await apiFetch('/inventory/count', {
        method: 'POST',
        body: JSON.stringify({
          session_id: activeSession.id,
          product_id: countProduct.id,
          location_id: Number(countLocationId),
          counted_quantity: Number(countQuantity),
        }),
      })
      setCountResult({ ok: true, message: `${countProduct.name} — ${countQuantity} un. registradas` })
      // Keep location, reset product and quantity for next scan
      setCountProduct(null)
      setCountIdentifier('')
      setCountQuantity('')
      setCountScanError('')
      setTimeout(() => countScanRef.current?.focus(), 50)
    } catch (err) {
      const msg = isApiError(err) ? err.error.message : 'Erro ao registrar contagem.'
      setCountResult({ ok: false, message: msg })
    } finally {
      setCountSubmitting(false)
    }
  }

  // ── Close operations ───────────────────────────────────────────────────

  async function handleCloseSession() {
    if (!activeSession) return
    setClosePhase('submitting')
    setCloseError('')
    try {
      const data = await apiFetch<{ adjusted: number; message: string }>(
        `/inventory/sessions/${activeSession.id}/close`,
        { method: 'POST', body: JSON.stringify({}) }
      )
      setClosePhase('closed')
      setCloseResult(data)
      setActiveSession((s) => s ? { ...s, status: 'FINALIZADO' } : s)
    } catch (err) {
      if (isApiError(err) && err.error.code === 'DIVERGENCE_EXCEEDS_THRESHOLD') {
        setViolations((err.error.details as DivergenceViolation[]) ?? [])
        setClosePhase('violation')
      } else {
        setCloseError(isApiError(err) ? err.error.message : 'Erro de conexão.')
        setClosePhase('idle')
      }
    }
  }

  function handleForceClose(e: FormEvent) {
    e.preventDefault()
    if (!activeSession || !justOk) return
    setShowForceConfirm(true)
  }

  async function confirmAndForceClose() {
    if (!activeSession) return
    setShowForceConfirm(false)
    setClosePhase('forcing')
    setCloseError('')
    try {
      const data = await apiFetch<{ adjusted: number; message: string }>(
        `/inventory/sessions/${activeSession.id}/close`,
        { method: 'POST', body: JSON.stringify({ justification: justification.trim() }) }
      )
      setClosePhase('closed')
      setCloseResult(data)
      setActiveSession((s) => s ? { ...s, status: 'FINALIZADO' } : s)
    } catch (err) {
      setCloseError(isApiError(err) ? err.error.message : 'Erro de conexão.')
      setClosePhase('violation')
    }
  }

  const isSessionActive = activeSession?.status === 'EM_ANDAMENTO'
  const justOk = justification.trim().length >= 10

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="p-5 lg:p-8 max-w-2xl mx-auto">

      {/* Page header */}
      <div className="flex items-center justify-between mb-7">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
            <ClipboardList size={18} className="text-slate-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900 leading-tight">Inventário</h1>
            <p className="text-xs text-slate-500">Contagem rotativa do depósito F01</p>
          </div>
        </div>
        {activeSession && (
          <button
            onClick={handleClearSession}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            <X size={14} /> Trocar sessão
          </button>
        )}
      </div>

      {/* Cancel success toast */}
      {cancelledToast && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
          <span>{cancelledToast}</span>
          <button
            onClick={() => setCancelledToast(null)}
            className="ml-auto text-emerald-500 hover:text-emerald-700"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── SESSION MANAGEMENT (no active session) ──────────────────── */}
      {!activeSession && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-5">
            {(['create', 'load'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => { setSessionTab(tab); setSessionError('') }}
                className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-sm font-medium transition-colors ${
                  sessionTab === tab
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab === 'create' ? <><Plus size={14} /> Nova sessão</> : <><Search size={14} /> Carregar por ID</>}
              </button>
            ))}
          </div>

          {sessionError && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3.5 py-3 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />{sessionError}
            </div>
          )}

          {/* Create form */}
          {sessionTab === 'create' && (
            <form onSubmit={handleCreateSession} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">Título da sessão</label>
                <input
                  type="text"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  required
                  placeholder="Ex: Auditoria Seção A — Banho e Cozinha"
                  className="h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-shadow"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">Categoria</label>
                <input
                  type="text"
                  value={createCategory}
                  onChange={(e) => setCreateCategory(e.target.value)}
                  required
                  placeholder="Ex: BANHO E COZINHA"
                  className="h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-shadow"
                />
              </div>

              {/* Blind count toggle */}
              <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-3.5 hover:bg-slate-100 transition-colors">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    checked={createBlind}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setCreateBlind(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className={`h-5 w-9 rounded-full transition-colors ${createBlind ? 'bg-slate-900' : 'bg-slate-300'}`} />
                  <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${createBlind ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800 flex items-center gap-1.5">
                    {createBlind ? <EyeOff size={14} /> : <Eye size={14} />}
                    Contagem Cega
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Oculta os saldos do sistema durante a bipagem. Operador conta sem viés.
                  </p>
                </div>
              </label>

              <button
                type="submit"
                disabled={creating || !createTitle.trim() || !createCategory.trim()}
                className="h-12 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 transition-colors mt-1"
              >
                {creating ? 'Criando…' : 'Criar Sessão'}
              </button>
            </form>
          )}

          {/* Load form */}
          {sessionTab === 'load' && (
            <form onSubmit={handleLoadSession} className="flex gap-2">
              <input
                type="number"
                min={1}
                value={loadId}
                onChange={(e) => { setLoadId(e.target.value); setSessionError('') }}
                placeholder="ID da sessão"
                inputMode="numeric"
                required
                className="h-12 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-shadow"
              />
              <button
                type="submit"
                disabled={sessionLoading || !loadId}
                className="h-12 px-5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                {sessionLoading ? '…' : 'Carregar'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* ── ACTIVE SESSION ──────────────────────────────────────────── */}
      {activeSession && (
        <>
          {/* Session info card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <StatusBadge status={activeSession.status} />
                  {activeSession.blind_count && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                      <EyeOff size={10} /> MODO CEGO
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 font-mono">#{activeSession.id}</span>
                </div>
                <p className="text-sm font-semibold text-slate-900 truncate">{activeSession.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{activeSession.category}</p>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  por {activeSession.username} · {formatDate(activeSession.created_at)}
                </p>
              </div>
            </div>
          </div>

          {/* ── COUNT FORM (only if session is active) ──────────────── */}
          {isSessionActive && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-5">
              <h2 className="text-sm font-semibold text-slate-900 mb-4">Registrar Contagem</h2>

              {/* Product scan */}
              <form onSubmit={handleCountScan} className="mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Produto <span className="text-slate-400 font-normal">(código ou EAN)</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      ref={countScanRef}
                      type="text"
                      value={countIdentifier}
                      onChange={(e) => { setCountIdentifier(e.target.value); setCountScanError('') }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCountScan() } }}
                      placeholder="Bipe ou código…"
                      autoComplete="off"
                      className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-shadow"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={countScanLoading || !countIdentifier.trim()}
                    className="h-12 px-4 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-40 transition-colors"
                  >
                    {countScanLoading ? '…' : 'Ok'}
                  </button>
                </div>
                {countScanError && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
                    <AlertCircle size={13} />{countScanError}
                  </p>
                )}
              </form>

              {/* Product card */}
              {countProduct && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 mb-4">
                  <div className="flex items-start gap-2.5">
                    <Package size={16} className="text-slate-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{countProduct.name}</p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">#{countProduct.item_code}</p>

                      {/* Only show balances if NOT blind count */}
                      {!activeSession.blind_count && countProduct.balances.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {countProduct.balances.map((b) => (
                            <span key={b.location_id} className="text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-slate-600">
                              {b.location_name ?? `#${b.location_id}`}: <strong>{b.quantity}</strong> un.
                            </span>
                          ))}
                        </div>
                      )}
                      {activeSession.blind_count && (
                        <p className="mt-1.5 text-[11px] text-amber-600 flex items-center gap-1">
                          <EyeOff size={11} /> Saldo oculto — modo cego ativo
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => { setCountProduct(null); setCountIdentifier(''); setCountScanError('') }}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* Count form */}
              {countProduct && (
                <form onSubmit={handleRegisterCount} className="flex flex-col gap-3.5">
                  {/* Location select */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-slate-700">Endereço contado</label>
                    <select
                      value={countLocationId}
                      onChange={(e) => setCountLocationId(e.target.value)}
                      required
                      className="h-12 w-full appearance-none rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-shadow"
                    >
                      <option value="">Selecionar endereço…</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-slate-700">
                      Quantidade contada
                      {activeSession.blind_count && (
                        <span className="ml-2 text-[10px] font-normal text-amber-600">(contagem cega)</span>
                      )}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={9999}
                      value={countQuantity}
                      onChange={(e) => setCountQuantity(e.target.value)}
                      required
                      inputMode="numeric"
                      placeholder="0"
                      className="h-14 rounded-xl border border-slate-300 bg-white px-4 text-2xl font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-shadow text-center tracking-wide"
                    />
                  </div>

                  {/* Count result toast */}
                  {countResult && (
                    <div className={`flex items-start gap-2 rounded-xl px-3.5 py-3 text-sm ${
                      countResult.ok
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border border-red-200 text-red-800'
                    }`}>
                      {countResult.ok
                        ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                        : <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-500" />}
                      <span>{countResult.message}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={countSubmitting || !countLocationId || countQuantity === ''}
                    className="h-12 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 transition-colors"
                  >
                    {countSubmitting ? 'Registrando…' : 'Registrar Contagem'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ── CLOSE SESSION (Admin only) ───────────────────────────── */}
          {isAdmin && isSessionActive && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {/* Normal close */}
              {(closePhase === 'idle' || closePhase === 'submitting') && (
                <div className="p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-sm font-semibold text-slate-900">Fechar Sessão</h2>
                    <ShieldAlert size={16} className="text-slate-400" />
                  </div>
                  <p className="text-xs text-slate-500 mb-4">
                    Reconcilia os saldos do inventário com as contagens registradas. Ação irreversível.
                  </p>
                  {closeError && (
                    <div className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3.5 py-3 text-sm text-red-700">
                      <AlertCircle size={15} className="shrink-0" />{closeError}
                    </div>
                  )}
                  <button
                    onClick={handleCloseSession}
                    disabled={closePhase === 'submitting'}
                    className="w-full h-12 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors"
                  >
                    {closePhase === 'submitting' ? 'Verificando divergências…' : 'Fechar Sessão'}
                  </button>
                </div>
              )}

              {/* ── 422 DIVERGENCE STATE ──────────────────────────────── */}
              {(closePhase === 'violation' || closePhase === 'forcing') && (
                <div>
                  {/* Alert header */}
                  <div className="bg-red-600 px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle size={20} className="text-red-200 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-white">Divergências críticas detectadas</p>
                        <p className="text-xs text-red-200 mt-0.5">
                          O fechamento foi bloqueado. Revise os itens abaixo e justifique para prosseguir.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-5">
                    {/* Violations table */}
                    <ViolationsTable violations={violations} />

                    {/* Force close form */}
                    <form onSubmit={handleForceClose} className="mt-5 flex flex-col gap-3.5">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-semibold text-slate-900">
                          Justificativa obrigatória
                          <span className={`ml-2 text-xs font-normal transition-colors ${justOk ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {justification.trim().length}/10 mín.
                          </span>
                        </label>
                        <textarea
                          value={justification}
                          onChange={(e) => setJustification(e.target.value)}
                          rows={3}
                          required
                          minLength={10}
                          placeholder="Descreva o motivo da divergência para auditoria…"
                          className="w-full resize-none rounded-xl border border-slate-300 bg-white p-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-shadow"
                        />
                      </div>

                      {closeError && (
                        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3.5 py-3 text-sm text-red-700">
                          <AlertCircle size={15} className="shrink-0" />{closeError}
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        {/* Abort — discards the session entirely and unblocks all products */}
                        <button
                          type="button"
                          onClick={() => void handleCancelSession()}
                          disabled={cancelling || closePhase === 'forcing'}
                          className="h-12 w-full rounded-xl border-2 border-dashed border-red-300 bg-red-50 text-red-700 text-sm font-semibold hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {cancelling ? 'Abortando…' : '↩ Abortar e descartar esta sessão'}
                        </button>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setClosePhase('idle'); setViolations([]); setJustification(''); setCloseError('') }}
                            disabled={cancelling}
                            className="flex-1 h-12 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-40 transition-colors"
                          >
                            Voltar
                          </button>
                          <button
                            type="submit"
                            disabled={!justOk || closePhase === 'forcing' || cancelling}
                            className="flex-1 h-12 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 active:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {closePhase === 'forcing' ? 'Forçando…' : 'Forçar Fechamento'}
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Closed success */}
              {closePhase === 'closed' && closeResult && (
                <div className="p-5 flex items-start gap-3">
                  <CheckCircle2 size={22} className="text-emerald-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Sessão encerrada com sucesso</p>
                    <p className="text-xs text-slate-500 mt-1">{closeResult.message}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Already closed */}
          {activeSession.status === 'FINALIZADO' && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 flex items-start gap-3">
              <Lock size={18} className="text-slate-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-700">Sessão encerrada</p>
                {activeSession.finalized_at && (
                  <p className="text-xs text-slate-500 mt-0.5">{formatDate(activeSession.finalized_at)}</p>
                )}
                {activeSession.close_justification && (
                  <p className="text-xs text-slate-500 mt-1 italic">"{activeSession.close_justification}"</p>
                )}
              </div>
            </div>
          )}

          {/* Cancelled */}
          {activeSession.status === 'CANCELADA' && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 flex items-start gap-3">
              <X size={18} className="text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700">Sessão cancelada</p>
                <p className="text-xs text-red-500 mt-0.5">
                  Todas as contagens foram descartadas. Os produtos estão desbloqueados.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── FORCE CLOSE CONFIRMATION MODAL ──────────────────────── */}
      {showForceConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowForceConfirm(false) }}
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="bg-amber-500 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <AlertTriangle size={20} className="text-amber-100 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-white">Confirmar fechamento forçado</p>
                  <p className="text-xs text-amber-100 mt-0.5">Revise os itens antes de prosseguir.</p>
                </div>
                <button
                  onClick={() => setShowForceConfirm(false)}
                  className="ml-auto text-amber-200 hover:text-white transition-colors"
                  aria-label="Fechar modal"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-5">
              <p className="text-sm text-slate-700 mb-3">
                Os seguintes saldos serão atualizados de forma{' '}
                <span className="font-bold text-slate-900">permanente e irreversível</span>:
              </p>

              {/* Violation items */}
              <div className="mb-4 flex flex-col gap-2 max-h-48 overflow-y-auto">
                {violations.map((v) => (
                  <div
                    key={`${v.product_id}-${v.location_id}`}
                    className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5"
                  >
                    <p className="text-xs font-semibold text-slate-900 truncate">{v.product_name}</p>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                      #{v.item_code} · {v.location_name}
                    </p>
                    <p className="text-xs text-slate-700 mt-1.5">
                      Saldo atual:{' '}
                      <span className="line-through text-slate-400">{v.expected_quantity} un.</span>
                      {' → '}
                      <span className="font-bold text-amber-700">{v.counted_quantity} un.</span>
                    </p>
                  </div>
                ))}
              </div>

              {/* Justification preview */}
              <div className="mb-4 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5">
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-0.5">
                  Justificativa registrada
                </p>
                <p className="text-xs text-slate-700 italic">"{justification.trim()}"</p>
              </div>

              {/* Final warning */}
              <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-700">
                Ao confirmar, o estoque será ajustado conforme as quantidades contadas e esta operação não poderá ser desfeita.
              </p>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-5 pb-5">
              <button
                type="button"
                onClick={() => setShowForceConfirm(false)}
                className="flex-1 h-12 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => void confirmAndForceClose()}
                className="flex-1 h-12 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 active:bg-amber-800 transition-colors"
              >
                Sim, confirmar e atualizar estoque
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
