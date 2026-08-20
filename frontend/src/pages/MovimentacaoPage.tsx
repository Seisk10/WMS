import { useState, useEffect, useRef, type FormEvent } from 'react'
import {
  ArrowLeftRight, Search, Package, X,
  CheckCircle2, AlertCircle, AlertTriangle, MapPin,
} from 'lucide-react'
import { apiFetch, isApiError } from '../lib/api'

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
  brand: string | null
  balances: ProductBalance[]
}

// ── Sub-components ─────────────────────────────────────────────────────────

function LocationSelect({
  id, label, value, onChange, locations, balances = [], exclude,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  locations: Location[]
  balances?: ProductBalance[]
  exclude?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className="h-12 w-full appearance-none rounded-xl border border-slate-300 bg-white pl-9 pr-10 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-shadow disabled:opacity-50"
        >
          <option value="">Selecionar endereço…</option>
          {locations
            .filter((l) => exclude ? String(l.id) !== exclude : true)
            .map((l) => {
              const bal = balances.find((b) => b.location_id === l.id)
              const typeLabel = l.type === 'gondola' ? 'Gôndola' : 'Depósito'
              const balLabel = bal !== undefined ? ` — ${bal.quantity} un.` : ''
              return (
                <option key={l.id} value={l.id}>
                  {l.name} ({typeLabel}){balLabel}
                </option>
              )
            })}
        </select>
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 border-[5px] border-transparent border-t-slate-400 translate-y-[-20%]" />
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function MovimentacaoPage() {
  // Locations
  const [locations, setLocations] = useState<Location[]>([])
  const [locError, setLocError] = useState(false)

  // Product scan
  const [identifier, setIdentifier] = useState('')
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState('')
  const [product, setProduct] = useState<ProductDetail | null>(null)

  // Movement form
  const [originId, setOriginId] = useState('')
  const [destId, setDestId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [idempKey, setIdempKey] = useState(() => crypto.randomUUID())

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ id: number; productName: string; origin: string; dest: string; qty: number } | null>(null)
  const [submitError, setSubmitError] = useState<{ code: string; message: string } | null>(null)

  const scanRef = useRef<HTMLInputElement>(null)

  // Fetch locations on mount
  useEffect(() => {
    apiFetch<Location[]>('/locations')
      .then(setLocations)
      .catch(() => setLocError(true))
  }, [])

  // Auto-dismiss success after 5 s
  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => resetForm(), 5000)
    return () => clearTimeout(t)
  }, [success])

  function resetForm() {
    setProduct(null)
    setIdentifier('')
    setOriginId('')
    setDestId('')
    setQuantity('')
    setIdempKey(crypto.randomUUID())
    setSubmitError(null)
    setSuccess(null)
    setTimeout(() => scanRef.current?.focus(), 50)
  }

  async function handleScan(e?: FormEvent) {
    e?.preventDefault()
    const q = identifier.trim()
    if (!q) return
    setScanError('')
    setScanLoading(true)
    try {
      const data = await apiFetch<ProductDetail>(`/products/${encodeURIComponent(q)}`)
      setProduct(data)
      setSubmitError(null)
      // Pre-select origin if product has exactly one location with stock
      const withStock = data.balances.filter((b) => b.quantity > 0)
      if (withStock.length === 1) setOriginId(String(withStock[0].location_id))
    } catch (err) {
      setScanError(isApiError(err) ? err.error.message : 'Erro ao buscar produto.')
      setProduct(null)
    } finally {
      setScanLoading(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!product) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await apiFetch<{ id: number }>('/movements', {
        method: 'POST',
        body: JSON.stringify({
          product_id: product.id,
          origin_location_id: Number(originId),
          destination_location_id: Number(destId),
          quantity: Number(quantity),
          idempotency_key: idempKey,
        }),
      })
      const originName = locations.find((l) => String(l.id) === originId)?.name ?? originId
      const destName   = locations.find((l) => String(l.id) === destId)?.name   ?? destId
      setSuccess({ id: result.id, productName: product.name, origin: originName, dest: destName, qty: Number(quantity) })
      setIdempKey(crypto.randomUUID())
    } catch (err) {
      setSubmitError(isApiError(err) ? err.error : { code: 'NETWORK_ERROR', message: 'Falha de conexão.' })
    } finally {
      setSubmitting(false)
    }
  }

  const originBalance = product?.balances.find((b) => String(b.location_id) === originId)?.quantity
  const qtyNum = Number(quantity)
  const overStock = originBalance !== undefined && qtyNum > originBalance && qtyNum > 0

  return (
    <div className="p-5 lg:p-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-7">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
          <ArrowLeftRight size={18} className="text-slate-600" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-slate-900 leading-tight">Movimentação</h1>
          <p className="text-xs text-slate-500">Transferência de estoque entre endereços</p>
        </div>
      </div>

      {/* Success card */}
      {success && (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={22} className="text-emerald-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-800">Movimentação registrada!</p>
              <p className="text-xs text-emerald-700 mt-0.5 truncate">{success.productName}</p>
              <p className="text-xs text-emerald-600 mt-1.5">
                {success.origin} → {success.dest} · {success.qty} un. · #{success.id}
              </p>
            </div>
            <button
              onClick={resetForm}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-900 whitespace-nowrap ml-2"
            >
              Nova ↩
            </button>
          </div>
        </div>
      )}

      {/* Location fetch error */}
      {locError && (
        <div className="mb-5 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle size={16} className="shrink-0" />
          Não foi possível carregar os endereços. Recarregue a página.
        </div>
      )}

      {/* ── SCAN SECTION ──────────────────────────────── */}
      <form onSubmit={handleScan} className="mb-4">
        <label htmlFor="scan-input" className="block text-sm font-medium text-slate-700 mb-1.5">
          Produto <span className="text-slate-400 font-normal">(código ou EAN)</span>
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={scanRef}
              id="scan-input"
              type="text"
              value={identifier}
              onChange={(e) => { setIdentifier(e.target.value); setScanError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleScan() } }}
              placeholder="Bipe ou digite o código…"
              autoFocus
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-shadow"
            />
          </div>
          <button
            type="submit"
            disabled={scanLoading || !identifier.trim()}
            className="h-12 px-4 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-40 transition-colors shrink-0"
          >
            {scanLoading ? '…' : 'Buscar'}
          </button>
        </div>
        {scanError && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle size={13} /> {scanError}
          </p>
        )}
      </form>

      {/* Product card */}
      {product && (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 shrink-0">
              <Package size={17} className="text-slate-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 leading-tight truncate">{product.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">#{product.item_code} · {product.category}</p>
              {product.balances.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {product.balances.map((b) => (
                    <span
                      key={b.location_id}
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium ${
                        b.quantity > 0 ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-400'
                      }`}
                    >
                      {b.location_name ?? `#${b.location_id}`}
                      <span className={b.quantity > 0 ? 'text-slate-900 font-bold' : ''}>{b.quantity} un.</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-amber-600">Sem saldo registrado em nenhum endereço.</p>
              )}
            </div>
            <button
              onClick={() => { setProduct(null); setOriginId(''); setDestId(''); setIdentifier(''); setSubmitError(null); scanRef.current?.focus() }}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Limpar produto"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ── MOVEMENT FORM ──────────────────────────────── */}
      {product && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <LocationSelect
            id="origin"
            label="Origem"
            value={originId}
            onChange={setOriginId}
            locations={locations}
            balances={product.balances}
          />

          <LocationSelect
            id="destination"
            label="Destino"
            value={destId}
            onChange={setDestId}
            locations={locations}
            exclude={originId}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="quantity" className="text-sm font-medium text-slate-700">
              Quantidade
            </label>
            <input
              id="quantity"
              type="number"
              min={1}
              max={9999}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              inputMode="numeric"
              placeholder="0"
              className="h-14 rounded-xl border border-slate-300 bg-white px-4 text-xl font-semibold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-shadow text-center"
            />
            {overStock && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600">
                <AlertTriangle size={13} />
                Saldo disponível na origem: {originBalance} un. O servidor irá rejeitar se insuficiente.
              </p>
            )}
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5">
              <div className="flex items-start gap-2.5">
                <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-800">
                    {submitError.code === 'PRODUCT_UNDER_INVENTORY'
                      ? 'Produto em inventário ativo'
                      : submitError.code === 'INSUFFICIENT_STOCK'
                      ? 'Saldo insuficiente na origem'
                      : submitError.code === 'SAME_LOCATION'
                      ? 'Origem e destino iguais'
                      : 'Erro ao registrar'}
                  </p>
                  <p className="text-xs text-red-700 mt-1">{submitError.message}</p>
                  <span className="mt-2 inline-block rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-mono text-red-600">
                    {submitError.code}
                  </span>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !originId || !destId || !quantity || originId === destId}
            className="h-14 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 active:bg-slate-950 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mt-1"
          >
            {submitting ? 'Registrando…' : 'Registrar Movimentação'}
          </button>
        </form>
      )}
    </div>
  )
}
