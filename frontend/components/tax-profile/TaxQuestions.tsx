'use client';

import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  HelpCircle,
  Loader2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Save,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { TaxProfile } from '@/types';

interface Props {
  profile: TaxProfile;
  taxReturnId: string;
  onUpdate?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  personal: 'Personal & Family',
  income: 'Employment & Income',
  deductions: 'Deductions & Pensions',
  wealth: 'Bank Accounts & Assets',
  property: 'Real Estate & Mortgages',
  other: 'General Clarifications',
};

export function TaxQuestions({ profile, taxReturnId, onUpdate }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [questions, setQuestions] = useState<any[]>(() => {
    return (profile.tax_questions || profile.questions || []) as any[];
  });
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const q of (profile.tax_questions || profile.questions || []) as any[]) {
      if (q.answer) initial[q.id] = q.answer;
    }
    return initial;
  });

  useEffect(() => {
    const qs = (profile.tax_questions || profile.questions || []) as any[];
    setQuestions(qs);
    const initial: Record<string, string> = {};
    for (const q of qs) {
      if (q.answer) initial[q.id] = q.answer;
    }
    setAnswers((prev) => ({ ...initial, ...prev }));
  }, [profile]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const freshQuestions = await api.taxProfile.getQuestions(taxReturnId);
      setQuestions(freshQuestions);
      const initial: Record<string, string> = {};
      for (const q of freshQuestions as any[]) {
        if (q.answer) initial[q.id] = q.answer;
      }
      setAnswers((prev) => ({ ...initial, ...prev }));
      toast({
        title: 'Questions updated',
        description: 'Dynamically regenerated clarification questions based on latest profile and documents.',
      });
    } catch {
      toast({
        title: 'Refresh failed',
        description: 'Unable to refresh questions.',
        variant: 'destructive',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const answeredCount = questions.filter((q) => Boolean(answers[q.id] || q.is_answered)).length;
  const totalCount = questions.length;
  const progressPct = totalCount > 0 ? (answeredCount / totalCount) * 100 : 100;

  const requiredQuestions = questions.filter((q) => q.is_required);
  const answeredRequired = requiredQuestions.filter((q) => Boolean(answers[q.id] || q.is_answered)).length;

  // Group questions by category
  const grouped = questions.reduce((acc: Record<string, any[]>, q: any) => {
    const cat = q.category || 'other';
    acc[cat] = acc[cat] || [];
    acc[cat].push(q);
    return acc;
  }, {});

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.taxProfile.submitAnswers(taxReturnId, answers);
      toast({
        title: 'Answers saved',
        description: 'Your responses have been processed and merged into your tax profile.',
      });
      onUpdate?.();
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.response?.data?.detail || 'Could not save answers.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSelectOption = (qid: string, opt: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qid]: opt,
    }));
  };

  if (questions.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="py-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto">
            <CheckCircle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">No Clarification Questions Needed</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
              All mandatory information has been extracted directly from your uploaded Swiss tax documents.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-xs mt-2"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Check for New Questions
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Banner & Progress */}
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-red-600" />
                <span>Smart Clarification Questions</span>
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Answer missing-data inquiries to ensure maximum allowable deductions and accurate calculations.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-xs h-8 text-gray-600 flex items-center gap-1.5"
            >
              {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Recheck Questions
            </Button>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-gray-700">
                {answeredCount} of {totalCount} questions answered ({Math.round(progressPct)}%)
              </span>
              <span className="text-xs text-gray-500">
                Required questions: <strong>{answeredRequired}/{requiredQuestions.length}</strong>
              </span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Grouped Questions */}
      {Object.entries(grouped).map(([category, qs]) => (
        <Card key={category} className="shadow-sm border-gray-200">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-red-600" />
              <span>{CATEGORY_LABELS[category] || category}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {qs.map((q: any) => {
              const currentVal = answers[q.id] || '';
              const isAnswered = Boolean(currentVal || q.is_answered);
              const isRequired = Boolean(q.is_required);

              return (
                <div
                  key={q.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isAnswered
                      ? 'border-green-200 bg-green-50/20'
                      : isRequired
                      ? 'border-amber-200 bg-amber-50/30'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-start gap-2 flex-1">
                      {isAnswered ? (
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      ) : (
                        <HelpCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-xs font-semibold text-gray-900 leading-snug">{q.question}</p>
                        {q.field_hint && (
                          <span className="text-[10px] text-gray-400 font-mono">
                            Maps to {q.field_hint}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      {isRequired ? (
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">
                          Required
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-500 text-[10px]">
                          Optional
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Multiple choice options chips if present */}
                  {Array.isArray(q.options) && q.options.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 my-2">
                      {q.options.map((opt: string) => {
                        const selected = currentVal === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handleSelectOption(q.id, opt)}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 ${
                              selected
                                ? 'bg-red-600 text-white border-red-600 font-medium'
                                : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-300'
                            }`}
                          >
                            {selected && <Check className="h-3 w-3" />}
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Input field for custom text or amounts */}
                  <div className="mt-2">
                    <input
                      type="text"
                      value={currentVal}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      placeholder={
                        Array.isArray(q.options) && q.options.length > 0
                          ? 'Select an option above or type specific details / CHF amount...'
                          : 'Enter your answer or amount...'
                      }
                      className={`w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-500 ${
                        isAnswered ? 'border-green-300 bg-white' : 'border-gray-300 bg-white'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs px-6 h-9 flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Answers & Update Profile
        </Button>
      </div>
    </div>
  );
}
