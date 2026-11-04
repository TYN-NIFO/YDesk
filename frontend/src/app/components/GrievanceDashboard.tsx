'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { AlertCircle, AlignLeft, ArrowLeft, BarChart3, CheckCircle, Clock, Download, FileText, Inbox, Paperclip, Plus, ShieldCheck, X } from 'lucide-react';
import { RootState } from '@/lib/store';
import { PageHeading, FormSection, Field } from './ui/WorkspaceUI';
import LoadingSpinner from './LoadingSpinner';
import {
  useGetGrievanceMetaQuery,
  useGetGrievancesQuery,
  useGetGrievanceSummaryQuery,
  useGetGrievanceQuery,
  useCreateGrievanceMutation,
  useUpdateGrievanceStatusMutation,
} from '@/lib/api';

type Tab = 'mine' | 'all' | 'summary';

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_STYLES: Record<string, string> = {
  submitted: 'bg-yellow-100 text-yellow-800',
  under_review: 'bg-blue-100 text-blue-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-200 text-gray-700',
};

const MAX_FILES = 3;
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const errorMessage = (error: any, fallback: string) =>
  error?.data?.details || error?.data?.error || fallback;

const formatDate = (value?: string) => (value ? format(new Date(value), 'dd MMM yyyy') : '—');

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-700'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default function GrievanceDashboard() {
  const { user } = useSelector((state: RootState) => state.auth);
  const { data: meta } = useGetGrievanceMetaQuery(undefined);
  const access: 'handler' | 'summary' | null = meta?.access ?? null;
  const [tab, setTab] = useState<Tab>('mine');
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const tabs = [
    { key: 'mine' as Tab, label: 'My feedback', icon: FileText },
    ...(access === 'handler' ? [{ key: 'all' as Tab, label: 'All feedback', icon: Inbox }] : []),
    ...(access ? [{ key: 'summary' as Tab, label: 'Summary', icon: BarChart3 }] : []),
  ];

  // The form and the detail view are full-screen tasks, like the rest of the
  // workspace (e.g. the claim form): they replace the portal chrome instead
  // of stacking a second heading underneath it.
  if (showForm) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <GrievanceForm categories={meta?.categories || []} onClose={() => setShowForm(false)} />
        </div>
      </div>
    );
  }

  if (openId) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <GrievanceDetail
            grievanceId={openId}
            isHandler={access === 'handler'}
            transitions={meta?.transitions || {}}
            currentUserId={user?._id}
            onBack={() => setOpenId(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="ui-panel bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-4 justify-between items-center py-4">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Feedback portal</h1>
                <p className="text-sm text-gray-600">Share ideas, appreciation, or concerns, and follow the response</p>
              </div>
            </div>
            <button onClick={() => setShowForm(true)} className="ui-button ui-button-primary">
              <Plus size={16} />
              Share feedback
            </button>
          </div>
        </div>
      </div>

      {tabs.length > 1 && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Feedback sections">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-current={tab === t.key ? 'page' : undefined}
                  className={`ui-tab flex items-center space-x-2 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${tab === t.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  <t.icon className="h-4 w-4" />
                  <span>{t.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {tab === 'summary' && access ? (
          <GrievanceSummary onOpen={setOpenId} />
        ) : (
          <GrievanceList
            scope={tab === 'all' && access === 'handler' ? 'all' : 'mine'}
            categories={meta?.categories || []}
            onOpen={setOpenId}
          />
        )}
      </div>
    </div>
  );
}

function GrievanceForm({ categories, onClose }: { categories: string[]; onClose: () => void }) {
  const [category, setCategory] = useState('');
  const [feedbackType, setFeedbackType] = useState("general");
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [incidentDate, setIncidentDate] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [createGrievance, { isLoading }] = useCreateGrievanceMutation();
  const today = format(new Date(), 'yyyy-MM-dd');

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: only PDF, JPG or PNG files are allowed`);
      } else if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: files must be 4MB or smaller`);
      } else if (next.length >= MAX_FILES) {
        toast.error(`You can attach at most ${MAX_FILES} files`);
        break;
      } else {
        next.push(file);
      }
    }
    setFiles(next);
  };

  const problems = [
    !category && 'Choose a category',
    subject.trim().length < 5 && 'Subject must be at least 5 characters',
    description.trim().length < 20 && 'Description must be at least 20 characters',
  ].filter(Boolean) as string[];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problems.length > 0) {
      toast.error(problems[0]);
      return;
    }
    try {
      const result = await createGrievance({
        category,
        feedbackType,
        subject: subject.trim(),
        description: description.trim(),
        incidentDate: incidentDate || undefined,
        files,
      }).unwrap();
      toast.success(`Feedback ${result.grievance.grievanceId} submitted`);
      onClose();
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to submit feedback'));
    }
  };

  return <div>
    <PageHeading title="Share your feedback" description="Share an idea, recognize good work, or tell us what could be better." icon={ShieldCheck} onBack={onClose} />
    <form onSubmit={submit} className="ui-form-layout">
      <div className="ui-form-main">
        <FormSection title="About your feedback" description="Choose a category and give your feedback a clear subject." icon={FileText}>
          <div className="mb-5"><Field label="Feedback type" htmlFor="feedback-type" required><select id="feedback-type" className="ui-control" value={feedbackType} onChange={event => setFeedbackType(event.target.value)}>{Object.entries({ general: "General feedback", suggestion: "Suggestion", appreciation: "Appreciation", concern: "Concern" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field></div>
          <div className="grid sm:grid-cols-2 gap-5"><Field label="Category" htmlFor="grv-category" required><select id="grv-category" className="ui-control" value={category} onChange={event => setCategory(event.target.value)} required><option value="">Choose a category</option>{categories.map(category => <option key={category}>{category}</option>)}</select></Field><Field label="Relevant date" htmlFor="grv-date" hint="Optional. Choose the date if you know it."><input id="grv-date" type="date" className="ui-control" max={today} value={incidentDate} onChange={event => setIncidentDate(event.target.value)} /></Field></div>
          <div className="mt-5"><Field label="Subject" htmlFor="grv-subject" required hint="A short summary in 5–150 characters."><input id="grv-subject" className="ui-control" value={subject} onChange={event => setSubject(event.target.value)} minLength={5} maxLength={150} required placeholder="What would you like the team to review?" /></Field></div>
        </FormSection>
        <FormSection title="Tell us more" description="Add the details that will help your reviewers understand your feedback." icon={AlignLeft}><Field label="Description" htmlFor="grv-description" required hint={`${description.length}/5,000 characters · at least 20 characters`}><textarea id="grv-description" className="ui-control" style={{ minHeight: 200 }} value={description} onChange={event => setDescription(event.target.value)} minLength={20} maxLength={5000} required placeholder="Share your idea, what went well, or what you would like to improve." /></Field></FormSection>
        <FormSection title="Supporting documents" description="Attach documents that help explain the situation. This is optional." icon={Paperclip}>
          <label htmlFor="grv-attachments" className="ui-upload"><Paperclip size={22} /><span>Choose supporting files</span><small>PDF, JPG, PNG · 3 files maximum · 4MB each</small><input id="grv-attachments" className="sr-only" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple disabled={files.length >= MAX_FILES} onChange={event => { addFiles(event.target.files); event.target.value = ''; }} /></label>
          <div className="space-y-2 mt-3">{files.map((file, index) => <div className="ui-receipt" key={`${file.name}-${index}`}><span className="ui-receipt-name"><FileText size={16} /><span>{file.name}</span></span><span className="text-xs text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</span><button type="button" className="ui-icon-button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(previous => previous.filter((_, position) => position !== index))}><X size={15} /></button></div>)}</div>
        </FormSection>
        <div className="ui-form-actions"><button type="button" onClick={onClose} disabled={isLoading} className="ui-button ui-button-secondary">Cancel</button><button type="submit" disabled={isLoading} className="ui-button ui-button-primary"><ShieldCheck size={16} />{isLoading ? 'Submitting feedback…' : 'Submit feedback'}</button></div>
      </div>
      <aside className="ui-summary"><h2 className="ui-summary-heading">Every idea matters</h2><div className="ui-summary-help"><ShieldCheck className="text-blue-700 mb-4" size={26} /><h3>Who can see your feedback?</h3><p>You and the designated feedback reviewers can read the details and attachments. Leadership summary access sees aggregate counts, and can open an individual item's details and progress when needed.</p><h3 className="mt-5">This is a named report</h3><p>Your name is shared with the designated feedback reviewers so they can follow up with you.</p><h3 className="mt-5">Stay informed</h3><p>Follow the status and response history in My feedback after submitting.</p></div></aside>
    </form>
  </div>;
}

function GrievanceList({ scope, categories, onOpen }: { scope: 'mine' | 'all'; categories: string[]; onOpen: (id: string) => void }) {
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const { data, isLoading, error, refetch } = useGetGrievancesQuery({
    scope,
    ...(status && { status }),
    ...(category && { category }),
    ...(typeFilter && { feedbackType: typeFilter }),
  });
  const grievances = data?.grievances || [];

  return (
    <div className="card">
      <div className="card-header flex flex-wrap gap-3 items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{scope === 'all' ? 'All feedback' : 'My feedback'}</h2>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Filter by feedback type" className="ui-control !w-auto" value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="">All feedback types</option>{Object.entries({ general: "General feedback", suggestion: "Suggestion", appreciation: "Appreciation", concern: "Concern" }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="ui-control !w-auto" aria-label="Filter by status">
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {scope === 'all' && (
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="ui-control !w-auto" aria-label="Filter by category">
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="p-8"><LoadingSpinner text="Loading feedback…" /></div>
      ) : error ? (
        <div className="p-8 text-center text-red-600">
          <AlertCircle className="h-6 w-6 mx-auto mb-2" />
          {errorMessage(error, 'Failed to load feedback')}
          <div><button onClick={() => refetch()} className="ui-button ui-button-secondary mt-3">Retry</button></div>
        </div>
      ) : grievances.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          {scope === 'all' ? 'No feedback matches these filters.' : 'You haven’t shared any feedback.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="ui-table min-w-full divide-y divide-gray-200 text-sm">
            <thead className="ui-table-head bg-gray-50">
              <tr>
                <th className="ui-table-th px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">ID</th>
                {scope === 'all' && <th className="ui-table-th px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">Raised by</th>}
                <th className="ui-table-th px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">Type / category</th>
                <th className="ui-table-th px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">Subject</th>
                <th className="ui-table-th px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">Status</th>
                <th className="ui-table-th px-4 py-3 text-left font-medium text-gray-500 uppercase text-xs">Raised on</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {grievances.map((g: any) => (
                <tr key={g.grievanceId} onClick={() => onOpen(g.grievanceId)} className="hover:bg-gray-50 cursor-pointer">
                  <td className="ui-table-td px-4 py-3 font-mono text-xs whitespace-nowrap">
                    <button onClick={(e) => { e.stopPropagation(); onOpen(g.grievanceId); }} className="text-blue-600 hover:underline">{g.grievanceId}</button>
                  </td>
                  {scope === 'all' && <td className="ui-table-td px-4 py-3 whitespace-nowrap">{g.employeeId?.name || '—'}</td>}
                  <td className="ui-table-td px-4 py-3 whitespace-nowrap"><span className="block capitalize text-xs text-gray-500 mb-1">{g.feedbackType || "concern"}</span>{g.category}</td>
                  <td className="ui-table-td px-4 py-3 max-w-xs truncate">{g.subject}</td>
                  <td className="ui-table-td px-4 py-3"><StatusBadge status={g.status} /></td>
                  <td className="ui-table-td px-4 py-3 whitespace-nowrap">{formatDate(g.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GrievanceDetail({ grievanceId, isHandler, transitions, currentUserId, onBack }: {
  grievanceId: string;
  isHandler: boolean;
  transitions: Record<string, string[]>;
  currentUserId?: string;
  onBack: () => void;
}) {
  const { data, isLoading, error } = useGetGrievanceQuery(grievanceId);
  const accessToken = useSelector((state: RootState) => state.auth.accessToken);
  const [updateStatus, { isLoading: isUpdating }] = useUpdateGrievanceStatusMutation();
  const [nextStatus, setNextStatus] = useState('');
  const [note, setNote] = useState('');
  const grievance = data?.grievance;

  if (isLoading) return <div className="p-8"><LoadingSpinner text="Loading feedback…" /></div>;
  if (error || !grievance) {
    return (
      <div className="card p-8 text-center text-red-600">
        {errorMessage(error, 'Feedback not found')}
        <div><button onClick={onBack} className="ui-button ui-button-secondary mt-3">Back</button></div>
      </div>
    );
  }

  const isOwn = grievance.employeeId?._id === currentUserId;
  const options: string[] = transitions[grievance.status] || [];
  const needsNote = ['resolved', 'closed'].includes(nextStatus);

  // Attachments need the auth header, so fetch them rather than linking.
  const download = async (fileId: string, name: string) => {
    try {
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const res = await fetch(`${base}/feedback/${grievance.grievanceId}/attachments/${fileId}`, {
        headers: { authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  };

  const submitStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nextStatus) return;
    if (needsNote && note.trim().length < 5) {
      toast.error('Add a note explaining the outcome');
      return;
    }
    try {
      await updateStatus({ grievanceId: grievance.grievanceId, status: nextStatus, note: note.trim() }).unwrap();
      toast.success(`Marked ${STATUS_LABELS[nextStatus].toLowerCase()}`);
      setNextStatus('');
      setNote('');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update feedback'));
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <button onClick={onBack} className="ui-button ui-button-secondary">
        <ArrowLeft size={16} /> Back to list
      </button>

      <div className="card">
        <div className="card-header flex flex-wrap gap-3 items-start justify-between">
          <div>
            <p className="font-mono text-xs text-gray-500">{grievance.grievanceId}</p>
            <h2 className="text-xl font-semibold text-gray-900 mt-1">{grievance.subject}</h2>
          </div>
          <StatusBadge status={grievance.status} />
        </div>
        <div className="card-body space-y-4">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-gray-500">Raised by</dt><dd className="text-gray-900">{grievance.employeeId?.name}{grievance.employeeId?.department ? ` · ${grievance.employeeId.department}` : ''}</dd></div>
            <div><dt className="text-gray-500">Feedback type</dt><dd className="text-gray-900 capitalize">{grievance.feedbackType || 'concern'}</dd></div>
            <div><dt className="text-gray-500">Category</dt><dd className="text-gray-900">{grievance.category}</dd></div>
            <div><dt className="text-gray-500">Raised on</dt><dd className="text-gray-900">{formatDate(grievance.createdAt)}</dd></div>
            <div><dt className="text-gray-500">Relevant date</dt><dd className="text-gray-900">{formatDate(grievance.incidentDate)}</dd></div>
          </dl>
          <div>
            <h3 className="text-sm text-gray-500 mb-1">Description</h3>
            <p className="text-gray-900 whitespace-pre-wrap break-words">{grievance.description}</p>
          </div>
          {grievance.attachments?.length > 0 && (
            <div>
              <h3 className="text-sm text-gray-500 mb-1">Attachments</h3>
              <ul className="space-y-1">
                {grievance.attachments.map((a: any) => (
                  <li key={a.fileId}>
                    <button onClick={() => download(a.fileId, a.name)} className="flex items-center text-sm text-blue-600 hover:underline">
                      <Download className="h-4 w-4 mr-1" /> {a.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="font-semibold text-gray-900">History</h3></div>
        <ol className="card-body space-y-3">
          {grievance.statusHistory?.map((h: any, i: number) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
              <div>
                <p className="text-gray-900">
                  <StatusBadge status={h.status} />
                  <span className="text-gray-500 ml-2">{h.changedBy?.name || '—'} · {h.changedAt ? format(new Date(h.changedAt), 'dd MMM yyyy, HH:mm') : ''}</span>
                </p>
                {h.note && <p className="text-gray-700 mt-1 whitespace-pre-wrap">{h.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {isHandler && !isOwn && options.length > 0 && (
        <form onSubmit={submitStatus} className="card">
          <div className="card-header"><h3 className="font-semibold text-gray-900">Update status</h3></div>
          <div className="card-body space-y-4">
            <Field label="New status" htmlFor="grv-status">
              <select id="grv-status" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className="ui-control">
                <option value="">Select a status</option>
                {options.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </Field>
            <Field label="Note to the employee" htmlFor="grv-note" required={needsNote} hint="The employee is emailed this note with the new status.">
              <textarea id="grv-note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} className="ui-control" placeholder={needsNote ? 'Explain the outcome' : 'Optional'} />
            </Field>
            <div className="flex justify-end">
              <button type="submit" disabled={!nextStatus || isUpdating} className="ui-button ui-button-primary">
                {isUpdating ? 'Saving…' : 'Update status'}
              </button>
            </div>
          </div>
        </form>
      )}
      {isHandler && isOwn && (
        <p className="text-sm text-gray-500">You raised this feedback, so another handler needs to act on it.</p>
      )}
    </div>
  );
}

function GrievanceSummary({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading, error } = useGetGrievanceSummaryQuery(undefined);
  if (isLoading) return <div className="p-8"><LoadingSpinner text="Loading summary…" /></div>;
  if (error || !data) return <div className="card p-8 text-center text-red-600">{errorMessage(error, 'Failed to load summary')}</div>;

  const open = (data.byStatus.submitted || 0) + (data.byStatus.under_review || 0);
  const tiles = [
    { label: 'Total raised', value: data.total, icon: FileText, iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
    { label: 'Open', value: open, icon: Clock, iconBg: 'bg-yellow-100', iconColor: 'text-yellow-600' },
    { label: 'Resolved / closed', value: (data.byStatus.resolved || 0) + (data.byStatus.closed || 0), icon: CheckCircle, iconBg: 'bg-green-100', iconColor: 'text-green-600' },
    { label: 'Avg. days to resolve', value: data.averageResolutionDays != null ? `${data.averageResolutionDays} d` : '—', icon: BarChart3, iconBg: 'bg-purple-100', iconColor: 'text-purple-600' },
  ];
  const categories = Object.entries(data.byCategory as Record<string, number>).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(1, ...categories.map(([, count]) => count));

  return (
    <div className="space-y-6">
      <div className="ui-kpi-grid">
        {tiles.map((t) => (
          <div key={t.label} className="ui-kpi-card">
            <span className={`ui-kpi-icon ${t.iconBg} ${t.iconColor}`}>
              <t.icon size={18} />
            </span>
            <div className="ui-kpi-body">
              <p className="ui-kpi-label">{t.label}</p>
              <p className="ui-kpi-value">{t.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header"><h3 className="font-semibold text-gray-900">By category</h3></div>
          <div className="card-body space-y-3">
            {categories.length === 0 ? <p className="text-sm text-gray-500">No feedback yet.</p> : categories.map(([name, count]) => (
              <div key={name} className="text-sm">
                <div className="flex justify-between mb-1"><span className="text-gray-700">{name}</span><span className="font-medium text-gray-900">{count}</span></div>
                <div className="h-2 bg-gray-100 rounded"><div className="h-2 bg-blue-500 rounded" style={{ width: `${(count / maxCount) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3 className="font-semibold text-gray-900">Open feedback ({data.open.length})</h3></div>
          {data.open.length === 0 ? (
            <p className="card-body text-sm text-gray-500">Nothing open.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="ui-table min-w-full text-sm">
                <thead className="ui-table-head bg-gray-50">
                  <tr>
                    <th className="ui-table-th px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="ui-table-th px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="ui-table-th px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="ui-table-th px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.open.map((g: any) => (
                    <tr key={g.grievanceId} onClick={() => onOpen(g.grievanceId)} className="hover:bg-gray-50 cursor-pointer">
                      <td className="ui-table-td px-4 py-2 font-mono text-xs whitespace-nowrap">
                        <button onClick={(e) => { e.stopPropagation(); onOpen(g.grievanceId); }} className="text-blue-600 hover:underline">{g.grievanceId}</button>
                      </td>
                      <td className="ui-table-td px-4 py-2 whitespace-nowrap">{g.category}</td>
                      <td className="ui-table-td px-4 py-2"><StatusBadge status={g.status} /></td>
                      <td className={`ui-table-td ${`px-4 py-2 text-right whitespace-nowrap ${g.ageDays > 14 ? 'text-red-600 font-medium' : 'text-gray-700'}`}`}>{g.ageDays} d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-500">Click an ID to see its full details and progress.</p>
    </div>
  );
}
