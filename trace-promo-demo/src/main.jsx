import React from 'react';
import { createRoot } from 'react-dom/client';
import LandingApp from './LandingApp.jsx';
import './styles.css';
import './evidence.css';
import './landing.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LandingApp />
  </React.StrictMode>,
);
