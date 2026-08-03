import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Building2,
  Check,
  CircleAlert,
  Clock3,
  PackageCheck,
  ScanLine,
  ShieldCheck,
  Truck,
} from 'lucide-react';

const logisticsSteps = [
  { title: 'Pedido recibido', text: 'Pedido INT-1048 creado manualmente por Operaciones.', icon: Box },
  { title: 'Picking', text: '3 de 3 artículos localizados y verificados.', icon: ScanLine },
  { title: 'Empaque', text: 'El peso no coincide. Se bloquea el despacho hasta corregir.', icon: CircleAlert, warning: true },
  { title: 'Validación', text: 'Artículo faltante agregado. Peso final: 4.2 kg.', icon: PackageCheck },
  { title: 'Despacho', text: 'Asignado a Carlos Ruiz, vehículo F-204.', icon: Truck },
  { title: 'Entrega', text: 'Andrea Pérez confirma recepción mediante PIN.', icon: ShieldCheck },
];

const constructionSteps = [
  { title: 'Escaneo', text: 'Apartamento 304 identificado desde su QR.', icon: ScanLine },
  { title: 'Primera pintura', text: 'El operador registra 65 % de avance.', icon: Building2 },
  { title: 'Evidencia', text: 'Dos fotografías quedan vinculadas a la etapa.', icon: PackageCheck },
  { title: 'Incidencia', text: 'Corrección pendiente en muro norte.', icon: CircleAlert, warning: true },
  { title: 'Supervisión', text: 'El supervisor solicita corrección.', icon: ShieldCheck },
  { title: 'Historial', text: 'Cada acción queda fechada y atribuida.', icon: Clock3 },
];

function App() {
  const [demo, setDemo] = useState('home');
  const [step, setStep] = useState(0);
  const steps = useMemo(() => (demo === 'logistics' ? logisticsSteps : constructionSteps), [demo]);

  const openDemo = (name) => {
    setDemo(name);
    setStep(0);
  };

  if (demo === 'home') {
    return (
      <main className="shell home-shell">
        <header className="brandbar">
          <div className="brandmark">IT</div>
          <div>
            <strong>INTAP Trace</strong>
            <span>Demostración promocional</span>
          </div>
        </header>

        <section className="hero">
          <span className="eyebrow">CONTROL · EVIDENCIA · CONFIANZA</span>
          <h1>Tu operación, demostrada paso a paso.</h1>
          <p>
            Dos recorridos interactivos con datos simulados para mostrar cómo una actividad se convierte en un proceso trazable.
          </p>
        </section>

        <section className="demo-grid">
          <button className="demo-card" onClick={() => openDemo('construction')}>
            <div className="icon-wrap"><Building2 /></div>
            <small>DEMO 01</small>
            <h2>Construcción</h2>
            <p>Avance del apartamento 304, evidencia, incidencia y supervisión.</p>
            <span>Iniciar recorrido <ArrowRight size={18} /></span>
          </button>

          <button className="demo-card" onClick={() => openDemo('logistics')}>
            <div className="icon-wrap"><Truck /></div>
            <small>DEMO 02</small>
            <h2>Logística</h2>
            <p>Desde que entra el pedido hasta que el cliente confirma la entrega.</p>
            <span>Iniciar recorrido <ArrowRight size={18} /></span>
          </button>
        </section>
      </main>
    );
  }

  const current = steps[step];
  const CurrentIcon = current.icon;
  const progress = ((step + 1) / steps.length) * 100;

  return (
    <main className="shell demo-shell">
      <header className="topbar">
        <button className="back" onClick={() => setDemo('home')}><ArrowLeft size={18} /> Volver</button>
        <div className="demo-label">{demo === 'logistics' ? 'LOGÍSTICA · PEDIDO INT-1048' : 'CONSTRUCCIÓN · APARTAMENTO 304'}</div>
      </header>

      <section className="stage-card">
        <div className="progress-track"><div style={{ width: `${progress}%` }} /></div>
        <div className={`stage-icon ${current.warning ? 'warning' : ''}`}><CurrentIcon /></div>
        <div className="step-count">PASO {step + 1} DE {steps.length}</div>
        <h1>{current.title}</h1>
        <p>{current.text}</p>

        <div className="status-panel">
          <div><span>Responsable</span><strong>{demo === 'logistics' ? ['Operaciones','Almacén','Empaque','Supervisor','Carlos Ruiz','Andrea Pérez'][step] : ['Operador','Luis Gómez','Luis Gómez','Terminaciones','María Santos','Sistema'][step]}</strong></div>
          <div><span>Estado</span><strong>{current.warning ? 'Requiere atención' : step === steps.length - 1 ? 'Completado' : 'Registrado'}</strong></div>
          <div><span>Hora</span><strong>{['10:08 a. m.','10:22 a. m.','10:51 a. m.','10:57 a. m.','11:18 a. m.','3:42 p. m.'][step]}</strong></div>
        </div>

        <div className="actions">
          <button disabled={step === 0} onClick={() => setStep((value) => value - 1)}>Anterior</button>
          <button className="primary" onClick={() => step === steps.length - 1 ? setStep(0) : setStep((value) => value + 1)}>
            {step === steps.length - 1 ? 'Repetir demo' : 'Continuar'}
            {step === steps.length - 1 ? <Check size={18} /> : <ArrowRight size={18} />}
          </button>
        </div>
      </section>

      <aside className="timeline">
        {steps.map((item, index) => (
          <div className={`timeline-item ${index < step ? 'done' : ''} ${index === step ? 'active' : ''}`} key={item.title}>
            <span>{index < step ? <Check size={14} /> : index + 1}</span>
            <div><strong>{item.title}</strong><small>{index < step ? 'Completado' : index === step ? 'En pantalla' : 'Pendiente'}</small></div>
          </div>
        ))}
      </aside>
    </main>
  );
}

export default App;
