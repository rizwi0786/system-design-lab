import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { applySettings } from './lib/settings';
import { requestPersistentStorage } from './lib/backup';
requestPersistentStorage();

applySettings();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
