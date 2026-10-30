import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'

const STATUS_CONF = {
  in_progress: {
    label: 'In Progress',
    badge: 'bg-orange-50 text-orange-700 border-orange-200',
    dot:   'bg-orange-500 animate-pulse',
  },
  done: {
    label: 'Done',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot:   'bg-emerald-500',
  },
  cancelled: {
    label: 'Cancelled',
    badge: 'bg-gray-100 text-gray-500 border-gray-200',
    dot:   'bg-gray-400',
  },
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export default function BatchesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [batches,   setBatches]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [filter,    setFilter]    = useState('all')
  const [updating,  setUpdating]  = useState(null)

  useEffect(() => {
    if (!user) return
    const fetch = async () => {
      try {
        const { data, error: e } = await supabase
          .from('production_batches')
          .select('*')
          .eq('shop_id', user.id)
          .order('started_at', { ascending: false })
        if (e) throw e
        setBatches(data || [])
      } catch (err) {
        setError('Failed to load batches.')
      } finally {
        setLoading(false)
      }
    }
    fetch()

    const channel = supabase
      .channel(`batches_${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'production_batches',
        filter: `shop_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setBatches((prev) => [payload.new, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setBatches((prev) => prev.map((b) => b.id === payload.new.id ? payload.new : b))
        } else if (payload.eventType === 'DELETE') {
          setBatches((prev) => prev.filter((b) => b.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user])

  const handleStatusChange = async (batch, newStatus) => {
    setUpdating(batch.id)
    try {
      const updates = {
        status: newStatus,
        ...(newStatus === 'done' ? { completed_at: new Date().toISOString() } : {}),
      }
      const { error: e } = await supabase
        .from('production_batches')
        .update(updates)
        .eq('id', batch.id)
        .eq('shop_id', user.id)
      if (e) throw e
      setBatches((prev) =>
        prev.map((b) => b.id === batch.id ? { ...b, ...updates } : b)
      )
    } catch (err) {
      setError(err.message || 'Failed to update batch status.')
    } finally {
      setUpdating(null)
    }
  }

  const filtered = batches.filter((b) => filter === 'all' || b.status === filter)
  const inProgressCount = batches.filter((b) => b.status === 'in_progress').length

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                Production Batches
              </h1>
              {inProgressCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                  {inProgressCount} active
                </span>
              )}
            </div>
            <p className="text-gray-500 text-sm mt-1">
              Track kitchen preparation and raw material usage
            </p>
          </div>
          <div className="flex gap-3">
            <Link to="/kitchen" className="btn-secondary text-sm flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>Raw Materials</span>
            </Link>
            <Link to="/kitchen/batches/new" className="btn-primary text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Start Batch</span>
            </Link>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {[
            { key: 'all',         label: `All Batches (${batches.length})` },
            { key: 'in_progress', label: `In Progress (${batches.filter((b) => b.status === 'in_progress').length})` },
            { key: 'done',        label: `Completed (${batches.filter((b) => b.status === 'done').length})` },
            { key: 'cancelled',   label: `Cancelled (${batches.filter((b) => b.status === 'cancelled').length})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-all ${
                filter === tab.key
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
            <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Loading production batches…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm p-8">
            <h3 className="text-lg font-bold text-gray-900">
              {filter === 'all' ? 'No batches recorded yet' : `No ${filter.replace('_', ' ')} batches`}
            </h3>
            <p className="text-gray-500 text-sm mt-1 mb-6">
              {filter === 'all'
                ? 'Start a batch to automatically deduct ingredients from raw material stock.'
                : 'Select another filter tab above.'}
            </p>
            {filter === 'all' && (
              <Link to="/kitchen/batches/new" className="btn-primary text-sm inline-flex items-center gap-2">
                + Start First Batch
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((batch) => {
              const conf = STATUS_CONF[batch.status] || STATUS_CONF.in_progress
              const isUpdatingThis = updating === batch.id

              return (
                <div
                  key={batch.id}
                  className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-bold text-gray-900 text-base">{batch.item_name}</h3>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold border ${conf.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
                        {conf.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-gray-500">
                      <span className="font-bold text-gray-900">
                        {Number(batch.qty_kg)} kg produced
                      </span>
                      <span>·</span>
                      <span>Started: {fmtDate(batch.started_at)} at {fmtTime(batch.started_at)}</span>
                      {batch.completed_at && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-700 font-medium">Done: {fmtDate(batch.completed_at)}</span>
                        </>
                      )}
                      {batch.expiry_date && (
                        <>
                          <span>·</span>
                          <span>Expiry: {batch.expiry_date}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {batch.status === 'in_progress' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleStatusChange(batch, 'done')}
                        disabled={isUpdatingThis}
                        className="btn text-xs font-semibold min-h-9 px-3.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                      >
                        {isUpdatingThis ? 'Updating…' : '✓ Mark Complete'}
                      </button>
                      <button
                        onClick={() => handleStatusChange(batch, 'cancelled')}
                        disabled={isUpdatingThis}
                        className="btn text-xs font-semibold min-h-9 px-3 bg-white text-gray-500 border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                      >
                        {isUpdatingThis ? '…' : 'Cancel'}
                      </button>
                    </div>
                  )}
                  {batch.status === 'done' && (
                    <span className="text-xs text-emerald-700 font-semibold shrink-0 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">
                      Completed
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
