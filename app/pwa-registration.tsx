'use client';

import { useEffect } from 'react';

export default function PwaRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error('[PWA] Could not register the offline app worker:', error);
    });
  }, []);

  return null;
}
