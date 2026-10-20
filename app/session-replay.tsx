'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const CONSENT_KEY = 'ob_session_replay_consent';
const SHARED_CONSENT_KEY = 'ob_user_consent';
const SESSION_KEY = 'ob_first_party_replay_session:midnight-market';
const EXCLUDED_PATHS = ['/admin', '/market', '/merchant', '/checkout', '/payment'];
const MAX_EVENTS = 2500;
const URL_FIELDS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'xlink:href']);

function cleanUrl(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.search = '';
    url.hash = '';
    return url.origin === window.location.origin ? url.pathname : `${url.origin}${url.pathname}`;
  } catch {
    return '';
  }
}

function sanitizeReplayEvent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeReplayEvent);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    URL_FIELDS.has(key.toLowerCase()) && typeof nested === 'string'
      ? cleanUrl(nested)
      : sanitizeReplayEvent(nested)
  ]));
}

function consentEnabled() {
  try {
    const consent: unknown = JSON.parse(localStorage.getItem(SHARED_CONSENT_KEY) || 'null');
    return typeof consent === 'object' && consent !== null
      && 'analytics' in consent && consent.analytics === true
      && localStorage.getItem(CONSENT_KEY) === 'true';
  } catch {
    return false;
  }
}

function excludedPath(pathname: string) {
  return EXCLUDED_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

function hasQueryString() {
  return window.location.search.length > 0;
}

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function SessionReplayConsent() {
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(SHARED_CONSENT_KEY);
    setSaved(consent !== null);
    setShow(consent === null);
    setEnabled(consentEnabled());
  }, []);

  function saveChoice(allow: boolean) {
    localStorage.setItem(SHARED_CONSENT_KEY, JSON.stringify({
      necessary: true,
      analytics: allow,
      personalization: false,
      marketing: false
    }));
    localStorage.setItem(CONSENT_KEY, String(allow));
    setEnabled(allow);
    setSaved(true);
    setShow(false);
    window.dispatchEvent(new Event('ob-consent-updated'));
  }

  return (
    <>
      <button type="button" onClick={() => setShow(true)} style={{
        position: 'fixed', right: 12, bottom: 12, zIndex: 80, border: 0,
        borderRadius: 999, padding: '8px 12px', background: '#20212a',
        color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700
      }}>Privacy settings</button>
      {show && <div role="dialog" aria-modal="true" aria-label="Privacy and session replay" style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'grid',
        alignItems: 'end', background: 'rgba(15,18,28,.45)', padding: 16
      }}>
        <section style={{ width: 'min(100%,640px)', margin: '0 auto', padding: 22, borderRadius: 16, background: '#fff', color: '#20212a', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Privacy and session replay</h2>
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.55 }}>Optional masked session replays help us improve the site. Text and form values are masked, and private seller, checkout, and account areas are not recorded. You can change your choice here any time.</p>
          {saved && <p role="status" style={{ fontSize: 13 }}>Session replay is currently {enabled ? 'enabled' : 'disabled'}.</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => saveChoice(false)} style={{ border: '1px solid #d9dce3', borderRadius: 8, padding: '9px 12px', background: '#fff', cursor: 'pointer', fontWeight: 700 }}>Decline replay</button>
            <button type="button" onClick={() => saveChoice(true)} style={{ border: 0, borderRadius: 8, padding: '9px 12px', background: '#212133', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Allow masked replay</button>
            {saved && <button type="button" onClick={() => setShow(false)} style={{ border: '1px solid #d9dce3', borderRadius: 8, padding: '9px 12px', background: '#fff', cursor: 'pointer', fontWeight: 700 }}>Close</button>}
          </div>
        </section>
      </div>}
    </>
  );
}

export default function SessionReplay() {
  const pathname = usePathname();

  useEffect(() => {
    if (!consentEnabled() || excludedPath(pathname) || hasQueryString()) return;

    const sessionId = getSessionId();
    let stopped = false;
    let sending = false;
    let count = 0;
    let stop: (() => void) | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    const pending: unknown[] = [];
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    async function flush() {
      if (sending || pending.length === 0) return;
      sending = true;
      const batch = pending.splice(0, 40);
      try {
        const response = await fetch('/api/session-replays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, appName: 'midnight-market', pagePath: pathname, events: batch }),
          keepalive: true
        });
        if (!response.ok) throw new Error(`Replay upload failed (${response.status}).`);
      } catch (error) {
        console.error('[SessionReplay] Could not save replay batch:', error);
        pending.unshift(...batch);
      } finally {
        sending = false;
        if (pending.length && !retryTimer) retryTimer = setTimeout(() => {
          retryTimer = undefined;
          void flush();
        }, 3000);
      }
    }

    async function startRecording() {
      try {
        const { record } = await import('rrweb');
        if (stopped) return;

        stop = record({
          emit(event) {
            if (stopped) return;
            if (hasQueryString()) {
              stopped = true;
              stop?.();
              void flush();
              return;
            }
            if (count >= MAX_EVENTS) return;
            count++;
            pending.push(sanitizeReplayEvent(event));
            if (pending.length >= 40) void flush();
          },
          maskAllInputs: true,
          maskTextSelector: '*',
          blockClass: 'session-replay-block',
          ignoreClass: 'session-replay-ignore',
          recordCanvas: false,
          inlineStylesheet: false,
          collectFonts: false
        });
        if (!stop) {
          console.error('[SessionReplay] The recorder did not start.');
          return;
        }
        interval = setInterval(() => void flush(), 5000);
      } catch (error) {
        console.error('[SessionReplay] Could not start the recorder:', error);
      }
    }
    void startRecording();
    const onConsentChange = () => {
      if (!consentEnabled()) {
        stopped = true;
        stop?.();
        if (interval) clearInterval(interval);
        void flush();
      }
    };
    window.addEventListener('ob-consent-updated', onConsentChange);

    return () => {
      stopped = true;
      stop?.();
      if (interval) clearInterval(interval);
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener('ob-consent-updated', onConsentChange);
      void flush();
    };
  }, [pathname]);

  return null;
}
