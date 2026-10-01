'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, FileText, Clock, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { TaxReturn } from '@/types'
import { formatDate } from '@/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In progress',
  review: 'Review',
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
}

export default function TaxReturnsPage() {
  const [taxReturns, setTaxReturns] = useState<TaxReturn[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.taxReturns.list()
      .then((response) => setTaxReturns(response.items))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

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
        <p className="text-gray-500">{taxReturns.length} tax return{taxReturns.length !== 1 ? 's' : ''}</p>
        <Button asChild className="bg-red-600 hover:bg-red-700">
          <Link href="/tax-returns/new">
            <Plus className="h-4 w-4 mr-2" />
            New tax return
          </Link>
        </Button>
      </div>

      {taxReturns.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-14 w-14 text-gray-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No tax returns yet</h3>
            <p className="text-gray-400 mb-6">Create your first tax return now.</p>
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
            <Link key={tr.id} href={`/tax-returns/${tr.id}`}>
              <Card className="hover:border-red-200 hover:shadow-md transition-all cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-red-100 flex items-center justify-center text-red-700 font-bold text-sm">
                        {tr.canton_code}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">
                          {CANTON_NAMES[tr.canton_code]} – {tr.municipality_name}
                        </p>
                        <p className="text-sm text-gray-500">Tax year {tr.tax_year}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Created {formatDate(tr.created_at)}</p>
                      </div>
                    </div>
                    <Badge className={STATUS_COLORS[tr.status]}>
                      {STATUS_LABELS[tr.status] || tr.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
