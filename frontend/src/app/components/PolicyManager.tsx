'use client';

import { useEffect, useState } from 'react';
import { useGetPolicyQuery, useUpdatePolicyMutation } from '@/lib/api';
import { Save, RotateCcw, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeading, FormSection, Field } from './ui/WorkspaceUI';

export default function PolicyManager() {
  const { data: currentPolicy, isLoading, error } = useGetPolicyQuery({});
  const [savePolicy, { isLoading: saving }] = useUpdatePolicyMutation();
  const [draft, setDraft] = useState<any>(null);
  useEffect(() => { if (currentPolicy) setDraft(JSON.parse(JSON.stringify(currentPolicy))); }, [currentPolicy]);
  if (isLoading) return <p role="status">Loading reimbursement policy…</p>;
  if (error || !draft) return <p role="alert">The policy could not be loaded. Refresh the page to retry.</p>;

  const setCap = (section: string, city: string, value: number, meal?: string) => {
    setDraft((previous: any) => ({ ...previous, [section]: {
      ...previous[section], [city]: meal ? { ...previous[section]?.[city], [meal]: value } : value
    } }));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const { _id, createdAt, updatedAt, __v, updatedBy, ...data } = draft;
      await savePolicy({ ...data, version: new Date().toISOString(), maxFileSizeMB: Math.min(data.maxFileSizeMB || 4, 4) }).unwrap();
      toast.success('Policy saved');
    } catch (failure: any) { toast.error(failure.data?.details || failure.data?.error || 'Could not save the policy'); }
  };

  return <div>
    <PageHeading title="Reimbursement policy" description="Set clear limits and receipt requirements for every expense." icon={ShieldCheck} />
    <form onSubmit={save} className="ui-form-layout">
      <div className="ui-form-main">
        <FormSection title="Meal limits" description="Maximum reimbursement per person, by city class. All amounts are in INR.">
          <div className="grid lg:grid-cols-3 gap-4">{['A', 'B', 'C'].map(city => <fieldset className="ui-expense-item" key={city}><legend className="text-sm font-semibold text-blue-900 px-2">City class {city}</legend><div className="space-y-4">{['breakfast', 'lunch', 'dinner', 'snack'].map(meal => <Field key={meal} label={meal.charAt(0).toUpperCase() + meal.slice(1)} htmlFor={`cap-${city}-${meal}`}><input id={`cap-${city}-${meal}`} className="ui-control" type="number" min="0" step="0.01" required value={draft.mealCaps?.[city]?.[meal] ?? 0} onChange={event => setCap('mealCaps', city, Number(event.target.value), meal)} /></Field>)}</div></fieldset>)}</div>
        </FormSection>
        <FormSection title="Lodging and travel" description="Nightly accommodation limits and mileage reimbursement.">
          <div className="grid sm:grid-cols-3 gap-4">{['A', 'B', 'C'].map(city => <Field key={city} label={`Class ${city}, per night (INR)`} htmlFor={`lodging-${city}`}><input id={`lodging-${city}`} className="ui-control" type="number" min="0" step="0.01" required value={draft.lodgingCaps?.[city] ?? 0} onChange={event => setCap('lodgingCaps', city, Number(event.target.value))} /></Field>)}</div>
          <div className="mt-5 max-w-xs"><Field label="Mileage rate (INR / km)" htmlFor="policy-mileage"><input id="policy-mileage" className="ui-control" type="number" min="0" step="0.01" required value={draft.mileageRate ?? 12} onChange={event => setDraft({ ...draft, mileageRate: Number(event.target.value) })} /></Field></div>
        </FormSection>
        <FormSection title="Required receipts" description="Enter comma-separated document labels. Employees use these labels when attaching receipts."><div className="grid sm:grid-cols-2 gap-5">{['default', 'flight', 'train', 'meal', 'lodging', 'local_travel', 'mileage', 'admin_misc'].map(type => <Field key={type} label={type.replaceAll('_', ' ')} htmlFor={`documents-${type}`}><input id={`documents-${type}`} className="ui-control" value={(draft.requiredDocuments?.[type] || []).join(', ')} onChange={event => setDraft({ ...draft, requiredDocuments: { ...draft.requiredDocuments, [type]: event.target.value.split(',').map(label => label.trim()).filter(Boolean) } })} /></Field>)}</div></FormSection>
        <FormSection title="When a claim breaks a rule" description="Choose whether to block submission or leave a warning for the reviewer."><div className="grid sm:grid-cols-2 gap-5">{['missingDocuments', 'capExceeded'].map(rule => <Field key={rule} label={rule === 'missingDocuments' ? 'Missing required receipts' : 'Amount above the limit'} htmlFor={`rule-${rule}`}><select id={`rule-${rule}`} className="ui-control" value={draft.rulesBehavior?.[rule] || (rule === 'missingDocuments' ? 'hard' : 'soft')} onChange={event => setDraft({ ...draft, rulesBehavior: { ...draft.rulesBehavior, [rule]: event.target.value } })}><option value="hard">Block submission</option><option value="soft">Warn the reviewer</option></select></Field>)}</div></FormSection>
        <div className="ui-form-actions"><button type="button" className="ui-button ui-button-secondary" disabled={saving} onClick={() => setDraft(JSON.parse(JSON.stringify(currentPolicy)))}><RotateCcw size={15} />Reset changes</button><button className="ui-button ui-button-primary" disabled={saving}><Save size={15} />{saving ? 'Saving policy…' : 'Save policy'}</button></div>
      </div>
      <aside className="ui-summary"><h2 className="ui-summary-heading">Policy settings</h2><div className="ui-summary-content"><div className="ui-summary-row"><span>Last updated</span><strong>{currentPolicy.updatedAt ? new Date(currentPolicy.updatedAt).toLocaleDateString('en-IN') : 'Today'}</strong></div><div className="ui-summary-row"><span>Currency</span><strong>Indian rupees</strong></div><div className="ui-summary-row"><span>City classes</span><strong>A, B, C</strong></div></div><div className="ui-summary-help border-t border-gray-200"><h3>Make every rule clear</h3><p>Changes apply to future submissions and edited claims. Each save keeps a new policy version.</p><p className="mt-3">Use the default receipt label to define requirements for expenses without their own rule.</p></div></aside>
    </form>
  </div>;
}
