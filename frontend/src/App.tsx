import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import MovimentacaoPage from './pages/MovimentacaoPage'
import InventarioPage from './pages/InventarioPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('wms_token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="movimentacao" element={<MovimentacaoPage />} />
          <Route path="inventario" element={<InventarioPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
