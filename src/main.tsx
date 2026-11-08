import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Gracefully catch and log unhandled promise rejections (such as dev-server websocket drops)
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const reasonStr = (typeof reason === 'string' ? reason : reason?.message || String(reason || '')).toLowerCase();
    if (
      reasonStr.includes('websocket') ||
      reasonStr.includes('ws') ||
      reasonStr.includes('failed to connect') ||
      reasonStr.includes('closed without opened')
    ) {
      console.warn('[vite-hmr] WebSocket connection issue captured gracefully:', reason?.message || reason);
      event.preventDefault();
      return;
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
