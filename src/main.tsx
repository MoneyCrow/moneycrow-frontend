import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { config } from './wagmi';
import { TronProvider } from './context/TronContext';
import App from './App';
import './index.css';

const queryClient = new QueryClient();

// ── Error Boundary ────────────────────────────────────────────────────────────
// Catches any silent render errors and displays them instead of a blank page.

type EBState = { error: Error | null };

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          fontFamily: 'JetBrains Mono, monospace',
          background: '#0e0e0e',
          color: '#f07178',
          padding: 32,
          minHeight: '100vh',
        }}>
          <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
            ✗ App render error — check browser console for details
          </p>
          <pre style={{ fontSize: 12, color: '#546e7a', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider theme={darkTheme({
            accentColor: '#7ee8fa',
            accentColorForeground: '#000',
            borderRadius: 'small',
            fontStack: 'system',
          })}>
            {/* TronProvider runs in parallel with WagmiProvider — they don't
                share state. Components decide which to use based on the
                user-selected chain. TronLink isn't EIP-1193 so we can't
                wedge it into wagmi's connector model. */}
            <TronProvider>
              <App />
            </TronProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
