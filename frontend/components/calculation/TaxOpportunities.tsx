'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Info,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { TaxOpportunity } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface Props {
  taxReturnId: string;
  onNavigateTab?: (tab: string) => void;
}

export function TaxOpportunities({ taxReturnId, onNavigateTab }: Props) {
  const [opportunities, setOpportunities] = useState<TaxOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    api.taxReturns
      .getOpportunities(taxReturnId)
      .then((data) => {
        if (isMounted) setOpportunities(data);
      })
      .catch((err) => {
        console.error('Failed to load tax opportunities:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [taxReturnId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3">
        <Loader2 className="h-6 w-6 animate-spin text-red-600" />
        <p className="text-xs text-gray-500">Evaluating applicable Swiss tax deductions & caps...</p>
      </div>
    );
  }

  const totalPotentialSavings = opportunities.reduce(
    (sum, op) => sum + (op.status !== 'applied' ? op.estimated_tax_saving_chf || 0 : 0),
    0,
  );

  const appliedCount = opportunities.filter((o) => o.status === 'applied').length;

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="p-4 rounded-xl border bg-gradient-to-r from-red-50/70 via-white to-orange-50/40 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-red-600" />
            <h3 className="font-bold text-gray-900 text-sm">Tax Opportunities & Optimization</h3>
            <Badge variant="outline" className="text-[10px] bg-white border-red-200 text-red-700">
              Rule-Based
            </Badge>
          </div>
          <p className="text-xs text-gray-500 mt-1 max-w-xl">
            Deterministic evaluation of federal and cantonal statutory allowances based on your profile and uploaded documents.
          </p>
        </div>

        <div className="text-left sm:text-right bg-white p-3 rounded-lg border border-red-100 shadow-xs flex-shrink-0">
          <p className="text-[11px] text-gray-500 uppercase font-semibold">Estimated Additional Savings</p>
          <p className="text-lg font-bold text-red-600">~{formatCurrency(totalPotentialSavings)}</p>
          <p className="text-[10px] text-gray-400">Estimate based on marginal tax rate</p>
        </div>
      </div>

      {/* Statutory Legal Disclaimer Notice */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900 flex items-start gap-2.5">
        <Info className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div>
          <strong>Important Notice:</strong> All tax reduction figures are rule-based estimates provided for guidance. Final tax assessments depend on official municipal and cantonal tax authority rulings.
        </div>
      </div>

      {/* Opportunities Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {opportunities.map((op) => {
          const isApplied = op.status === 'applied';
          const isIncomplete = op.status === 'incomplete';
          const isAvailable = op.status === 'available';

          return (
            <Card
              key={op.id}
              className={`border transition-all shadow-sm ${
                isApplied
                  ? 'border-green-200 bg-green-50/20'
                  : isIncomplete
                  ? 'border-amber-200 bg-amber-50/20'
                  : 'border-blue-200 bg-blue-50/20'
              }`}
            >
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      {isApplied && <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />}
                      {isIncomplete && <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" />}
                      {isAvailable && <AlertCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                      <span>{op.title}</span>
                    </CardTitle>
                    {op.legal_reference && (
                      <span className="text-[10px] text-gray-400 font-mono mt-0.5 block">
                        {op.legal_reference}
                      </span>
                    )}
                  </div>

                  <div>
                    {isApplied && (
                      <Badge className="bg-green-100 text-green-800 border border-green-200 text-[10px]">
                        Applied
                      </Badge>
                    )}
                    {isIncomplete && (
                      <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px]">
                        Incomplete
                      </Badge>
                    )}
                    {isAvailable && (
                      <Badge className="bg-blue-100 text-blue-800 border border-blue-200 text-[10px]">
                        Available
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="px-4 pb-3 space-y-2.5 text-xs">
                <p className="text-gray-600 text-[11px] leading-relaxed">{op.description}</p>

                {/* Amounts Breakdown */}
                <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-white border border-gray-100 text-[11px]">
                  <div>
                    <span className="text-gray-400 block">Claimed in Draft:</span>
                    <strong className="text-gray-800">{formatCurrency(op.current_amount_chf)}</strong>
                  </div>
                  <div>
                    <span className="text-gray-400 block">Statutory Max / Cap:</span>
                    <strong className="text-gray-800">
                      {op.max_allowed_chf ? formatCurrency(op.max_allowed_chf) : 'Actual / Unlimited'}
                    </strong>
                  </div>
                </div>

                {/* Missing Action Box */}
                {op.missing_action && (
                  <div className="text-[11px] text-gray-600 bg-white/60 p-2 rounded border border-gray-200/80">
                    <strong className="text-gray-800">Recommended Action: </strong>
                    {op.missing_action}
                  </div>
                )}

                {/* Tax Effect Footer */}
                <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-[11px]">
                  <span className="text-gray-500">
                    Est. Tax Effect: <strong className="text-gray-900">~{formatCurrency(op.estimated_tax_saving_chf)}</strong>
                  </span>

                  {op.status !== 'applied' && onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => onNavigateTab(op.area === 'pillar3a' || op.area === 'commuting' ? 'documents' : 'profile')}
                      className="text-red-600 hover:text-red-700 font-semibold flex items-center gap-1 text-[11px]"
                    >
                      Resolve <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
