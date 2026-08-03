import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Box,
  Building2,
  Camera,
  Check,
  CircleAlert,
  Clock3,
  FileCheck2,
  MapPin,
  PackageCheck,
  ScanLine,
  ShieldCheck,
  Truck,
  UserRound,
  Weight,
} from 'lucide-react';

const logisticsSteps = [
  {
    title: 'Pedido recibido',
    text: 'Pedido INT-1048 creado manualmente por Operaciones.',
    icon: Box,
    role: 'Operaciones',
    status: 'Registrado',
    time: '10:08 a. m.',
    detail: 'order',
  },
  {
    title: 'Picking',
    text: '3 de 3 artículos localizados y verificados.',
    icon: ScanLine,
    role: 'Almacén',
    status: 'Completado',
    time: '10:22 a. m.',
    detail: 'picking',
  },
  {
    title: 'Empaque',
    text: 'El peso no coincide. Se bloquea el despacho hasta corregir.',
    icon: CircleAlert,
    role: 'Empaque',
    status: 'Requiere atención',
    time: '10:51 a. m.',
    detail: 'weight',
    warning: true,
  },
  {
    title: 'Validación',
    text: 'Artículo faltante agregado. Peso final: 4.2 kg.',
    icon: PackageCheck,
    role: 'Supervisor',
    status: 'Validado',
    time: '10:57 a. m.',
    detail: 'validated',
  },
  {
    title: 'Despacho',
    text: 'Asignado a Carlos Ruiz, vehículo F-204.',
    icon: Truck,
    role: 'Carlos Ruiz',
    status: 'En ruta',
    time: '11:18 a. m.',
    detail: 'dispatch',
  },
  {
    title: 'Entrega',
    text: 'Andrea Pérez confirma recepción mediante PIN.',
    icon: ShieldCheck,
    role: 'Andrea Pérez',
    status: 'Entregado',
    time: '3:42 p. m.',
    detail: 'delivered',
  },
];

const constructionSteps = [
  {
    title: 'Escaneo',
    text: 'Apartamento 304 identificado desde su QR.',
    icon: ScanLine,
    role: 'Operador',
    status: 'Contexto identificado',
    time: '8:12 a. m.',
    detail: 'scan',
  },
  {
    title: 'Primera pintura',
    text: 'El operador registra 65 % de avance.',
    icon: Building2,
    role: 'Luis Gómez',
    status: 'En progreso',
    time: '8:15 a. m.',
    detail: 'progress',
  },
  {
    title: 'Evidencia',
    text: 'Dos fotografías quedan vinculadas a la etapa.',
    icon: Camera,
    role: 'Luis Gómez',
    status: 'Evidencia guardada',
    time: '10:48 a. m.',
    detail: 'evidence',
  },
  {
    title: 'Incidencia',
    text: 'Corrección pendiente en muro norte.',
    icon: CircleAlert,
    role: 'Terminaciones',
    status: 'Requiere atención',
    time: '10:51 a. m.',
    detail: 'incident',
    warning: true,
  },
  {
    title: 'Supervisión',
    text: 'El supervisor solicita corrección.',
    icon: ShieldCheck,
    role: 'María Santos',
    status: 'Corrección solicitada',
    time: '11:18 a. m.',
    detail: 'review',
  },
  {
    title: 'Historial',
    text: 'Cada acción queda fechada y atribuida.',
    icon: Clock3,
    role: 'Sistema',
    status: 'Trazabilidad actualizada',
    time: '11:19 a. m.',
    detail: 'history',
  },
];

