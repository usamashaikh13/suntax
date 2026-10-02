'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Plus, FileText, Trash2, Search, ArrowUpRight,
  Filter, Shield, CheckCircle2, Clock, Sparkles, ChevronRight
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { TaxReturn } from '@/types'
import { formatDate, cn } from '@/lib/utils'

const DEFAULT_STATUS_META = { label: 'Draft', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' }

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  draft: DEFAULT_STATUS_META,
  in_progress: { label: 'In Progress', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  review: { label: 'Under Review', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed: { label: 'Confirmed', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  exported: { label: 'Exported & Filed', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
}

const CANTON_NAMES: Record<string, string> = {
  ZH: 'Zurich', ZG: 'Zug', SZ: 'Schwyz', SG: 'St. Gallen',
  AG: 'Aargau', BE: 'Bern', BS: 'Basel-Stadt', LU: 'Lucerne',
  UR: 'Uri', OW: 'Obwalden', NW: 'Nidwalden', GL: 'Glarus',
  FR: 'Fribourg', SO: 'Solothurn', BL: 'Basel-Landschaft',
  SH: 'Schaffhausen', AR: 'Appenzell Ausserrhoden', AI: 'Appenzell Innerrhoden',
  GR: 'Graubünden', TG: 'Thurgau', TI: 'Ticino', VD: 'Vaud',
  VS: 'Valais', NE: 'Neuchâtel', GE: 'Geneva', JU: 'Jura',
}

export default function TaxReturnsPage() {
  const { toast } = useToast()
  const [taxReturns, setTaxReturns] = useState<TaxReturn[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'in_progress' | 'confirmed'>('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = async () => {
    try {
      const response = await api.taxReturns.list()
      const list = Array.isArray(response) ? response : (response?.items || [])
      setTaxReturns(list)
    } catch {
      toast({ title: 'Failed to load tax returns', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await api.taxReturns.delete(id)
      toast({ title: 'Tax return deleted successfully' })
      setTaxReturns(prev => prev.filter(t => t.id !== id))
    } catch {
      toast({ title: 'Could not delete tax return', variant: 'destructive' })
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  const filteredReturns = useMemo(() => {
    return taxReturns.filter(tr => {
      const canton = (CANTON_NAMES[tr.canton_code] || tr.canton_code).toLowerCase()
      const muni = (tr.municipality_name || '').toLowerCase()
      const matchesSearch = canton.includes(searchQuery.toLowerCase()) || muni.includes(searchQuery.toLowerCase())

      if (!matchesSearch) return false
      if (statusFilter === 'all') return true
      const s = String(tr.status)
      if (statusFilter === 'confirmed') return s === 'confirmed' || s === 'exported' || s === 'completed'
      return s === statusFilter
    })
  }, [taxReturns, searchQuery, statusFilter])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] space-y-3">
        <div className="animate-spin rounded-full h-9 w-9 border-2 border-red-600 border-t-transparent" />
        <p className="text-xs font-medium text-slate-500">Loading your Swiss tax portfolio...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Tax Returns Portfolio
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage your annual Swiss tax declarations across all 26 cantons.
          </p>
        </div>
        <Button asChild className="bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-600/20 font-semibold h-10 px-4">
          <Link href="/tax-returns/new">
            <Plus className="h-4 w-4 mr-2" />
            New Tax Return
          </Link>
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 bg-white rounded-xl border border-slate-200/80 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Canton or Municipality..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-transparent rounded-lg border-none focus:outline-none focus:ring-1 focus:ring-red-600 text-slate-900 placeholder:text-slate-400"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-lg flex-shrink-0">
          {[
            { id: 'all', label: 'All' },
            { id: 'draft', label: 'Drafts' },
            { id: 'in_progress', label: 'In Progress' },
            { id: 'confirmed', label: 'Confirmed' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id as any)}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-md transition-all',
                statusFilter === f.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Returns List */}
      {filteredReturns.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
          <CardContent className="py-16 text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto shadow-sm">
              <FileText className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                {searchQuery || statusFilter !== 'all' ? 'No matching returns found' : 'No tax returns yet'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery || statusFilter !== 'all'
                  ? 'Try clearing your search query or switching your status filter.'
                  : 'Start your official declaration with verified 2025/2026 cantonal tax rules.'}
              </p>
            </div>
            {!searchQuery && statusFilter === 'all' && (
              <Button asChild className="bg-red-600 hover:bg-red-700 text-white text-xs">
                <Link href="/tax-returns/new">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Create First Tax Return
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3.5">
          {filteredReturns.map(tr => {
            const cantonName = CANTON_NAMES[tr.canton_code] || tr.canton_code
            const statusMeta = STATUS_CONFIG[String(tr.status)] || DEFAULT_STATUS_META

            return (
              <Card
                key={tr.id}
                className="group border-slate-200/90 hover:border-red-300 hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Return Details Link */}
                    <Link
                      href={`/tax-returns/${tr.id}`}
                      className="flex items-center gap-4 flex-1 min-w-0"
                    >
                      <div className="h-12 w-12 rounded-xl bg-slate-100 border border-slate-200/80 group-hover:bg-red-50 group-hover:text-red-700 group-hover:border-red-200 text-slate-800 font-bold text-base flex items-center justify-center flex-shrink-0 transition-colors">
                        {tr.canton_code}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-base text-slate-900 group-hover:text-red-600 transition-colors truncate">
                            {cantonName} – {tr.municipality_name}
                          </p>
                          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            Tax Year {tr.tax_year}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                          <span>BFS Commune #{tr.municipality_code}</span>
                          <span>•</span>
                          <span>Created {formatDate(tr.created_at)}</span>
                        </div>
                      </div>
                    </Link>

                    {/* Actions and Status */}
                    <div className="flex items-center gap-3 self-end sm:self-center flex-shrink-0">
                      <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border', statusMeta.badgeClass)}>
                        {statusMeta.label}
                      </span>

                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="text-xs font-semibold text-slate-700 hover:text-red-600 hover:border-red-200 h-8"
                      >
                        <Link href={`/tax-returns/${tr.id}`}>
                          Open Return <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Link>
                      </Button>

                      {confirmDeleteId === tr.id ? (
                        <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-slate-600"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 px-2.5 text-xs bg-red-600 hover:bg-red-700 text-white"
                            disabled={deletingId === tr.id}
                            onClick={() => handleDelete(tr.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(tr.id)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete return"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
