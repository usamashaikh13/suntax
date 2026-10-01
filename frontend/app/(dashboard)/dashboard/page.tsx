'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, FileText, Clock, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { TaxReturn, User } from '@/types'
import { cn, getStatusColor } from '@/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  review: 'Under Review',
  confirmed: 'Confirmed',
  exported: 'Exported',
}

const CANTON_NAMES: Record<string, string> = {
  ZH: 'Zürich', ZG: 'Zug', SZ: 'Schwyz',
  SG: 'St. Gallen', AG: 'Aargau', BE: 'Bern', BS: 'Basel-City',
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [taxReturns, setTaxReturns] = useState<TaxReturn[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [me, returns] = await Promise.all([
          api.auth.getMe(),
          api.taxReturns.list(),
        ])
        setUser(me)
        setTaxReturns(returns.items)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const stats = {
    total: taxReturns.length,
    active: taxReturns.filter(r =>
      r.status === 'processing' || r.status === 'questions_pending' || r.status === 'calculating'
    ).length,
    confirmed: taxReturns.filter(r => r.status === 'confirmed').length,
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
      {/* Welcome */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.full_name?.split(' ')[0] || 'there'}! 👋
          </h2>
          <p className="text-gray-500 mt-1">
            Here is an overview of your tax returns.
          </p>
        </div>
        <Button asChild className="bg-red-600 hover:bg-red-700">
          <Link href="/tax-returns/new">
            <Plus className="h-4 w-4 mr-2" />
            New Tax Return
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-gray-500">Tax Returns</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-sm text-gray-500">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.confirmed}</p>
                <p className="text-sm text-gray-500">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent tax returns */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>My Tax Returns</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href="/tax-returns">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {taxReturns.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No tax returns yet
              </h3>
              <p className="text-gray-500 mb-4">
                Start your first Swiss tax return now.
              </p>
              <Button asChild className="bg-red-600 hover:bg-red-700">
                <Link href="/tax-returns/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create first tax return
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {taxReturns.slice(0, 5).map(tr => (
                <Link key={tr.id} href={`/tax-returns/${tr.id}`}>
                  <div className="flex items-center justify-between p-4 rounded-lg border hover:border-red-200 hover:bg-red-50/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center font-bold text-red-700 text-sm">
                        {tr.canton_code}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {CANTON_NAMES[tr.canton_code] || tr.canton_code} – {tr.municipality_name}
                        </p>
                        <p className="text-sm text-gray-500">Tax year {tr.tax_year}</p>
                      </div>
                    </div>
                    <Badge className={cn(...Object.values(getStatusColor(tr.status)))}>
                      {STATUS_LABELS[tr.status] || tr.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
