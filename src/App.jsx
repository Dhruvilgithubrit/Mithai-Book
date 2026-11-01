import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

// ── Public pages ────────────────────────────────────────────────────────
import LoginPage  from './pages/LoginPage'
import SignupPage from './pages/SignupPage'

// ── Phase 1: Core counter & billing ──────────────────────────────────────
import SetupPage     from './pages/SetupPage'
import DashboardPage from './pages/DashboardPage'
import CounterPage   from './pages/CounterPage'
import AddItemPage   from './pages/AddItemPage'
import SalePage      from './pages/SalePage'

// ── Phase 2: Kitchen & Raw Materials ─────────────────────────────────────
import RawMaterialsPage from './pages/RawMaterialsPage'
import AddMaterialPage  from './pages/AddMaterialPage'
import BatchesPage      from './pages/BatchesPage'
import NewBatchPage     from './pages/NewBatchPage'

// ── Phase 3: Orders, Expiry & Money ──────────────────────────────────────
import OrdersPage    from './pages/OrdersPage'
import NewOrderPage  from './pages/NewOrderPage'
import ExpiryPage    from './pages/ExpiryPage'
import ReconcilePage from './pages/ReconcilePage'

function Protected({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Public ─────────────────────────────────────────────── */}
          <Route path="/login"  element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* ── Phase 1 ────────────────────────────────────────────── */}
          <Route path="/setup"       element={<Protected><SetupPage /></Protected>} />
          <Route path="/dashboard"   element={<Protected><DashboardPage /></Protected>} />
          <Route path="/counter"     element={<Protected><CounterPage /></Protected>} />
          <Route path="/counter/add" element={<Protected><AddItemPage /></Protected>} />
          <Route path="/sale"        element={<Protected><SalePage /></Protected>} />

          {/* ── Phase 2 ────────────────────────────────────────────── */}
          <Route path="/kitchen"                element={<Protected><RawMaterialsPage /></Protected>} />
          <Route path="/kitchen/materials/add"  element={<Protected><AddMaterialPage /></Protected>} />
          <Route path="/kitchen/batches"        element={<Protected><BatchesPage /></Protected>} />
          <Route path="/kitchen/batches/new"    element={<Protected><NewBatchPage /></Protected>} />

          {/* ── Phase 3 ────────────────────────────────────────────── */}
          <Route path="/orders"      element={<Protected><OrdersPage /></Protected>} />
          <Route path="/orders/new"  element={<Protected><NewOrderPage /></Protected>} />
          <Route path="/expiry"      element={<Protected><ExpiryPage /></Protected>} />
          <Route path="/reconcile"   element={<Protected><ReconcilePage /></Protected>} />

          {/* ── Fallback ───────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