function DetailPanel({ demo, detail }) {
  if (demo === 'logistics') {
    if (detail === 'order') {
      return (
        <div className="scene-panel order-scene">
          <div className="scene-heading"><div><small>NUEVO PEDIDO</small><h3>INT-1048</h3></div><span className="chip">Prioridad normal</span></div>
          <div className="mini-grid">
            <Info icon={UserRound} label="Cliente" value="Andrea Pérez" />
            <Info icon={MapPin} label="Entrega" value="Santo Domingo" />
            <Info icon={Clock3} label="Promesa" value="Hoy · 5:00 p. m." />
          </div>
          <div className="product-list">
            <Product name="Set de vasos térmicos" qty="1" />
            <Product name="Termo personalizado" qty="1" />
            <Product name="Caja de regalo" qty="1" />
          </div>
          <div className="auto-note"><Check size={16} /> Al guardar, INTAP Trace crea automáticamente el recorrido logístico.</div>
        </div>
      );
    }

    if (detail === 'picking') {
      return (
        <div className="scene-panel">
          <div className="scene-heading"><div><small>TAREA DE ALMACÉN</small><h3>Preparar pedido</h3></div><span className="chip success">3 de 3</span></div>
          <div className="check-list">
            <CheckRow label="Set de vasos térmicos" meta="Pasillo A · Estante 04" />
            <CheckRow label="Termo personalizado" meta="Pasillo C · Estante 11" />
            <CheckRow label="Caja de regalo" meta="Zona de empaque" />
          </div>
        </div>
      );
    }

    if (detail === 'weight') {
      return (
        <div className="scene-panel alert-scene">
          <div className="scene-heading"><div><small>CONTROL AUTOMÁTICO</small><h3>Diferencia de peso</h3></div><CircleAlert /></div>
          <div className="weight-compare">
            <div><span>Peso esperado</span><strong>4.2 kg</strong></div>
            <ArrowRight />
            <div className="bad"><span>Peso registrado</span><strong>3.5 kg</strong></div>
          </div>
          <p>El despacho queda bloqueado. El sistema solicita revisar los artículos antes de continuar.</p>
        </div>
      );
    }

    if (detail === 'validated') {
      return (
        <div className="scene-panel">
          <div className="scene-heading"><div><small>REVISIÓN COMPLETADA</small><h3>Pedido corregido</h3></div><PackageCheck /></div>
          <div className="correction-card"><span>Artículo recuperado</span><strong>Caja de regalo</strong><small>Agregada al paquete y fotografiada</small></div>
          <div className="mini-grid two"><Info icon={Weight} label="Peso final" value="4.2 kg" /><Info icon={Camera} label="Evidencias" value="2 fotografías" /></div>
        </div>
      );
    }

    if (detail === 'dispatch') {
      return (
        <div className="scene-panel">
          <div className="scene-heading"><div><small>DESPACHO CONFIRMADO</small><h3>Salimos rumbo al cliente</h3></div><Truck /></div>
          <div className="driver-card"><div className="avatar">CR</div><div><strong>Carlos Ruiz</strong><span>Conductor asignado</span></div><div className="vehicle">F-204</div></div>
          <div className="public-message">“¡Salimos rumbo a ti! Te avisaremos cuando estemos cerca.”</div>
        </div>
      );
    }

    return (
      <div className="scene-panel delivered-scene">
        <div className="success-seal"><Check /></div>
        <small>ENTREGA CONFIRMADA</small>
        <h3>Pedido recibido</h3>
        <p>Andrea Pérez confirmó la entrega con el PIN <strong>4721</strong>.</p>
        <div className="mini-grid two"><Info icon={Clock3} label="Hora" value="3:42 p. m." /><Info icon={FileCheck2} label="Comprobante" value="Generado" /></div>
      </div>
    );
  }

  if (detail === 'scan') {
    return (
      <div className="scene-panel phone-scene">
        <div className="phone-top"><span>INTAP Trace</span><small>Conexión segura</small></div>
        <div className="qr-placeholder"><ScanLine /></div>
        <small>CONTEXTO IDENTIFICADO</small>
        <h3>Apartamento 304</h3>
        <p>Residencial Vista Real · Torre B</p>
        <button className="fake-primary">Iniciar tarea</button>
      </div>
    );
  }

  if (detail === 'progress') {
    return (
      <div className="scene-panel">
        <div className="scene-heading"><div><small>PRIMERA PINTURA</small><h3>Registrar avance</h3></div><span className="chip">Paso 2 de 4</span></div>
        <div className="question">¿Se completó la primera mano?</div>
        <div className="choice-row"><span className="selected">Sí</span><span>No</span></div>
        <div className="range-wrap"><div><span>Avance declarado</span><strong>65 %</strong></div><div className="range-track"><i style={{ width: '65%' }} /></div></div>
      </div>
    );
  }

  if (detail === 'evidence') {
    return (
      <div className="scene-panel">
        <div className="scene-heading"><div><small>EVIDENCIAS</small><h3>Trabajo documentado</h3></div><Camera /></div>
        <div className="photo-grid"><div><span>Muro principal</span></div><div><span>Área norte</span></div></div>
        <div className="auto-note"><Check size={16} /> Las fotos quedan vinculadas a la etapa, responsable, fecha y apartamento.</div>
      </div>
    );
  }

  if (detail === 'incident') {
    return (
      <div className="scene-panel alert-scene">
        <div className="scene-heading"><div><small>INCIDENCIA CREADA</small><h3>Corrección de pintura</h3></div><CircleAlert /></div>
        <div className="incident-grid"><Info icon={Building2} label="Ubicación" value="Muro norte" /><Info icon={UserRound} label="Asignado a" value="Terminaciones" /><Info icon={Clock3} label="Fecha límite" value="Mañana · 3:00 p. m." /></div>
      </div>
    );
  }

  if (detail === 'review') {
    return (
      <div className="scene-panel">
        <div className="scene-heading"><div><small>REVISIÓN DEL SUPERVISOR</small><h3>Evidencia evaluada</h3></div><ShieldCheck /></div>
        <p className="review-copy">“Corregir acabado cerca de la esquina superior antes de continuar con la segunda mano.”</p>
        <div className="review-actions"><span>Aprobar</span><span className="danger-action">Solicitar corrección</span></div>
      </div>
    );
  }

  return (
    <div className="scene-panel">
      <div className="scene-heading"><div><small>HISTORIAL DEL APARTAMENTO</small><h3>Línea de tiempo verificable</h3></div><Clock3 /></div>
      <div className="compact-history"><HistoryRow time="8:12" label="QR escaneado" /><HistoryRow time="8:15" label="Primera pintura iniciada" /><HistoryRow time="10:48" label="2 evidencias guardadas" /><HistoryRow time="11:18" label="Corrección solicitada" /></div>
    </div>
  );
}

