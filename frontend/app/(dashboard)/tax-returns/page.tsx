'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, FileText, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { TaxReturn } from '@/types'
import { formatDate } from '@/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  review: 'Under Review',
  confirmed: 'Confirmed',
  exported: 'Exported',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  exported: 'bg-purple-100 text-purple-700',
}

const CANTON_NAMES: Record<string, string> = {
  ZH: 'Zurich', ZG: 'Zug', SZ: 'Schwyz',
  SG: 'St. Gallen', AG: 'Aargau', BE: 'Bern', BS: 'Basel-Stadt',
  LU: 'Lucerne', UR: 'Uri', OW: 'Obwalden', NW: 'Nidwalden',
  GL: 'Glarus', FR: 'Fribourg', SO: 'Solothurn', BL: 'Basel-Landschaft',
  SH: 'Schaffhausen', AR: 'Appenzell Ausserrhoden', AI: 'Appenzell Innerrhoden',
  GR: 'Graubünden', TG: 'Thurgau', TI: 'Ticino', VD: 'Vaud',
  VS: 'Valais', NE: 'Neuchâtel', GE: 'Geneva', JU: 'Jura',
}

export default function TaxReturnsPage() {
  const { toast } = useToast()
  const [taxReturns, setTaxReturns] = useState<TaxReturn[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = async () => {
    try {
      const response = await api.taxReturns.list()
      setTaxReturns(response.items ?? response)
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
      toast({ title: 'Tax return deleted' })
      setTaxReturns(prev => prev.filter(t => t.id !== id))
    } catch {
      toast({ title: 'Could not delete tax return', variant: 'destructive' })
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tax Returns</h2>
          <p className="text-gray-500 text-sm mt-1">
            {taxReturns.length} tax return{taxReturns.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button asChild className="bg-red-600 hover:bg-red-700">
          <Link href="/tax-returns/new">
            <Plus className="h-4 w-4 mr-2" />
            New Tax Return
          </Link>
        </Button>
      </div>

      {taxReturns.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-14 w-14 text-gray-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No tax returns yet</h3>
            <p className="text-gray-400 mb-6">Get started by creating your first tax return.</p>
            <Button asChild className="bg-red-600 hover:bg-red-700">
              <Link href="/tax-returns/new">
                <Plus className="h-4 w-4 mr-2" />
                Create your first tax return
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {taxReturns.map(tr => (
            <Card
              key={tr.id}
              className="hover:border-red-200 hover:shadow-md transition-all"
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <Link href={`/tax-returns/${tr.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center text-red-700 font-bold text-sm flex-shrink-0">
                      {tr.canton_code}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {CANTON_NAMES[tr.canton_code] ?? tr.canton_code} – {tr.municipality_name}
                      </p>
                      <p className="text-sm text-gray-500">Tax year {tr.tax_year}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Created {formatDate(tr.created_at)}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Badge className={STATUS_COLORS[tr.status]}>
                      {STATUS_LABELS[tr.status] ?? tr.status}
                    </Badge>
                    {confirmDeleteId === tr.id ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="bg-red-600 hover:bg-red-700"
                          disabled={deletingId === tr.id}
                          onClick={() => handleDelete(tr.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(tr.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors p-1"
                        title="Delete tax return"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
