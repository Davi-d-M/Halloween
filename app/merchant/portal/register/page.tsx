'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { marketSupabase } from '@/lib/marketSupabaseClient';

export default function MarketSellerAccountRegistrationPage() {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const password = String(formData.get('password') || '');
    setWorking(true);
    setError('');
    setMessage('');
    try {
      if (!marketSupabase) throw new Error('Market seller accounts are not configured.');
      const { data, error: signupError } = await marketSupabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, market_contact_phone: phone },
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
            <label>Full name<input name="name" required autoComplete="name" minLength={2} maxLength={160} /></label>
            <label>Email<input name="email" required type="email" autoComplete="email" maxLength={254} /></label>
            <label>Phone<input name="phone" required type="tel" autoComplete="tel" minLength={7} maxLength={40} placeholder="+254 7XX XXX XXX" /></label>
            <label>Password<input name="password" required type="password" autoComplete="new-password" minLength={10} maxLength={128} /></label>
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
