import React from 'react';
import { createRoot } from 'react-dom/client';
import AppEnhanced from './AppEnhanced.jsx';
import './styles.css';
import './evidence.css';
import './incident-flow.css';
import './role-views.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppEnhanced />
  </React.StrictMode>,
);
