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

interface Props {
  profile: TaxProfile;
  taxReturnId: string;
  cantonCode?: string;
  onUpdate?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export function TaxProfileViewer({ profile, taxReturnId, cantonCode = 'ZH', onUpdate, onNavigateTab }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [localProfile, setLocalProfile] = useState<TaxProfile>(profile);

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
        title: 'Angaben gespeichert',
        description: 'Deine Ergänzungen wurden übernommen und die Steuerberechnung aktualisiert.',
      });
      onUpdate?.();
    } catch (err: any) {
      toast({
        title: 'Speichern fehlgeschlagen',
        description: err?.response?.data?.detail || 'Bitte überprüfe deine Eingaben.',
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
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-extrabold tracking-wider bg-primary/10 text-primary px-2.5 py-0.5 rounded-full">
              Schritt 4 von 6
            </span>
            <h2 className="text-lg font-bold text-slate-900">Haben wir etwas vergessen?</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Abgehakt ist, was wir in deinen Dokumenten gefunden haben. Ergänze oder passe Werte an, die sonst noch zutreffen.
          </p>
        </div>

        <Button
          onClick={saveChanges}
          disabled={saving}
          className="bg-primary hover:bg-primary-700 text-white font-bold text-xs h-9 px-4 shadow-sm flex items-center gap-1.5 flex-shrink-0"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Änderungen speichern
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── 1. Weitere Einkünfte ── */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/70 border-b pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" />
              <span>Weitere Einkünfte</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Nebenerwerb, Renten, Taggelder oder Liegenschaftenertrag.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-xs">
            <div>
              <label className="text-slate-700 font-semibold block mb-1">
                Haupterwerb Nettolohn (Lohnausweis Ziffer 11)
              </label>
              <Input
                type="number"
                value={incData.net_salary || incData.employment_income || ''}
                onChange={(e) => updateSectionField('income_data', 'net_salary', parseFloat(e.target.value) || 0)}
                className="h-8 text-xs font-semibold"
                placeholder="CHF 0.00"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-600 font-medium">Nebenerwerb (CHF)</label>
                <Input
                  type="number"
                  value={incData.self_employment_income || incData.side_job_income || ''}
                  onChange={(e) => updateSectionField('income_data', 'side_job_income', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-slate-600 font-medium">AHV- / IV-Rente (CHF)</label>
                <Input
                  type="number"
                  value={incData.ahv_pension || ''}
                  onChange={(e) => updateSectionField('income_data', 'ahv_pension', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-600 font-medium">Pensionskassenrente (CHF)</label>
                <Input
                  type="number"
                  value={incData.pk_pension || ''}
                  onChange={(e) => updateSectionField('income_data', 'pk_pension', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-slate-600 font-medium">ALV- / Krankentaggeld (CHF)</label>
                <Input
                  type="number"
                  value={incData.daily_allowances || ''}
                  onChange={(e) => updateSectionField('income_data', 'daily_allowances', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-600 font-medium">Erhaltene Kinderalimente / Unterhalt (CHF)</label>
              <Input
                type="number"
                value={incData.alimony_received || ''}
                onChange={(e) => updateSectionField('income_data', 'alimony_received', parseFloat(e.target.value) || 0)}
                className="h-8 text-xs mt-1"
                placeholder="0.00"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── 2. Beruf & Abzüge ── */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="bg-slate-50/70 border-b pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span>Beruf & weitere Abzüge</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Vorsorge Säule 3a, Weiterbildung, Versicherungen und Spenden.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-700 font-semibold block mb-1">
                  Säule 3a (max. CHF 7’258)
                </label>
                <Input
                  type="number"
                  value={dedData.pillar3a_contributions || ''}
                  onChange={(e) => updateSectionField('deductions_data', 'pillar3a_contributions', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs font-semibold"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-slate-700 font-semibold block mb-1">
                  Einkauf Pensionskasse (2. Säule)
                </label>
                <Input
                  type="number"
                  value={dedData.pension_buyin || ''}
                  onChange={(e) => updateSectionField('deductions_data', 'pension_buyin', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs font-semibold"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-600 font-medium">Krankenkassenprämien (CHF)</label>
                <Input
                  type="number"
                  value={dedData.health_insurance_premiums || ''}
                  onChange={(e) => updateSectionField('deductions_data', 'health_insurance_premiums', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-slate-600 font-medium">Weiterbildungskosten (CHF)</label>
                <Input
                  type="number"
                  value={dedData.education_expenses || ''}
                  onChange={(e) => updateSectionField('deductions_data', 'education_expenses', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-600 font-medium">Kinderbetreuung durch Dritte (CHF)</label>
                <Input
                  type="number"
                  value={dedData.childcare_costs || ''}
                  onChange={(e) => updateSectionField('deductions_data', 'childcare_costs', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-slate-600 font-medium">Gemeinnützige Spenden (CHF)</label>
                <Input
                  type="number"
                  value={dedData.donations || ''}
                  onChange={(e) => updateSectionField('deductions_data', 'donations', parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs mt-1"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-600 font-medium">Schuldzinsen (Privatkredit, ohne Leasing)</label>
              <Input
                type="number"
                value={dedData.debt_interest || liabData.debt_interest || ''}
                onChange={(e) => updateSectionField('deductions_data', 'debt_interest', parseFloat(e.target.value) || 0)}
                className="h-8 text-xs mt-1"
                placeholder="0.00"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Wertschriften- und Guthabenverzeichnis mit Verrechnungsantrag (Redesign) ── */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <Coins className="h-4 w-4 text-primary" />
              <span>Wertschriften- und Guthabenverzeichnis (eCH-0196)</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Bankkonten, Aktien und Fonds per 31.12. inkl. Verrechnungssteuer-Rückerstattung.
            </CardDescription>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSecurity}
            className="text-xs font-semibold text-slate-700 hover:text-primary flex items-center gap-1.5 h-8"
          >
            <Plus className="h-3.5 w-3.5 text-primary" />
            Position hinzufügen
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-100/70 text-slate-600 font-bold">
                  <th className="text-left py-2.5 px-4 min-w-[200px]">Bezeichnung / Bank / IBAN</th>
                  <th className="text-right py-2.5 px-3 min-w-[130px]">Steuerwert 31.12. (CHF)</th>
                  <th className="text-right py-2.5 px-3 min-w-[130px]">Ertrag mit VSt (CHF)</th>
                  <th className="text-right py-2.5 px-3 min-w-[130px]">Ertrag ohne VSt (CHF)</th>
                  <th className="text-center py-2.5 px-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {securitiesList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                      Noch keine Konten oder Wertschriften erfasst. Klicke auf «Position hinzufügen», um Bankkonten oder Aktien manuell einzutragen.
                    </td>
                  </tr>
                ) : (
                  securitiesList.map((pos, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2 px-4">
                        <Input
                          value={pos.name || ''}
                          onChange={(e) => updateSecurity(idx, 'name', e.target.value)}
                          placeholder="z. B. Sparkonto UBS oder Nestlé N"
                          className="h-7 text-xs font-medium"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          value={pos.tax_value ?? pos.val ?? ''}
                          onChange={(e) => updateSecurity(idx, 'tax_value', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="h-7 text-xs text-right font-mono"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          value={pos.gross_revenue_with_tax ?? pos.mit ?? ''}
                          onChange={(e) => updateSecurity(idx, 'gross_revenue_with_tax', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="h-7 text-xs text-right font-mono"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          value={pos.gross_revenue_without_tax ?? pos.ohne ?? ''}
                          onChange={(e) => updateSecurity(idx, 'gross_revenue_without_tax', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="h-7 text-xs text-right font-mono"
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeSecurity(idx)}
                          className="text-slate-400 hover:text-red-600 transition-colors p-1"
                          title="Position löschen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}

                {/* Totals row */}
                {securitiesList.length > 0 && (
                  <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                    <td className="py-2.5 px-4">Total Wertschriften & Bankguthaben</td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      CHF {totalSecValue.toLocaleString('de-CH')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      CHF {totalSecMit.toLocaleString('de-CH')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      CHF {totalSecOhne.toLocaleString('de-CH')}
                    </td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Withholding tax refund notice */}
          {vstRefund > 0 && (
            <div className="m-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-950 flex items-start gap-2.5">
              <TrendingDown className="h-4 w-4 text-emerald-700 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <strong>Verrechnungssteuer-Rückforderung:</strong> Du bekommst{' '}
                <strong className="text-emerald-800 font-mono font-black">
                  CHF {vstRefund.toLocaleString('de-CH')}
                </strong>{' '}
                (35% auf CHF {totalSecMit.toLocaleString('de-CH')}) vom Bund an deine Steuern gutgeschrieben.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 4. Besondere Ereignisse ── */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Home className="h-4 w-4 text-primary" />
            <span>Besondere Ereignisse & Vermögenswerte</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Kapitalbezüge, Erbschaften, Schenkungen oder Liegenschaften.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-slate-600 font-medium block mb-1">
              Bargeld, Gold, Krypto per 31.12. (CHF)
            </label>
            <Input
              type="number"
              value={wData.cash_and_crypto || ''}
              onChange={(e) => updateSectionField('wealth_data', 'cash_and_crypto', parseFloat(e.target.value) || 0)}
              className="h-8 text-xs font-semibold"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="text-slate-600 font-medium block mb-1">
              Kapitalbezug 2. / 3. Säule (separat besteuert)
            </label>
            <Input
              type="number"
              value={incData.capital_pension_payout || ''}
              onChange={(e) => updateSectionField('income_data', 'capital_pension_payout', parseFloat(e.target.value) || 0)}
              className="h-8 text-xs font-semibold"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="text-slate-600 font-medium block mb-1">
              Erbschaft oder Schenkung erhalten (CHF)
            </label>
            <Input
              type="number"
              value={wData.inheritance_or_gifts_received || ''}
              onChange={(e) => updateSectionField('wealth_data', 'inheritance_or_gifts_received', parseFloat(e.target.value) || 0)}
              className="h-8 text-xs font-semibold"
              placeholder="0.00"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={saveChanges}
          disabled={saving}
          className="bg-primary hover:bg-primary-700 text-white font-bold text-xs px-6 h-9 shadow-sm"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
          Alle Angaben speichern & zur Kontrolle
        </Button>
      </div>
    </div>
  );
}
