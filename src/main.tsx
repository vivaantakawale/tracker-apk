import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { isNative } from './lib/platform';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support for the hosted web build (service workers need HTTPS or localhost).
// The Android app already bundles its files, so it doesn't need one.
if (import.meta.env.PROD && !isNative && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline caching is optional */
    });
  });
}
