import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import App from './App.jsx';
import Landing from './Landing.jsx';

export default function Root() {
  const [view, setView] = useState('landing');

  if (view === 'platform') {
    return <>
      <button className="landing-return" onClick={() => setView('landing')}><ArrowLeft size={17}/> Volver a información</button>
      <App/>
    </>;
  }

  return <Landing onOpenPlatform={() => setView('platform')}/>;
}
