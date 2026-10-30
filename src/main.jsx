import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ENV_ERROR } from './lib/env'
import App from './App.jsx'
import ConfigErrorScreen from './components/ConfigErrorScreen.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

const root = createRoot(document.getElementById('root'));

if (ENV_ERROR) {
  root.render(<ConfigErrorScreen error={ENV_ERROR} />);
} else {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
