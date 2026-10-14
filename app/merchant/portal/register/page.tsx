'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { marketSupabase } from '@/lib/marketSupabaseClient';

export default function MarketSellerAccountRegistrationPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    setMessage('');
    try {
      if (!marketSupabase) throw new Error('Market seller accounts are not configured.');
      const { data, error: signupError } = await marketSupabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: { full_name: form.name.trim(), market_contact_phone: form.phone.trim() },
          emailRedirectTo: `${window.location.origin}/merchant/portal/login`
        }
      });
      if (signupError) throw signupError;
      if (!data.user) throw new Error('The seller account could not be created.');
      if (!data.session) {
        setMessage('Account created. Check your email to verify it, then sign in here and complete phone verification.');
        return;
      }
      router.push('/merchant/register');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create your Market seller account.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <header className="mm-header">
        <Link className="mm-brand" href="/merchant/portal/login">MIDNIGHT <span>MARKET</span></Link>
      </header>
      <main className="mm-page mm-merchant-register">
        <div className="mm-register-card">
          <div className="mm-eyebrow">Private seller access</div>
          <h1>Create a Market seller account.</h1>
          <p className="mm-register-copy">This account is separate from customer sign-in. Creating one does not approve a shop or grant selling access.</p>
          <form className="mm-form" onSubmit={createAccount}>
            <label>Full name<input required autoComplete="name" minLength={2} maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label>Email<input required type="email" autoComplete="email" maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label>Phone<input required type="tel" autoComplete="tel" minLength={7} maxLength={40} placeholder="+254 7XX XXX XXX" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
            <label>Password<input required type="password" autoComplete="new-password" minLength={10} maxLength={128} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
            {error && <div className="mm-state mm-error mm-form-wide" role="alert">{error}</div>}
            {message && <div className="mm-state mm-form-wide" role="status">{message}</div>}
            <button className="mm-button mm-form-wide" type="submit" disabled={working}>{working ? 'Creating account…' : 'Create seller account'}</button>
          </form>
          <p className="mm-register-copy">Already registered? <Link className="mm-text-link" href="/merchant/portal/login">Sign in to Merchant Studio</Link></p>
        </div>
      </main>
    </>
  );
}
