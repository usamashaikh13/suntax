'use client';

import React, { useState, useEffect } from 'react';
import {
  Save,
  Plus,
  Trash2,
  Loader2,
  Coins,
  Shield,
  Briefcase,
  Home,
  Users,
  User,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  TrendingDown,
  Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { TaxProfile } from '@/types';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import { formatApiError } from '@/lib/utils';

interface Props {
  profile: TaxProfile;
  taxReturnId: string;
  cantonCode?: string;
  taxYear?: number;
  calculation?: any;
  onUpdate?: () => void;
  onNavigateTab?: (tab: string) => void;
}

function DeductionSavingsHint({ amount, isGerman }: { amount?: number; isGerman: boolean }) {
  if (!amount || amount <= 0) return null;
  return (
    <span className="ml-1.5 inline-block text-[10px] font-bold text-[#1E7B52] bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
      {isGerman ? `Spart ca. CHF ${Math.round(amount).toLocaleString('de-CH')}` : `Saves approx. CHF ${Math.round(amount).toLocaleString('de-CH')}`}
    </span>
  );
}

export function TaxProfileViewer({
  profile,
  taxReturnId,
  cantonCode = 'ZH',
  taxYear = 2025,
  calculation,
  onUpdate,
  onNavigateTab,
}: Props) {
  const { toast } = useToast();
  const { isGerman } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [localProfile, setLocalProfile] = useState<TaxProfile>(profile);
  const savingsByDed = (
    calculation?.savings_analysis?.by_deduction ||
    calculation?.results?.savings_analysis?.by_deduction ||
    {}
  ) as Record<string, number>;

  useEffect(() => {
    setLocalProfile(profile);
  }, [profile]);

  const pData = (localProfile.personal_data || {}) as Record<string, any>;
  const incData = (localProfile.income_data || localProfile.income || {}) as Record<string, any>;
  const wData = (localProfile.wealth_data || localProfile.wealth || {}) as Record<string, any>;
  const dedData = (localProfile.deductions_data || localProfile.deductions || {}) as Record<string, any>;
  const liabData = (localProfile.liabilities_data || localProfile.liabilities || {}) as Record<string, any>;

  // Securities list
  const securitiesList: Array<any> = Array.isArray(wData.securities)
    ? wData.securities
    : Array.isArray(localProfile.securities)
    ? localProfile.securities
    : [];

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

  const updateSecurity = (index: number, key: string, value: any) => {
    const list = [...securitiesList];
    list[index] = { ...list[index], [key]: value };
    // Maintain both standard and short keys
    if (key === 'tax_value') list[index].val = value;
    if (key === 'val') list[index].tax_value = value;
    if (key === 'gross_revenue_with_tax') list[index].mit = value;
    if (key === 'mit') list[index].gross_revenue_with_tax = value;
    if (key === 'gross_revenue_without_tax') list[index].ohne = value;
    if (key === 'ohne') list[index].gross_revenue_without_tax = value;

    updateSectionField('wealth_data', 'securities', list);
  };

  const addSecurity = () => {
    const list = [...securitiesList];
    list.push({
      name: '',
      tax_value: 0,
      val: 0,
      gross_revenue_with_tax: 0,
      mit: 0,
      gross_revenue_without_tax: 0,
      ohne: 0,
    });
    updateSectionField('wealth_data', 'securities', list);
  };

  const removeSecurity = (index: number) => {
    const list = [...securitiesList];
    list.splice(index, 1);
    updateSectionField('wealth_data', 'securities', list);
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      await api.taxProfile.update(taxReturnId, {
        ...localProfile,
        personal_data: pData,
        income_data: incData,
        wealth_data: {
          ...wData,
          securities: securitiesList,
        },
        deductions_data: dedData,
        liabilities_data: liabData,
      });

      // Recalculate tax
      try {
        await api.taxEngine.calculate(taxReturnId);
      } catch {}

      toast({
        title: isGerman ? 'Angaben gespeichert' : 'Details saved',
        description: isGerman
          ? 'Deine Ergänzungen wurden übernommen und die Steuerberechnung aktualisiert.'
          : 'Your additions were applied and the tax calculation updated.',
      });
      onUpdate?.();
    } catch (err: any) {
      toast({
        title: isGerman ? 'Speichern fehlgeschlagen' : 'Save failed',
        description: formatApiError(err, isGerman ? 'Bitte überprüfe deine Eingaben.' : 'Please verify your entries.'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Compute securities totals
  const totalSecValue = securitiesList.reduce(
    (acc, s) => acc + (Number(s.tax_value ?? s.val) || 0),
    0
  );
  const totalSecMit = securitiesList.reduce(
    (acc, s) => acc + (Number(s.gross_revenue_with_tax ?? s.mit) || 0),
    0
  );
  const totalSecOhne = securitiesList.reduce(
    (acc, s) => acc + (Number(s.gross_revenue_without_tax ?? s.ohne) || 0),
    0
  );
  // Verrechnungssteuer refund (35% on dividend/interest subject to Swiss withholding tax)
  const vstRefund = Math.round(totalSecMit * 0.35 * 100) / 100;

  return (
    <div className="space-y-6">
      {/* ── Intro Header (Schritt 4) ── */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#ECE8DF] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-extrabold tracking-wider bg-emerald-50 text-[#1E7B52] px-2.5 py-0.5 rounded-full border border-emerald-200">
              {isGerman ? 'Schritt 4 von 6' : 'Step 4 of 6'}
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {isGerman ? 'Haben wir etwas vergessen?' : 'Did we miss anything?'}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            {isGerman
              ? 'Abgehakt ist, was wir in deinen Dokumenten gefunden haben. Ergänze oder passe Werte an, die sonst noch zutreffen.'
              : 'Checked items were extracted from your documents. Add or adjust any additional income, deductions, or accounts.'}
          </p>
        </div>

        <Button
          onClick={saveChanges}
          disabled={saving}
          className="bg-[#1E7B52] hover:bg-[#165C3D] text-white font-bold text-xs h-9 px-4 rounded-xl shadow-xs flex items-center gap-1.5 flex-shrink-0"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {isGerman ? 'Änderungen speichern' : 'Save changes'}
        </Button>
      </div>

      {/* ── 0. Stammdaten & Steueridentifikation ── */}
      <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <User className="h-4 w-4 text-[#1E7B52]" />
            <span>{isGerman ? 'Persönliche Stammdaten & Steueridentifikation' : 'Personal Identification & Taxpayer Details'}</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            {isGerman
              ? 'AHV-Nummer und Geburtsdatum werden für die offizielle kantonale Steuererklärung (eCH-0119) und den PDF-Auszug benötigt.'
              : 'OASI / AHV number and date of birth are required for the official cantonal tax declaration (eCH-0119) and summary.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 font-semibold block mb-1">
                {isGerman ? 'AHV-Nummer (756.xxxx.xxxx.xx)' : 'AHV / OASI Number (756.xxxx.xxxx.xx)'}
              </label>
              <Input
                type="text"
                value={pData.ahv_number || pData.vn || ''}
                onChange={(e) => updateSectionField('personal_data', 'ahv_number', e.target.value)}
                className="h-8 text-xs font-mono font-medium rounded-lg"
                placeholder="756.0000.0000.00"
              />
            </div>
            <div>
              <label className="text-slate-700 font-semibold block mb-1">
                {isGerman ? 'Geburtsdatum (JJJJ-MM-TT)' : 'Date of Birth (YYYY-MM-DD)'}
              </label>
              <Input
                type="date"
                value={pData.date_of_birth || pData.birth_date || ''}
                onChange={(e) => updateSectionField('personal_data', 'date_of_birth', e.target.value)}
                className="h-8 text-xs font-mono font-medium rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {isGerman ? 'Strasse & Hausnummer' : 'Street & House Number'}
              </label>
              <Input
                type="text"
                value={pData.address_street || pData.street || ''}
                onChange={(e) => updateSectionField('personal_data', 'address_street', e.target.value)}
                className="h-8 text-xs rounded-lg"
                placeholder={isGerman ? 'z. B. Bahnhofstrasse 10' : 'e.g. Bahnhofstrasse 10'}
              />
            </div>
            <div>
              <label className="text-slate-600 font-medium block mb-1">
                {isGerman ? 'Wohnort & Gemeinde' : 'Town / Municipality'}
              </label>
              <Input
                type="text"
                value={pData.address_city || pData.city || ''}
                onChange={(e) => updateSectionField('personal_data', 'address_city', e.target.value)}
                className="h-8 text-xs rounded-lg"
                placeholder={isGerman ? 'z. B. Winterthur' : 'e.g. Winterthur'}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── 1. Weitere Einkünfte ── */}
        <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
          <CardHeader className="bg-slate-50/70 border-b pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-[#1E7B52]" />
              <span>{isGerman ? 'Weitere Einkünfte' : 'Additional Income'}</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {isGerman
                ? 'Nebenerwerb, Renten, Taggelder oder Unterhalt.'
                : 'Secondary employment, pensions, daily allowances, or alimony.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-xs">
            <div>
              <label className="text-slate-700 font-semibold block mb-1">
                {isGerman ? 'Haupterwerb Nettolohn (Lohnausweis Ziffer 11)' : 'Primary Employment Net Salary (Box 11)'}
              </label>
              <Input
                type="number"
                value={incData.net_salary || incData.employment_income || ''}
                onChange={(e) => updateSectionField('income_data', 'net_salary', parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-semibold rounded-lg"
                placeholder="CHF 0.00"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-600 font-medium">
                  {isGerman ? 'Nebenerwerb (CHF)' : 'Secondary Income (CHF)'}
                </label>
                <Input
                  type="number"
                  value={incData.self_employment_income || incData.side_job_income || ''}
                  onChange={(e) => updateSectionField('income_data', 'side_job_income', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1 rounded-lg"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-slate-600 font-medium">
                  {isGerman ? 'AHV- / IV-Rente (CHF)' : 'OASI / DI Pension (CHF)'}
                </label>
                <Input
                  type="number"
                  value={incData.ahv_pension || ''}
                  onChange={(e) => updateSectionField('income_data', 'ahv_pension', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1 rounded-lg"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-600 font-medium">
                  {isGerman ? 'Pensionskassenrente (CHF)' : 'Occupational Pension (CHF)'}
                </label>
                <Input
                  type="number"
                  value={incData.pk_pension || ''}
                  onChange={(e) => updateSectionField('income_data', 'pk_pension', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1 rounded-lg"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-slate-600 font-medium">
                  {isGerman ? 'ALV- / Krankentaggeld (CHF)' : 'Daily Allowances (CHF)'}
                </label>
                <Input
                  type="number"
                  value={incData.daily_allowances || ''}
                  onChange={(e) => updateSectionField('income_data', 'daily_allowances', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1 rounded-lg"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-600 font-medium">
                {isGerman ? 'Erhaltene Kinderalimente / Unterhalt (CHF)' : 'Alimony Received for Children (CHF)'}
              </label>
              <Input
                type="number"
                value={incData.alimony_received || ''}
                onChange={(e) => updateSectionField('income_data', 'alimony_received', parseFloat(e.target.value) || 0)}
                className="h-8 text-xs mt-1 rounded-lg"
                placeholder="0.00"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── 2. Beruf & Abzüge ── */}
        <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
          <CardHeader className="bg-slate-50/70 border-b pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#1E7B52]" />
              <span>{isGerman ? 'Beruf & weitere Abzüge' : 'Work & Deductions'}</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {isGerman
                ? 'Vorsorge Säule 3a, Weiterbildung, Versicherungen und Spenden.'
                : 'Pillar 3a, training, insurance, and donations.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-700 font-semibold block mb-1">
                  {isGerman ? 'Säule 3a (max. CHF 7’258)' : 'Pillar 3a (max. CHF 7,258)'}
                  <DeductionSavingsHint amount={savingsByDed.pillar3a} isGerman={isGerman} />
                </label>
                <Input
                  type="number"
                  value={dedData.pillar3a_contributions || ''}
                  onChange={(e) => updateSectionField('deductions_data', 'pillar3a_contributions', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs font-semibold rounded-lg"
                  placeholder="0.00"
                />
              </div>
              {taxYear >= 2026 ? (
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">
                    {isGerman ? 'Säule 3a Einkauf (2026)' : 'Pillar 3a Catch-up (2026)'}
                    <DeductionSavingsHint amount={savingsByDed.pillar3a_catchup} isGerman={isGerman} />
                  </label>
                  <Input
                    type="number"
                    value={dedData.pillar3a_catchup || ''}
                    onChange={(e) => updateSectionField('deductions_data', 'pillar3a_catchup', parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs font-semibold rounded-lg"
                    placeholder="0.00"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-slate-700 font-semibold block mb-1">
                    {isGerman ? 'Einkauf Pensionskasse (2. Säule)' : 'Pension Fund Buy-in (2nd Pillar)'}
                  </label>
                  <Input
                    type="number"
                    value={dedData.pension_buyin || ''}
                    onChange={(e) => updateSectionField('deductions_data', 'pension_buyin', parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs font-semibold rounded-lg"
                    placeholder="0.00"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-600 font-medium">
                  {isGerman ? 'Krankenkassenprämien (CHF)' : 'Health Insurance Premiums (CHF)'}
                  <DeductionSavingsHint amount={savingsByDed.health_insurance} isGerman={isGerman} />
                </label>
                <Input
                  type="number"
                  value={dedData.health_insurance_premiums || ''}
                  onChange={(e) => updateSectionField('deductions_data', 'health_insurance_premiums', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1 rounded-lg"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-slate-600 font-medium">
                  {isGerman ? 'Weiterbildungskosten (CHF)' : 'Continuing Education (CHF)'}
                  <DeductionSavingsHint amount={savingsByDed.education} isGerman={isGerman} />
                </label>
                <Input
                  type="number"
                  value={dedData.education_expenses || ''}
                  onChange={(e) => updateSectionField('deductions_data', 'education_expenses', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1 rounded-lg"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-600 font-medium">
                  {isGerman ? 'Kinderbetreuung durch Dritte (CHF)' : 'Childcare Costs (CHF)'}
                  <DeductionSavingsHint amount={savingsByDed.childcare} isGerman={isGerman} />
                </label>
                <Input
                  type="number"
                  value={dedData.childcare_costs || ''}
                  onChange={(e) => updateSectionField('deductions_data', 'childcare_costs', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1 rounded-lg"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-slate-600 font-medium">
                  {isGerman ? 'Gemeinnützige Spenden (CHF)' : 'Charitable Donations (CHF)'}
                  <DeductionSavingsHint amount={savingsByDed.donations} isGerman={isGerman} />
                </label>
                <Input
                  type="number"
                  value={dedData.donations || ''}
                  onChange={(e) => updateSectionField('deductions_data', 'donations', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1 rounded-lg"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-600 font-medium">
                  {isGerman ? 'Schuldzinsen (Privatkredit, ohne Leasing)' : 'Debt Interest Paid (Loans, excluding leasing)'}
                  <DeductionSavingsHint amount={savingsByDed.interest_expenses} isGerman={isGerman} />
                </label>
                <Input
                  type="number"
                  value={dedData.debt_interest || liabData.debt_interest || ''}
                  onChange={(e) => updateSectionField('deductions_data', 'debt_interest', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1 rounded-lg"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-slate-600 font-medium">
                  {isGerman ? 'Krankheits- & Unfallkosten (CHF)' : 'Medical & Dental Expenses (CHF)'}
                  <DeductionSavingsHint amount={savingsByDed.medical_expenses} isGerman={isGerman} />
                </label>
                <Input
                  type="number"
                  value={dedData.medical_expenses || ''}
                  onChange={(e) => updateSectionField('deductions_data', 'medical_expenses', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1 rounded-lg"
                  placeholder="0.00"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Wertschriften- und Guthabenverzeichnis mit Verrechnungsantrag ── */}
      <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <Coins className="h-4 w-4 text-[#1E7B52]" />
              <span>
                {isGerman
                  ? 'Wertschriften- und Guthabenverzeichnis (eCH-0196)'
                  : 'Securities and Bank Accounts Register (eCH-0196)'}
              </span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              {isGerman
                ? 'Bankkonten, Aktien und Fonds per 31.12. inkl. Verrechnungssteuer-Rückerstattung.'
                : 'Bank accounts, stocks, and funds as of Dec 31st with withholding tax reclaim.'}
            </CardDescription>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSecurity}
            className="text-xs font-semibold text-slate-700 hover:text-[#1E7B52] flex items-center gap-1.5 h-8 rounded-xl"
          >
            <Plus className="h-3.5 w-3.5 text-[#1E7B52]" />
            {isGerman ? 'Position hinzufügen' : 'Add line item'}
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-100/70 text-slate-600 font-bold">
                  <th className="text-left py-2.5 px-4 min-w-[200px]">
                    {isGerman ? 'Bezeichnung / Bank / IBAN' : 'Description / Bank / IBAN'}
                  </th>
                  <th className="text-right py-2.5 px-3 min-w-[130px]">
                    {isGerman ? 'Steuerwert 31.12. (CHF)' : 'Taxable Value 31.12. (CHF)'}
                  </th>
                  <th className="text-right py-2.5 px-3 min-w-[130px]">
                    {isGerman ? 'Ertrag mit VSt (CHF)' : 'Yield with WHT (CHF)'}
                  </th>
                  <th className="text-right py-2.5 px-3 min-w-[130px]">
                    {isGerman ? 'Ertrag ohne VSt (CHF)' : 'Yield without WHT (CHF)'}
                  </th>
                  <th className="text-center py-2.5 px-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {securitiesList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                      {isGerman
                        ? 'Noch keine Konten oder Wertschriften erfasst. Klicke auf «Position hinzufügen», um Bankkonten oder Aktien manuell einzutragen.'
                        : 'No accounts or securities registered yet. Click "Add line item" to add bank accounts or shares manually.'}
                    </td>
                  </tr>
                ) : (
                  securitiesList.map((pos, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2 px-4">
                        <Input
                          value={pos.name || ''}
                          onChange={(e) => updateSecurity(idx, 'name', e.target.value)}
                          placeholder={isGerman ? 'z. B. Sparkonto UBS oder Nestlé N' : 'e.g. UBS Savings or Nestlé Shares'}
                          className="h-7 text-xs font-medium rounded-lg"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          value={pos.tax_value ?? pos.val ?? ''}
                          onChange={(e) => updateSecurity(idx, 'tax_value', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="h-7 text-xs text-right font-mono rounded-lg"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          value={pos.gross_revenue_with_tax ?? pos.mit ?? ''}
                          onChange={(e) => updateSecurity(idx, 'gross_revenue_with_tax', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="h-7 text-xs text-right font-mono rounded-lg"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          value={pos.gross_revenue_without_tax ?? pos.ohne ?? ''}
                          onChange={(e) => updateSecurity(idx, 'gross_revenue_without_tax', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="h-7 text-xs text-right font-mono rounded-lg"
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeSecurity(idx)}
                          className="text-slate-400 hover:text-red-600 transition-colors p-1 cursor-pointer"
                          title={isGerman ? 'Position löschen' : 'Delete line item'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
