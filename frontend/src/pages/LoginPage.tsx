import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, Eye, EyeOff, AlertCircle } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json() as { success: boolean; data?: { token: string }; error?: { message: string } }

      if (!res.ok || !data.success) {
        setError(data.error?.message ?? 'Usuário ou senha inválidos.')
        return
      }

      localStorage.setItem('wms_token', data.data!.token)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Falha de conexão. Verifique se o servidor está ativo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 mb-4">
            <Package size={28} strokeWidth={2} className="text-emerald-400" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">WMS Cassol</h1>
          <p className="text-sm text-slate-500 mt-1">Filial F01 — Campinas</p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900 mb-5">Entrar</h2>

          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-5 text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-sm font-medium text-slate-700">
                Usuário
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="seu.usuario"
                required
                className="h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-shadow"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-12 rounded-xl bg-slate-900 text-white text-sm font-semibold mt-1 hover:bg-slate-800 active:bg-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
