'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

export function AccountFormShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="ui-account-page"><div className="ui-account-card"><Link href="/login" className="desk-brand mb-9"><span className="desk-emblem small">y<span /></span><span>YDesk<small>The Yellow Network</small></span></Link><h1>{title}</h1><p className="ui-account-description">{description}</p>{children}<Link href="/login" className="ui-back-link mt-7 mb-0"><ArrowLeft size={15} />Back to sign in</Link></div><p className="ui-account-footer">Your team workspace, connected.</p></div>;
}

export function PageHeading({ title, description, icon: Icon, onBack, actions }: {
  title: string; description?: string; icon?: LucideIcon; onBack?: () => void; actions?: ReactNode;
}) {
  return <div className="ui-page-heading">
    <div>{onBack && <button type="button" className="ui-back-link" onClick={onBack}><ArrowLeft size={15} />Back to workspace</button>}
      <div className="ui-heading-title">{Icon && <span className="ui-heading-icon"><Icon size={24} strokeWidth={1.7} /></span>}<div><h1>{title}</h1>{description && <p>{description}</p>}</div></div>
    </div>{actions && <div className="ui-heading-actions">{actions}</div>}
  </div>;
}

export function FormSection({ title, description, icon: Icon, actions, children }: {
  title: string; description?: string; icon?: LucideIcon; actions?: ReactNode; children: ReactNode;
}) {
  return <section className="ui-form-section"><div className="ui-section-heading"><div className="ui-section-title">{Icon && <span className="ui-section-icon"><Icon size={18} /></span>}<div><h2>{title}</h2>{description && <p>{description}</p>}</div></div>{actions}</div><div className="ui-section-content">{children}</div></section>;
}

export function Field({ label, htmlFor, hint, error, required, children }: {
  label: string; htmlFor?: string; hint?: string; error?: string; required?: boolean; children: ReactNode;
}) {
  return <div className="ui-field"><label htmlFor={htmlFor}>{label}{required && <span aria-hidden="true" className="ui-required"> *</span>}</label>{children}{error ? <p className="ui-field-error" role="alert">{error}</p> : hint && <p className="ui-field-hint">{hint}</p>}</div>;
}

export function Dialog({ title, description, onClose, busy = false, wide = false, children, showHeader = true }: {
  title: string; description?: string; onClose: () => void; busy?: boolean; wide?: boolean; showHeader?: boolean; children: ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const pending = useRef(busy);
  close.current = onClose;
  pending.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') || []).filter(element => element.getClientRects().length > 0);
    (focusable()[0] || panel.current)?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending.current) { event.preventDefault(); close.current(); }
      if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); panel.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="ui-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} tabIndex={-1} className={`ui-dialog ${wide ? 'ui-dialog-wide' : ''}`}>
      {showHeader ? <div className="ui-dialog-header"><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><button type="button" aria-label="Close dialog" onClick={onClose} disabled={busy} className="ui-icon-button"><X size={20} /></button></div> : <h2 id={titleId} className="sr-only">{title}</h2>}
      <div className="ui-dialog-body">{children}</div>
    </div>
  </div>, document.body);
}
