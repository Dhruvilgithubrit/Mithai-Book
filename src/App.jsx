import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

// ── Public pages ────────────────────────────────────────────────────────
import LoginPage  from './pages/LoginPage'
import SignupPage from './pages/SignupPage'

// ── Phase 1: Core loop ──────────────────────────────────────────────────
import SetupPage     from './pages/SetupPage'
import DashboardPage from './pages/DashboardPage'
import CounterPage   from './pages/CounterPage'
import AddItemPage   from './pages/AddItemPage'
import SalePage      from './pages/SalePage'

// ── Phase 2: Kitchen side ───────────────────────────────────────────────
import RawMaterialsPage from './pages/RawMaterialsPage'
import AddMaterialPage  from './pages/AddMaterialPage'
import BatchesPage      from './pages/BatchesPage'
import NewBatchPage     from './pages/NewBatchPage'

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

          {/* ── Fallback ───────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