function Info({ icon: Icon, label, value }) {
  return <div className="info-item"><Icon size={17} /><span>{label}</span><strong>{value}</strong></div>;
}

function Product({ name, qty }) {
  return <div className="product-row"><span>{name}</span><strong>x{qty}</strong></div>;
}

function CheckRow({ label, meta }) {
  return <div className="check-row"><span><Check size={15} /></span><div><strong>{label}</strong><small>{meta}</small></div></div>;
}

function HistoryRow({ time, label }) {
  return <div className="history-row"><strong>{time}</strong><span>{label}</span><Check size={15} /></div>;
}

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
          <p>Dos recorridos interactivos con datos simulados para mostrar cómo una actividad se convierte en un proceso trazable.</p>
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
        <div className="stage-layout">
          <div className="stage-copy">
            <div className={`stage-icon ${current.warning ? 'warning' : ''}`}><CurrentIcon /></div>
            <div className="step-count">PASO {step + 1} DE {steps.length}</div>
            <h1>{current.title}</h1>
            <p>{current.text}</p>
          </div>
          <DetailPanel demo={demo} detail={current.detail} />
        </div>

        <div className="status-panel">
          <div><span>Responsable</span><strong>{current.role}</strong></div>
          <div><span>Estado</span><strong>{current.status}</strong></div>
          <div><span>Hora</span><strong>{current.time}</strong></div>
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
        <div className="timeline-head"><small>RECORRIDO</small><strong>{demo === 'logistics' ? 'Del pedido a la entrega' : 'Del trabajo a la evidencia'}</strong></div>
        {steps.map((item, index) => (
          <button className={`timeline-item ${index < step ? 'done' : ''} ${index === step ? 'active' : ''}`} key={item.title} onClick={() => setStep(index)}>
            <span>{index < step ? <Check size={14} /> : index + 1}</span>
            <div><strong>{item.title}</strong><small>{index < step ? 'Completado' : index === step ? 'En pantalla' : 'Pendiente'}</small></div>
          </button>
        ))}
      </aside>
    </main>
  );
}

export default App;
