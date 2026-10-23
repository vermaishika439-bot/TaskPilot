import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AppProvider } from './state/AppState.jsx';
import { ThemeProvider } from './state/Theme.jsx';
import { ProfileProvider } from './state/Profile.jsx';
import './styles/tokens.css';
import './styles/global.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/companion.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ProfileProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </ProfileProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
