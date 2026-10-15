'use client';

import React from 'react';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';

const CONSENT_KEY = 'ob_user_consent';
const EXCLUDED_PATHS = ['/admin', '/market', '/merchant', '/checkout', '/payment'];

function hasAnalyticsConsent() {
  try {
    const consent: unknown = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
    return typeof consent === 'object' && consent !== null
      && 'analytics' in consent && consent.analytics === true
      && localStorage.getItem('ob_session_replay_consent') === 'true';
  } catch {
    return false;
  }
}

function canRecordPath(pathname: string) {
  return !EXCLUDED_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

function hasSensitiveQuery() {
  return [...new URLSearchParams(window.location.search).keys()]
    .some(key => /token|email|phone|otp|password|secret|code|state/i.test(key));
}

export function SessionReplayConsent() {
  const [show, setShow] = React.useState(false);
  const [hasSavedChoice, setHasSavedChoice] = React.useState(false);

  React.useEffect(() => {
    const hasChoice = localStorage.getItem(CONSENT_KEY) !== null;
    setHasSavedChoice(hasChoice);
    setShow(!hasChoice);
  }, []);

  function saveConsent(analytics: boolean) {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({
      necessary: true,
      analytics,
      personalization: false,
      marketing: false
    }));
    localStorage.setItem('ob_session_replay_consent', String(analytics));
    window.dispatchEvent(new Event('ob-consent-updated'));
    setShow(false);
    setHasSavedChoice(true);
  }

  const buttonStyle: React.CSSProperties = {
    border: '1px solid #d9dce3',
    borderRadius: 8,
    padding: '9px 12px',
    background: '#fff',
    color: '#20212a',
    cursor: 'pointer',
    fontWeight: 700
  };

  return (
    <>
      <button type="button" onClick={() => setShow(true)} style={{
        position: 'fixed', right: 12, bottom: 12, zIndex: 80,
        border: 0, borderRadius: 999, padding: '8px 12px',
        background: '#20212a', color: '#fff', cursor: 'pointer',
        fontSize: 12, fontWeight: 700
      }}>Privacy settings</button>
      {show && (
        <div role="dialog" aria-label="Privacy and analytics settings" style={{
          position: 'fixed', inset: 0, zIndex: 1000, display: 'grid',
          alignItems: 'end', background: 'rgba(15, 18, 28, .45)', padding: 16
        }}>
          <section style={{
            width: 'min(100%, 640px)', margin: '0 auto', padding: 22,
            borderRadius: 16, background: '#fff', color: '#20212a',
            boxShadow: '0 20px 60px rgba(0,0,0,.2)'
          }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Privacy and session replay</h2>
            <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.55 }}>
              Optional analytics help us understand how the site works. If enabled, a masked session replay may record page interactions; form and password values are masked. You can change this choice any time in Privacy settings.
            </p>
            {hasSavedChoice && <p role="status" style={{ fontSize: 13 }}>Analytics and replay are currently {hasAnalyticsConsent() ? 'enabled' : 'disabled'}.</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={buttonStyle} onClick={() => saveConsent(false)}>Decline analytics</button>
              <button type="button" style={{ ...buttonStyle, background: '#212133', color: '#fff' }} onClick={() => saveConsent(true)}>Allow analytics</button>
              {hasSavedChoice && <button type="button" style={buttonStyle} onClick={() => setShow(false)}>Close</button>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default function SessionReplay({ appName }: { appName: string }) {
  const pathname = usePathname();
  const initialized = useRef(false);
  const lastPage = useRef('');
  const projectKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

  useEffect(() => {
    function syncRecording() {
      if (!hasAnalyticsConsent()) {
        if (initialized.current) {
          posthog.stopSessionRecording();
          posthog.opt_out_capturing();
        }
        return;
      }
      if (!projectKey) return;

      if (!initialized.current) {
        initialized.current = true;
        posthog.init(projectKey, {
          api_host: apiHost,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: true,
          disable_session_recording: true,
          session_recording: {
            maskAllInputs: true,
            maskTextSelector: '.ph-no-capture, [data-private], [data-sensitive]'
          }
        });
      } else {
        posthog.opt_in_capturing();
      }

      if (!canRecordPath(pathname) || hasSensitiveQuery()) {
        posthog.stopSessionRecording();
        lastPage.current = '';
        return;
      }

      posthog.startSessionRecording();
      const page = pathname;
      if (lastPage.current !== page) {
        lastPage.current = page;
        posthog.register({ app_name: appName });
        posthog.capture('$pageview', { $current_url: `${window.location.origin}${pathname}`, app_name: appName });
      }
    }

    syncRecording();
    window.addEventListener('ob-consent-updated', syncRecording);
    return () => window.removeEventListener('ob-consent-updated', syncRecording);
  }, [apiHost, appName, pathname, projectKey]);

  return null;
}
