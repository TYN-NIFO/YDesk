'use client';

import { useState } from 'react';
import { useCreateLeaveMutation, useUpdateLeaveMutation } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { store } from '@/lib/store';
import { CalendarDays, CalendarRange, MessageSquare, Send, Loader2 } from 'lucide-react';
import { PageHeading, FormSection, Field } from './ui/WorkspaceUI';

interface LeaveFormProps {
  initialData?: any;
  mode?: 'create' | 'edit';
  onSuccess?: () => void;
  onCancel?: () => void;
}

const LEAVE_TYPES = [
  'Business Trip',
  'WFH',
  'Planned Leave',
  'Unplanned Leave',
  'OD',
  'Permission',
  'Flexi'
];

export default function LeaveForm({
  initialData,
  mode = 'create',
  onSuccess,
  onCancel
}: LeaveFormProps) {
  const router = useRouter();
  const [createLeave, { isLoading: isCreating }] = useCreateLeaveMutation();
  const [updateLeave, { isLoading: isUpdating }] = useUpdateLeaveMutation();

  const [formData, setFormData] = useState({
    type: initialData?.type || '',
    startDate: initialData?.startDate ?
      new Date(initialData.startDate).toISOString().split('T')[0] : '',
    endDate: initialData?.endDate ?
      new Date(initialData.endDate).toISOString().split('T')[0] : '',
    hours: initialData?.hours || '',
    reason: initialData?.reason || '',
    timezone: initialData?.timezone || 'Asia/Kolkata'
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSuccess, setIsSuccess] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.type) {
      newErrors.type = 'Leave type is required';
    }

    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required';
    }

    if (!formData.endDate) {
      newErrors.endDate = 'End date is required';
    }

    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      if (end < start) {
        newErrors.endDate = 'End date cannot be before start date';
      }
    }

    if (formData.type === 'Permission') {
      if (!formData.hours || parseFloat(formData.hours) <= 0 || parseFloat(formData.hours) > 24) {
        newErrors.hours = 'Hours must be between 0.5 and 24 for Permission type';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      const submitData = {
        ...formData,
        hours: formData.type === 'Permission' ? parseFloat(formData.hours) : null
      };



      if (mode === 'create') {
        await createLeave(submitData).unwrap();
      } else {
        await updateLeave({ id: initialData._id, ...submitData }).unwrap();
      }

      // Show success message and set success state
      toast.success('Leave request submitted successfully!');
      setIsSuccess(true);

      if (onSuccess) {
        onSuccess();
      } else {
        // Redirect to appropriate dashboard after a short delay
        setTimeout(() => {
          // Get user from store to determine routing
          const state = store.getState() as any;
          const currentUser = state.auth.user;

          switch (currentUser?.role) {
            case 'executive':
              router.push('/executive');
              break;
            case 'finance_manager':
              router.push('/finance');
              break;
            case 'admin':
              router.push('/admin');
              break;
            default:
              router.push('/employee');
          }
        }, 1500);
      }
    } catch (error: any) {
      console.error('Form submission error:', error);

      // Show error information
      let errorMessage = 'An error occurred while submitting the form';
      if (error.data?.details) {
        errorMessage = error.data.details;
      } else if (error.data?.error) {
        errorMessage = error.data.error;
      } else if (error.data?.message) {
        errorMessage = error.data.message;
      } else if (error.status === 400) {
        errorMessage = 'Bad request - please check your form data';
      } else if (error.status === 401) {
        errorMessage = 'Unauthorized - please log in again';
      } else if (error.status === 500) {
        errorMessage = 'Server error - please try again later';
      }

      toast.error(errorMessage);
      setErrors({ submit: errorMessage });
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear errors when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Auto-set end date to start date for single-day leaves
    if (field === 'startDate' && !formData.endDate) {
      setFormData(prev => ({ ...prev, endDate: value }));
    }

    // Clear hours when type is not Permission
    if (field === 'type' && value !== 'Permission') {
      setFormData(prev => ({ ...prev, hours: '' }));
    }
  };

  const resetForm = () => {
    setFormData({
      type: '',
      startDate: '',
      endDate: '',
      hours: '',
      reason: '',
      timezone: 'Asia/Kolkata'
    });
    setErrors({});
    setIsSuccess(false);
  };

  const isLoading = isCreating || isUpdating;
  const isFormDisabled = isLoading || isSuccess;

  const duration = formData.startDate && formData.endDate && new Date(formData.endDate) >= new Date(formData.startDate)
    ? Math.floor((new Date(formData.endDate).getTime() - new Date(formData.startDate).getTime()) / 86400000) + 1 : 0;
  const displayDate = (date: string) => date ? new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not selected';
  return <div>
    <PageHeading title={mode === 'create' ? 'Request time off' : 'Edit time-off request'} description="Plan your time, share the details, and keep your team in sync." icon={CalendarDays} onBack={onCancel} />
    <form onSubmit={handleSubmit} className="ui-form-layout">
      <div className="ui-form-main">
        <FormSection title="Type of request" description="Choose the option that best describes your time away." icon={CalendarDays}>
          <Field label="Request type" htmlFor="leave-type" required error={errors.type}><select id="leave-type" className="ui-control" value={formData.type} onChange={event => handleInputChange('type', event.target.value)} disabled={isFormDisabled} aria-invalid={!!errors.type}><option value="">Choose a request type</option>{LEAVE_TYPES.map(type => <option key={type}>{type}</option>)}</select></Field>
        </FormSection>
        <FormSection title="Dates and duration" description="Both the start and end date are included in your request." icon={CalendarRange}>
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Start date" htmlFor="leave-start" required error={errors.startDate}><input type="date" id="leave-start" className="ui-control" value={formData.startDate} onChange={event => handleInputChange('startDate', event.target.value)} disabled={isFormDisabled} aria-invalid={!!errors.startDate} /></Field>
            <Field label="End date" htmlFor="leave-end" required error={errors.endDate}><input type="date" id="leave-end" className="ui-control" min={formData.startDate || undefined} value={formData.endDate} onChange={event => handleInputChange('endDate', event.target.value)} disabled={isFormDisabled} aria-invalid={!!errors.endDate} /></Field>
            {formData.type === 'Permission' && <Field label="Hours requested" htmlFor="leave-hours" required error={errors.hours} hint="For part of a workday, enter between 0.5 and 24 hours."><input type="number" id="leave-hours" className="ui-control" min="0.5" max="24" step="0.5" value={formData.hours} onChange={event => handleInputChange('hours', event.target.value)} disabled={isFormDisabled} placeholder="For example, 2" aria-invalid={!!errors.hours} /></Field>}
          </div>
        </FormSection>
        <FormSection title="A note for your approver" description="Add context or handover information if it helps." icon={MessageSquare}>
          <Field label="Reason or handover note" htmlFor="leave-reason" hint="Optional. Keep personal details to what you are comfortable sharing."><textarea id="leave-reason" rows={4} maxLength={500} className="ui-control" value={formData.reason} onChange={event => handleInputChange('reason', event.target.value)} disabled={isFormDisabled} placeholder="Anything your approver should know?" /></Field>
        </FormSection>
        {errors.submit && <p role="alert" className="ui-note">{errors.submit}</p>}
        {isSuccess && <p role="status" className="ui-note">Your request has been saved. Opening your workspace…</p>}
        <div className="ui-form-actions">{onCancel && <button type="button" className="ui-button ui-button-secondary" onClick={onCancel} disabled={isLoading}>Cancel</button>}<button type="submit" disabled={isFormDisabled} className="ui-button ui-button-primary">{isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}{isLoading ? 'Saving request…' : mode === 'create' ? 'Send request for approval' : 'Save request changes'}</button>{isSuccess && <button type="button" className="ui-button ui-button-secondary" onClick={resetForm}>Create another request</button>}</div>
      </div>
      <aside className="ui-summary"><h2 className="ui-summary-heading">Request summary</h2><div className="ui-summary-content"><div className="ui-summary-row"><span>Type</span><strong>{formData.type || 'Not selected'}</strong></div><div className="ui-summary-row"><span>From</span><strong>{displayDate(formData.startDate)}</strong></div><div className="ui-summary-row"><span>Until</span><strong>{displayDate(formData.endDate)}</strong></div></div><div className="ui-summary-total"><p>Requested duration</p><strong aria-live="polite">{formData.type === 'Permission' ? `${formData.hours || 0} hours` : `${duration} ${duration === 1 ? 'day' : 'days'}`}</strong><small>Dates are recorded in {formData.timezone}.</small></div><div className="ui-summary-help"><h3>What happens next</h3><p>Your request goes to the executive team for review. You can edit or withdraw it while it is awaiting approval.</p><p className="mt-3">Check your team calendar and arrange a handover before taking time off.</p></div></aside>
    </form>
  </div>;
}
