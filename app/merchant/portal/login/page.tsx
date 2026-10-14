'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { marketSupabase } from '@/lib/marketSupabaseClient';

export default function MarketSellerLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    async function loadSession() {
      if (!marketSupabase) return;
      const { data, error: sessionError } = await marketSupabase.auth.getSession();
      if (sessionError) {
        if (active) setError(sessionError.message);
        return;
      }
      if (active && new URLSearchParams(window.location.search).get('flow') === 'recovery' && data.session) {
        setRecoveryMode(true);
      }
      if (active && data.session) {
        setSignedIn(true);
        setEmail(data.session.user.email || '');
        setPhone(data.session.user.phone || String(data.session.user.user_metadata.market_contact_phone || ''));
      }
    }
    void loadSession();
    return () => { active = false; };
  }, []);

  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    setMessage('');
    try {
      if (!marketSupabase) throw new Error('Market seller accounts are not configured.');
      const { error: resetError } = await marketSupabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/merchant/portal/login?flow=recovery`
      });
      if (resetError) throw resetError;
      setMessage('If a seller account exists for that email, Supabase will send a password reset link.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not request a password reset.');
    } finally {
      setWorking(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    setMessage('');
    try {
      if (!marketSupabase) throw new Error('Market seller accounts are not configured.');
      if (newPassword.length < 10) throw new Error('Choose a password with at least 10 characters.');
      const { error: updateError } = await marketSupabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      setMessage('Password updated. Opening Merchant Studio…');
      window.location.assign('/market');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update your password.');
    } finally {
      setWorking(false);
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    try {
      if (!marketSupabase) throw new Error('Market seller accounts are not configured.');
      const { data, error: signInError } = await marketSupabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw signInError;
      if (!data.session) throw new Error('Sign in did not create a Market session.');
      setSignedIn(true);
      setPhone(data.user.phone || String(data.user.user_metadata.market_contact_phone || ''));
      setMessage('Signed in to the separate Market seller workspace.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in to Merchant Studio.');
    } finally {
      setWorking(false);
    }
  }

  async function sendPhoneCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    setMessage('');
    try {
      if (!marketSupabase) throw new Error('Market seller accounts are not configured.');
      const { error: updateError } = await marketSupabase.auth.updateUser({ phone: phone.trim() });
      if (updateError) throw updateError;
      setCodeSent(true);
      setMessage('A verification code was sent to your phone.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send a phone verification code.');
    } finally {
      setWorking(false);
    }
  }

  async function verifyPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    setMessage('');
    try {
      if (!marketSupabase) throw new Error('Market seller accounts are not configured.');
      const { error: verifyError } = await marketSupabase.auth.verifyOtp({
        phone: phone.trim(),
        token: code.trim(),
        type: 'phone_change'
      });
      if (verifyError) throw verifyError;
      setMessage('Phone verified. Continue to your seller application or Merchant Studio.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not verify your phone.');
    } finally {
      setWorking(false);
    }
  }

  async function signOut() {
    if (!marketSupabase) return;
    const { error: signOutError } = await marketSupabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      return;
    }
    setSignedIn(false);
    setCodeSent(false);
    setPassword('');
    setMessage('');
  }

  return (
    <>
      <header className="mm-header">
        <Link className="mm-brand" href="/merchant/portal/login">MIDNIGHT <span>MARKET</span></Link>
      </header>
      <main className="mm-page mm-merchant-register">
        <div className="mm-register-card">
          <div className="mm-eyebrow">Private seller access</div>
          <h1>Merchant Studio sign in.</h1>
          <p className="mm-register-copy">This sign-in is separate from customer accounts. Only approved merchants can manage a boutique.</p>
          {recoveryMode ? (
            <form className="mm-form" onSubmit={updatePassword}>
              <label>New password<input required type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
              {error && <div className="mm-state mm-error mm-form-wide" role="alert">{error}</div>}
              <button className="mm-button mm-form-wide" type="submit" disabled={working}>{working ? 'Updating password…' : 'Set new password'}</button>
            </form>
          ) : !signedIn ? (
            resetMode ? (
              <form className="mm-form" onSubmit={requestPasswordReset}>
                <label>Seller account email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                {error && <div className="mm-state mm-error mm-form-wide" role="alert">{error}</div>}
                <button className="mm-button mm-form-wide" type="submit" disabled={working}>{working ? 'Sending reset link…' : 'Email me a reset link'}</button>
                <button className="mm-text-link mm-form-wide" type="button" onClick={() => { setResetMode(false); setError(''); setMessage(''); }}>Back to sign in</button>
              </form>
            ) : (
            <form className="mm-form" onSubmit={signIn}>
              <label>Email<input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              {error && <div className="mm-state mm-error mm-form-wide" role="alert">{error}</div>}
              <button className="mm-button mm-form-wide" type="submit" disabled={working}>{working ? 'Signing in…' : 'Sign in'}</button>
              <button className="mm-text-link mm-form-wide" type="button" onClick={() => { setResetMode(true); setError(''); setMessage(''); }}>Forgot password?</button>
            </form>
            )
          ) : (
            <div className="mm-form">
              <label>Phone for verification<input required type="tel" autoComplete="tel" placeholder="+254 7XX XXX XXX" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
              {!codeSent ? (
                <form onSubmit={sendPhoneCode}>
                  <button className="mm-button" type="submit" disabled={working || !phone}>{working ? 'Sending code…' : 'Verify phone'}</button>
                </form>
              ) : (
                <form onSubmit={verifyPhone}>
                  <label>Verification code<input required inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={8} value={code} onChange={(event) => setCode(event.target.value)} /></label>
                  <button className="mm-button" type="submit" disabled={working}>{working ? 'Verifying…' : 'Confirm phone'}</button>
                </form>
              )}
              <div className="mm-state">
                <Link className="mm-text-link" href="/merchant/register">Continue to seller application</Link>
                <Link className="mm-text-link" href="/market">Open Merchant Studio</Link>
                <button className="mm-text-link" type="button" onClick={signOut}>Sign out of Market</button>
              </div>
            </div>
          )}
          {error && signedIn && <div className="mm-state mm-error" role="alert">{error}</div>}
          {message && <div className="mm-state" role="status">{message}</div>}
          {!signedIn && <p className="mm-register-copy">Applying to sell? <Link className="mm-text-link" href="/merchant/portal/register">Create a seller account</Link></p>}
        </div>
      </main>
    </>
  );
}
