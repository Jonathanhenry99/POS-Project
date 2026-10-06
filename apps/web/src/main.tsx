import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import fontUrl from '@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2?url';
import { App } from './App';
import { initApp } from './lib/session';
import './lib/install';
import './index.css';

// Plus Jakarta Sans (subset latin, variabel 200-800) ikut di-cache service worker agar tampil saat offline.
const font = new FontFace('Jakarta', `url(${fontUrl}) format('woff2')`, { weight: '200 800', display: 'swap' });
document.fonts.add(font);
void font.load().catch(() => {});

void initApp();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
