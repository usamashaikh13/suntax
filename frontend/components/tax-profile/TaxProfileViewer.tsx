'use client';

import React, { useState, useEffect } from 'react';
import {
  Edit2,
  Save,
  X,
  AlertTriangle,
  CheckCircle,
  FileCheck2,
  Trash2,
  Plus,
  Loader2,
  Building,
  Briefcase,
  Coins,
  Shield,
  Home,
  Users,
  Globe,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { TaxProfile } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface Props {
  profile: TaxProfile;
  taxReturnId: string;
  onUpdate?: () => void;
}

export function TaxProfileViewer({ profile, taxReturnId, onUpdate }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [applyingDocs, setApplyingDocs] = useState(false);
  const [localProfile, setLocalProfile] = useState<TaxProfile>(profile);

  useEffect(() => {
    setLocalProfile(profile);
  }, [profile]);

  const pData = (localProfile.personal_data || {}) as Record<string, any>;
  const incData = (localProfile.income_data || localProfile.income || {}) as Record<string, any>;
  const wData = (localProfile.wealth_data || localProfile.wealth || {}) as Record<string, any>;
  const dedData = (localProfile.deductions_data || localProfile.deductions || {}) as Record<string, any>;
  const liabData = (localProfile.liabilities_data || localProfile.liabilities || {}) as Record<string, any>;

  // Compute profile completeness score
  const completeness = localProfile.completeness_score ?? localProfile.completion_percentage ?? 75;

  const handleApplyAllDocuments = async () => {
    setApplyingDocs(true);
    try {
      const res = await api.taxReturns.applyAllDocuments(taxReturnId);
      toast({
        title: 'Documents Applied',
        description: res.message || 'Extracted document data has been merged into your tax profile.',
      });
      // Refresh profile data
      const updated = await api.taxProfile.get(taxReturnId);
      setLocalProfile(updated);
      onUpdate?.();
    } catch (err: any) {
      toast({
        title: 'Apply failed',
        description: err?.response?.data?.detail || 'Could not apply document data to profile.',
        variant: 'destructive',
      });
    } finally {
      setApplyingDocs(false);
    }
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      await api.taxProfile.update(taxReturnId, {
        ...localProfile,
        personal_data: pData,
        income_data: incData,
        wealth_data: wData,
        deductions_data: dedData,
        liabilities_data: liabData,
      });
      toast({
        title: 'Tax Profile Saved',
        description: 'Your tax return draft has been updated successfully.',
      });
      onUpdate?.();
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.response?.data?.detail || 'Could not save tax profile changes.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Helper to update specific subfield
  const updateSectionField = (
    section: 'personal_data' | 'income_data' | 'wealth_data' | 'deductions_data' | 'liabilities_data',
    key: string,
    value: any,
  ) => {
    setLocalProfile((prev) => {
      const currentSection = { ...((prev[section] as any) || {}) };
      currentSection[key] = value;
      return {
        ...prev,
        [section]: currentSection,
      };
    });
  };

  // Delete bank account
  const removeBankAccount = (index: number) => {
    const list = [...(wData.bank_accounts || [])];
    list.splice(index, 1);
    updateSectionField('wealth_data', 'bank_accounts', list);
  };

  // Delete securities position
  const removeSecurity = (index: number) => {
    const list = [...(wData.securities || localProfile.securities || [])];
    list.splice(index, 1);
    updateSectionField('wealth_data', 'securities', list);
  };

  // Delete mortgage
  const removeMortgage = (index: number) => {
    const list = [...(liabData.mortgages || [])];
    list.splice(index, 1);
    updateSectionField('liabilities_data', 'mortgages', list);
  };

  return (
    <div className="space-y-6">
      {/* Action Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border bg-gradient-to-r from-red-50/50 via-white to-gray-50 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-red-600" />
            <h3 className="font-bold text-gray-900 text-sm">Tax Profile & Merged Data</h3>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Review figures imported from your documents. You can modify any amount, add positions, or remove entries.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleApplyAllDocuments}
            disabled={applyingDocs || saving}
            className="text-xs font-semibold text-gray-700 hover:text-red-600 border-red-200 hover:bg-red-50 flex items-center gap-1.5"
          >
            {applyingDocs ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileCheck2 className="h-3.5 w-3.5 text-red-600" />
            )}
            Apply Approved Documents
          </Button>

          <Button
            size="sm"
            onClick={saveChanges}
            disabled={saving || applyingDocs}
            className="text-xs bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Profile
          </Button>
        </div>
      </div>

      {/* Profile Completeness Card */}
      <div className="p-4 rounded-xl border bg-white shadow-sm space-y-2">
        <div className="flex justify-between items-center text-xs font-semibold">
          <span className="text-gray-700">Tax Profile Completeness</span>
          <span className="text-red-600 font-bold">{Math.round(completeness)}%</span>
        </div>
        <Progress value={completeness} className="h-2" />
      </div>

      {/* Grid of Profile Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1. Personal Information */}
        <Card className="shadow-sm border-gray-200">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-red-600" />
              <span>Personal Information</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Taxpayer identity and civil status.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-3 space-y-2.5 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-gray-500 font-medium">First Name</label>
                <Input
                  value={pData.first_name || ''}
                  onChange={(e) => updateSectionField('personal_data', 'first_name', e.target.value)}
                  className="h-8 text-xs mt-1"
                  placeholder="e.g. Max"
                />
              </div>
              <div>
                <label className="text-gray-500 font-medium">Last Name</label>
                <Input
                  value={pData.last_name || ''}
                  onChange={(e) => updateSectionField('personal_data', 'last_name', e.target.value)}
                  className="h-8 text-xs mt-1"
                  placeholder="e.g. Muster"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-gray-500 font-medium">AHV / Social Security Number</label>
                <Input
                  value={pData.ahv_number || ''}
                  onChange={(e) => updateSectionField('personal_data', 'ahv_number', e.target.value)}
                  className="h-8 text-xs mt-1"
                  placeholder="756.xxxx.xxxx.xx"
                />
              </div>
              <div>
                <label className="text-gray-500 font-medium">Marital Status</label>
                <select
                  value={pData.marital_status || 'single'}
                  onChange={(e) => updateSectionField('personal_data', 'marital_status', e.target.value)}
                  className="w-full h-8 mt-1 text-xs rounded-md border border-gray-300 px-2 bg-white"
                >
                  <option value="single">Single (Ledig)</option>
                  <option value="married">Married (Verheiratet)</option>
                  <option value="divorced">Divorced (Geschieden)</option>
                  <option value="registered_partnership">Registered Partnership</option>
                  <option value="widowed">Widowed (Verwitwet)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-gray-500 font-medium">Residential Address</label>
              <Input
                value={pData.address || ''}
                onChange={(e) => updateSectionField('personal_data', 'address', e.target.value)}
                className="h-8 text-xs mt-1"
                placeholder="Street and house number"
              />
            </div>
          </CardContent>
        </Card>

        {/* 2. Employment & Income */}
        <Card className="shadow-sm border-gray-200">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-red-600" />
              <span>Employment & Income</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Annual gross salary, pensions, and investment yields.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-3 space-y-3 text-xs">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-gray-700 font-semibold">Total Gross Employment Income</label>
                {incData.source_document_name && (
                  <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                    Source: {incData.source_document_name}
                  </Badge>
                )}
              </div>
              <Input
                type="number"
                value={incData.employment_income || incData.gross_salary || incData.total_employment_income || ''}
                onChange={(e) => updateSectionField('income_data', 'employment_income', parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-semibold"
                placeholder="0.00 CHF"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-gray-500 font-medium">Net Salary (Lohnausweis Box 11)</label>
                <Input
                  type="number"
                  value={incData.net_salary || ''}
                  onChange={(e) => updateSectionField('income_data', 'net_salary', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1"
                  placeholder="0.00 CHF"
                />
              </div>
              <div>
                <label className="text-gray-500 font-medium">Secondary / Freelance Income</label>
                <Input
                  type="number"
                  value={incData.self_employment_income || 0}
                  onChange={(e) => updateSectionField('income_data', 'self_employment_income', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1"
                  placeholder="0.00 CHF"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-gray-500 font-medium">Gross Bank Interest</label>
                <Input
                  type="number"
                  value={incData.bank_interest || 0}
                  onChange={(e) => updateSectionField('income_data', 'bank_interest', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <label className="text-gray-500 font-medium">Gross Dividends</label>
                <Input
                  type="number"
                  value={incData.dividends || 0}
                  onChange={(e) => updateSectionField('income_data', 'dividends', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Wealth & Bank Accounts */}
        <Card className="shadow-sm border-gray-200">
          <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Coins className="h-4 w-4 text-red-600" />
                <span>Bank Accounts & Cash Assets</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Balances as of December 31st for Swiss wealth tax.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const list = [...(wData.bank_accounts || [])];
                list.push({ bank_name: 'New Bank Account', iban: '', balance: 0, currency: 'CHF' });
                updateSectionField('wealth_data', 'bank_accounts', list);
              }}
              className="text-xs h-7 text-gray-600 flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Add Account
            </Button>
          </CardHeader>
          <CardContent className="pt-3 space-y-2 text-xs">
            {(!wData.bank_accounts || wData.bank_accounts.length === 0) ? (
              <p className="text-xs text-gray-400 italic py-2">No bank accounts recorded yet.</p>
            ) : (
              (wData.bank_accounts as any[]).map((acc, idx) => (
                <div key={idx} className="p-2.5 rounded-lg border bg-gray-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-800">{acc.bank_name || `Account ${idx + 1}`}</span>
                      {acc.source_document_name && (
                        <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                          {acc.source_document_name}
                        </Badge>
                      )}
                    </div>
                    <button
                      onClick={() => removeBankAccount(idx)}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete account"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-gray-500">IBAN</label>
                      <Input
                        value={acc.iban || ''}
                        onChange={(e) => {
                          const list = [...wData.bank_accounts];
                          list[idx] = { ...list[idx], iban: e.target.value };
                          updateSectionField('wealth_data', 'bank_accounts', list);
                        }}
                        className="h-7 text-xs font-mono"
                        placeholder="CHxx..."
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-500">Dec 31st Balance (CHF)</label>
                      <Input
                        type="number"
                        value={acc.balance || 0}
                        onChange={(e) => {
                          const list = [...wData.bank_accounts];
                          list[idx] = { ...list[idx], balance: parseFloat(e.target.value) || 0 };
                          updateSectionField('wealth_data', 'bank_accounts', list);
                        }}
                        className="h-7 text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* 4. Liabilities & Mortgages */}
        <Card className="shadow-sm border-gray-200">
          <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Home className="h-4 w-4 text-red-600" />
                <span>Mortgages & Debts</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Outstanding debt balances and deductible debt interest.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const list = [...(liabData.mortgages || [])];
                list.push({ lender_name: 'New Mortgage Lender', mortgage_balance: 0, interest_paid: 0 });
                updateSectionField('liabilities_data', 'mortgages', list);
              }}
              className="text-xs h-7 text-gray-600 flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Add Mortgage
            </Button>
          </CardHeader>
          <CardContent className="pt-3 space-y-2 text-xs">
            {(!liabData.mortgages || liabData.mortgages.length === 0) ? (
              <p className="text-xs text-gray-400 italic py-2">No mortgage or debt entries recorded.</p>
            ) : (
              (liabData.mortgages as any[]).map((m, idx) => (
                <div key={idx} className="p-2.5 rounded-lg border bg-gray-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800">{m.lender_name || `Lender ${idx + 1}`}</span>
                    <button
                      onClick={() => removeMortgage(idx)}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete mortgage"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-gray-500">Mortgage Balance (Debt)</label>
                      <Input
                        type="number"
                        value={m.mortgage_balance || 0}
                        onChange={(e) => {
                          const list = [...liabData.mortgages];
                          list[idx] = { ...list[idx], mortgage_balance: parseFloat(e.target.value) || 0 };
                          updateSectionField('liabilities_data', 'mortgages', list);
                        }}
                        className="h-7 text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-500">Interest Paid (Deductible)</label>
                      <Input
                        type="number"
                        value={m.interest_paid || 0}
                        onChange={(e) => {
                          const list = [...liabData.mortgages];
                          list[idx] = { ...list[idx], interest_paid: parseFloat(e.target.value) || 0 };
                          updateSectionField('liabilities_data', 'mortgages', list);
                        }}
                        className="h-7 text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* 5. Deductions & Expenses */}
        <Card className="shadow-sm border-gray-200 lg:col-span-2">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Shield className="h-4 w-4 text-red-600" />
              <span>Deductions & Tax Offsets</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Statutory Swiss tax deductions for pensions, commuting, health insurance, childcare, and donations.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {/* Pillar 3a */}
            <div className="p-3 rounded-lg border bg-gray-50/50">
              <div className="flex justify-between items-center mb-1">
                <label className="font-semibold text-gray-800">Pillar 3a Pension (Max CHF 7,258)</label>
                {dedData.source_document_name && (
                  <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                    Doc
                  </Badge>
                )}
              </div>
              <Input
                type="number"
                value={dedData.pillar3a_contributions || 0}
                onChange={(e) => updateSectionField('deductions_data', 'pillar3a_contributions', parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-semibold"
              />
            </div>

            {/* Commuting */}
            <div className="p-3 rounded-lg border bg-gray-50/50">
              <label className="font-semibold text-gray-800 block mb-1">Commuting & Travel to Work</label>
              <Input
                type="number"
                value={dedData.travel_expenses || dedData.commute_costs || 0}
                onChange={(e) => updateSectionField('deductions_data', 'travel_expenses', parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-semibold"
              />
            </div>

            {/* Health Insurance */}
            <div className="p-3 rounded-lg border bg-gray-50/50">
              <label className="font-semibold text-gray-800 block mb-1">Health Insurance Premiums</label>
              <Input
                type="number"
                value={dedData.health_insurance_premiums || 0}
                onChange={(e) => updateSectionField('deductions_data', 'health_insurance_premiums', parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-semibold"
              />
            </div>

            {/* Childcare */}
            <div className="p-3 rounded-lg border bg-gray-50/50">
              <label className="font-semibold text-gray-800 block mb-1">Childcare & Daycare (KITA)</label>
              <Input
                type="number"
                value={dedData.childcare_costs || 0}
                onChange={(e) => updateSectionField('deductions_data', 'childcare_costs', parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-semibold"
              />
            </div>

            {/* Charitable Donations */}
            <div className="p-3 rounded-lg border bg-gray-50/50">
              <label className="font-semibold text-gray-800 block mb-1">Charitable Donations (Spenden)</label>
              <Input
                type="number"
                value={dedData.donations || 0}
                onChange={(e) => updateSectionField('deductions_data', 'donations', parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-semibold"
              />
            </div>

            {/* Continuing Education */}
            <div className="p-3 rounded-lg border bg-gray-50/50">
              <label className="font-semibold text-gray-800 block mb-1">Continuing Education (Max CHF 12,900)</label>
              <Input
                type="number"
                value={dedData.education_expenses || 0}
                onChange={(e) => updateSectionField('deductions_data', 'education_expenses', parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-semibold"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={saveChanges}
          disabled={saving || applyingDocs}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs px-6 h-9"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
          Save All Tax Profile Changes
        </Button>
      </div>
    </div>
  );
}
