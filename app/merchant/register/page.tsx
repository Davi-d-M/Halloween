'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Store } from 'lucide-react';
import { marketSupabase } from '@/lib/marketSupabaseClient';

type Application = {
  id: string;
  business_name: string;
  requested_slug: string;
  status: string;
  review_note: string | null;
  submitted_at: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  business_description?: string;
};

export default function MerchantRegistrationPage() {
  const [application, setApplication] = useState<Application | null>(null);
  const [form, setForm] = useState({ businessName: '', slug: '', contactName: '', contactEmail: '', contactPhone: '', description: '' });
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadApplication() {
      if (!marketSupabase) {
        setError('Seller applications are not configured on this site yet.');
        setLoading(false);
        return;
      }
      let accessToken: string | undefined;
      try {
        const { data: { session } } = await marketSupabase.auth.getSession();
        accessToken = session?.access_token;
        if (session?.user.email) {
          setForm((current) => ({
            ...current,
            contactEmail: current.contactEmail || session.user.email || '',
            contactPhone: current.contactPhone || session.user.phone || ''
          }));
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not check your sign-in session.');
        setLoading(false);
        return;
      }
      if (!active) return;
      setSignedIn(Boolean(accessToken));
      if (!accessToken) {
        setLoading(false);
        return;
      }
      try {
        const response = await fetch('/api/market/merchant-application', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store'
        });
        const result = await response.json() as { application?: Application | null; error?: string };
        if (!response.ok) throw new Error(result.error || 'Could not load your application.');
        if (active) {
          setApplication(result.application || null);
          if (result.application?.status === 'information_requested') {
            setForm({
              businessName: result.application.business_name,
              slug: result.application.requested_slug,
              contactName: result.application.contact_name || '',
              contactEmail: result.application.contact_email || '',
              contactPhone: result.application.contact_phone || '',
              description: result.application.business_description || ''
            });
          }
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load your application.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadApplication();
    return () => { active = false; };
  }, []);

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    try {
      if (!marketSupabase) throw new Error('Seller applications are not configured on this site yet.');
      const { data: { session } } = await marketSupabase.auth.getSession();
      if (!session?.access_token) throw new Error('Your sign-in session expired. Sign in and try again.');
      const submission = application?.status === 'information_requested'
        ? { ...form, applicationId: application.id }
        : form;
      const response = await fetch('/api/market/merchant-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(submission)
      });
      const result = await response.json() as { application?: Application; error?: string };
      if (!response.ok || !result.application) throw new Error(result.error || 'Could not submit your application.');
      setApplication(result.application);
      setForm({ ...form, businessName: result.application.business_name, slug: result.application.requested_slug });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit your application.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <header className="mm-header">
        <Link className="mm-brand" href="/shop">MIDNIGHT <span>MARKET</span></Link>
        <nav className="mm-nav"><Link href="/shop">Discover</Link><Link href="/market">Merchant Studio</Link></nav>
      </header>
      <main className="mm-page mm-merchant-register">
        <Link className="mm-text-link" href="/shop"><ArrowLeft size={14} /> Back to Market</Link>
        <div className="mm-register-card">
          <div className="mm-eyebrow">Merchant Studio</div>
          <h1>Bring your boutique into the night.</h1>
          <p className="mm-register-copy">This private seller application uses a separate Market account. We confirm your email and phone before a shop can be approved to list products.</p>
          {loading
            ? <div className="mm-state">Checking your seller account…</div>
            : application && !['information_requested', 'rejected'].includes(application.status)
              ? (
                <div className="mm-state">
                  <Store size={22} />
                  <strong>{application.business_name}</strong>
                  <span>Application status: {application.status.replace(/_/g, ' ')}</span>
                  {application.review_note && <span>{application.review_note}</span>}
                  {application.status === 'approved' && <Link className="mm-text-link" href="/market">Open Merchant Studio</Link>}
                  {application.status === 'rejected' && <span>You can update your details and submit this application again for review.</span>}
                </div>
              )
              : !signedIn
                ? (
                  <div className="mm-state">
                    <span>Use a separate Midnight Market seller account to apply. Seller accounts are reviewed and approved by Market Operations.</span>
                    <Link href="/merchant/portal/login" className="mm-text-link">Sign in to seller account</Link>
                    <Link href="/merchant/portal/register" className="mm-text-link">Create seller account</Link>
                  </div>
                )
                : (
                  <>
                  {application?.status === 'information_requested' && (
                    <div className="mm-state" role="status">
                      <strong>More information requested</strong>
                      <span>{application.review_note || 'Please update the details below and resubmit.'}</span>
                      <span>Your shop remains unavailable until the review is complete.</span>
                    </div>
                  )}
                  {application?.status === 'rejected' && (
                    <div className="mm-state" role="status">
                      <strong>Update and reapply</strong>
                      <span>{application.review_note || 'Update the details below and send a new application for review.'}</span>
                    </div>
                  )}
                  <form className="mm-form" onSubmit={submitApplication}>
                    <label>Business name<input required minLength={2} maxLength={160} value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} /></label>
                    <label>Boutique URL<input required pattern="[A-Za-z0-9-]+" maxLength={80} placeholder="your-boutique" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /><span>midnightmarket / {form.slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'your-boutique'}</span></label>
                    <label>Contact name<input required minLength={2} maxLength={160} value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} /></label>
                    <label>Contact email<input required type="email" value={form.contactEmail} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} /></label>
                    <label>Contact phone<input required type="tel" minLength={7} maxLength={40} placeholder="+254 7XX XXX XXX" value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} /></label>
                    <label className="mm-form-wide">What do you sell?<textarea required minLength={20} maxLength={3000} rows={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
                    {error && <div className="mm-state mm-error mm-form-wide" role="alert">{error}</div>}
                    <button className="mm-button mm-form-wide" type="submit" disabled={working}>{working ? 'Sending application…' : application?.status === 'information_requested' ? 'Resubmit application' : 'Submit seller application'}</button>
                  </form>
                  </>
                )}
          {error && (loading || application) && <div className="mm-state mm-error" role="alert">{error}</div>}
        </div>
      </main>
    </>
  );
}
