import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  Check,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  MapPin,
  PackageCheck,
  ScanLine,
  ShieldCheck,
  Truck,
  UserRound,
} from 'lucide-react';

const scenarios = {
  construction: {
    name: 'Construcción',
    subject: 'Apartamento 304',
    intro: 'Registrar avance, evidencia e incidencia desde el lugar de trabajo.',
    steps: [
      { role: 'operador', title: 'Identificación', subtitle: 'Escanea el QR del apartamento', view: 'scan' },
      { role: 'operador', title: 'Registro de control', subtitle: 'Completa el control de primera pintura', view: 'control' },
      { role: 'operador', title: 'Evidencia', subtitle: 'Adjunta fotografías del trabajo', view: 'evidence' },
      { role: 'supervisor', title: 'Revisión', subtitle: 'Evalúa el registro y solicita corrección', view: 'review' },
      { role: 'public', title: 'Vista del cliente', subtitle: 'Consulta el avance sin entrar al sistema', view: 'public' },
    ],
  },
  logistics: {
    name: 'Logística',
    subject: 'Pedido INT-1048',
    intro: 'Registrar el pedido, ejecutar controles y confirmar la entrega.',
    steps: [
      { role: 'operador', title: 'Ingreso del pedido', subtitle: 'Registra los datos de la orden', view: 'order' },
      { role: 'operador', title: 'Control de preparación', subtitle: 'Confirma picking y empaque', view: 'picking' },
      { role: 'supervisor', title: 'Validación', subtitle: 'Revisa la diferencia detectada', view: 'validation' },
      { role: 'operador', title: 'Despacho y entrega', subtitle: 'Registra salida y recepción', view: 'delivery' },
      { role: 'public', title: 'Vista del cliente', subtitle: 'Sigue el pedido en tiempo real', view: 'public' },
    ],
  },
};

function Brand() {
  return <div className="brand"><span>IT</span><div><strong>INTAP Trace</strong><small>Trazabilidad operativa</small></div></div>;
}

function Home({ onOpen }) {
  return (
    <main className="page home">
      <header className="site-header"><Brand /><nav><span>Soluciones</span><span>Beneficios</span><span>Seguridad</span><button>Solicitar información</button></nav></header>
      <section className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow">CONTROL · EVIDENCIA · CONFIANZA</div>
          <h1>Tu operación, demostrada paso a paso.</h1>
          <p>INTAP Trace convierte cada actividad en un flujo trazable con responsables, evidencias, incidencias y seguimiento en tiempo real.</p>
          <div className="hero-actions"><button className="primary">Solicitar información <ArrowRight size={18}/></button><button className="secondary" onClick={() => onOpen('construction')}>Ver plataforma</button></div>
          <div className="metrics"><Metric value="2,458" label="Etapas registradas"/><Metric value="32" label="Incidencias activas"/><Metric value="1,842" label="Entregas verificadas"/><Metric value="98%" label="Cumplimiento SLA"/></div>
        </div>
        <ProductMockup />
      </section>
      <section className="solution-grid">
        <Solution icon={Building2} title="Construcción" text="Gestiona proyectos y apartamentos con visibilidad total del avance, evidencia, incidencias y supervisión." onClick={() => onOpen('construction')} chips={['Avance por etapa','Evidencia','Incidencias','Supervisión']}/>
        <Solution icon={Truck} title="Logística" text="Controla pedidos de extremo a extremo: picking, empaque, despacho y entrega confirmada." onClick={() => onOpen('logistics')} chips={['Pedidos','Picking','Despacho','Entrega']}/>
      </section>
    </main>
  );
}

function Metric({ value, label }) { return <div className="metric"><strong>{value}</strong><span>{label}</span></div>; }
function Solution({ icon: Icon, title, text, onClick, chips }) { return <button className="solution-card" onClick={onClick}><div className="solution-icon"><Icon/></div><div><h2>{title}</h2><p>{text}</p><div className="chips">{chips.map(c=><span key={c}>{c}</span>)}</div><b>Explorar solución <ArrowRight size={16}/></b></div></button>; }

function ProductMockup() {
  return <div className="product-mockup"><div className="desktop"><div className="mock-top"><Brand/><span>Resumen operativo</span></div><div className="mock-body"><aside><span>Inicio</span><span>Operaciones</span><span>Tareas</span><span>Evidencias</span><span>Incidencias</span></aside><section><div className="mini-stats"><Metric value="24" label="Operaciones activas"/><Metric value="18" label="En ejecución"/><Metric value="32" label="Incidencias"/></div><h4>Actividad reciente</h4><TimelineRow label="Inicio de obra · Apartamento 304" time="08:15"/><TimelineRow label="Avance registrado · 65%" time="10:42"/><TimelineRow label="Incidencia reportada" time="11:05" alert/></section></div></div><div className="phone"><small>Entrega #ENT-9841</small><strong>En ruta</strong><TimelineRow label="Pedido confirmado" time="09:12"/><TimelineRow label="Picking completado" time="10:03"/><TimelineRow label="Despacho en ruta" time="11:22"/></div></div>;
}
function TimelineRow({ label, time, alert }) { return <div className={`timeline-row ${alert?'alert':''}`}><span><Check size={12}/></span><div><b>{label}</b><small>{time}</small></div></div>; }

function Simulator({ type, onBack }) {
  const data = scenarios[type];
  const [step, setStep] = useState(0);
  const current = data.steps[step];
  const progress = ((step + 1) / data.steps.length) * 100;
  const roleLabel = current.role === 'operador' ? 'Operador' : current.role === 'supervisor' ? 'Supervisor' : 'Cliente final';
  return <main className="page simulator"><header className="sim-header"><button className="back" onClick={onBack}><ArrowLeft size={17}/> Volver</button><Brand/><div className="context"><span>{data.name}</span><strong>{data.subject}</strong></div></header><div className="sim-grid"><aside className="step-nav"><div className="scenario-title"><small>RECORRIDO OPERATIVO</small><h2>{data.name}</h2><p>{data.intro}</p></div>{data.steps.map((item,i)=><button key={item.title} className={i===step?'active':''} onClick={()=>setStep(i)}><span>{i<step?<Check size={14}/>:i+1}</span><div><strong>{item.title}</strong><small>{item.subtitle}</small></div></button>)}</aside><section className="workspace"><div className="workspace-top"><div><span className="role-badge">Vista: {roleLabel}</span><h1>{current.title}</h1><p>{current.subtitle}</p></div><div className="step-indicator">{step+1} / {data.steps.length}</div></div><div className="progress"><i style={{width:`${progress}%`}}/></div><div className="screen-frame"><Screen type={type} view={current.view}/></div><div className="sim-actions"><button disabled={step===0} onClick={()=>setStep(s=>s-1)}>Anterior</button><button className="primary" onClick={()=>setStep(s=>s===data.steps.length-1?0:s+1)}>{step===data.steps.length-1?'Reiniciar recorrido':'Continuar'} <ArrowRight size={17}/></button></div></section></div></main>;
}

function Screen({ type, view }) {
  if (type === 'construction') {
    if (view === 'scan') return <MobileShell title="Identificar ubicación"><div className="scan-box"><ScanLine size={46}/></div><h3>Apartamento 304</h3><p>Residencial Vista Real · Torre B</p><button className="full primary">Continuar</button></MobileShell>;
    if (view === 'control') return <FormScreen title="Registrar control" subtitle="Primera pintura"><Field label="Responsable" value="Luis Gómez"/><Field label="Tipo de control" value="Avance de etapa"/><Field label="Ubicación" value="Apartamento 304 · Muro norte"/><Choice label="¿Se completó la primera mano?"/><Field label="Porcentaje de avance" value="65 %"/><textarea placeholder="Observaciones">Se detecta acabado irregular en esquina superior.</textarea><button className="primary">Guardar evento</button></FormScreen>;
    if (view === 'evidence') return <FormScreen title="Adjuntar evidencia" subtitle="Primera pintura · Apartamento 304"><div className="photo-upload"><Camera size={30}/><span>Agregar fotografía</span></div><div className="photo-preview"><div>Foto 1</div><div>Foto 2</div></div><Field label="Descripción" value="Estado actual del muro norte"/><button className="primary">Vincular evidencia</button></FormScreen>;
    if (view === 'review') return <ReviewScreen title="Revisión del supervisor" status="Requiere corrección" items={[['Responsable','Luis Gómez'],['Avance declarado','65 %'],['Evidencias','2 fotografías'],['Incidencia','Acabado irregular']]} />;
    return <PublicConstruction/>;
  }
  if (view === 'order') return <FormScreen title="Registrar pedido" subtitle="Nueva ejecución logística"><Field label="Número de orden" value="INT-1048"/><Field label="Cliente" value="Andrea Pérez"/><Field label="Teléfono" value="809-555-0184"/><Field label="Dirección" value="Ensanche Naco, Santo Domingo"/><Field label="Entrega prometida" value="Hoy · 5:00 p. m."/><button className="primary">Crear recorrido logístico</button></FormScreen>;
  if (view === 'picking') return <FormScreen title="Control de preparación" subtitle="Pedido INT-1048"><Checklist items={['Set de vasos térmicos','Termo personalizado','Caja de regalo']}/><Field label="Peso esperado" value="4.2 kg"/><Field label="Peso registrado" value="3.5 kg"/><button className="danger">Reportar diferencia</button></FormScreen>;
  if (view === 'validation') return <ReviewScreen title="Validación de incidencia" status="Despacho bloqueado" items={[['Pedido','INT-1048'],['Diferencia','-0.7 kg'],['Causa','Caja de regalo faltante'],['Acción','Corregir antes de despacho']]} />;
  if (view === 'delivery') return <FormScreen title="Confirmar entrega" subtitle="Pedido INT-1048"><Field label="Conductor" value="Carlos Ruiz"/><Field label="Vehículo" value="F-204"/><Field label="Receptor" value="Andrea Pérez"/><Field label="PIN de entrega" value="4721"/><div className="signature">Firma del receptor</div><button className="primary">Cerrar entrega</button></FormScreen>;
  return <PublicLogistics/>;
}

function MobileShell({ title, children }) { return <div className="mobile-shell"><div className="mobile-top"><Brand/><small>{title}</small></div>{children}</div>; }
function FormScreen({ title, subtitle, children }) { return <div className="form-screen"><div className="form-head"><div><small>{subtitle}</small><h3>{title}</h3></div><span className="secure"><ShieldCheck size={15}/> Registro seguro</span></div><div className="form-grid">{children}</div></div>; }
function Field({ label, value }) { return <label className="field"><span>{label}</span><input value={value} readOnly/></label>; }
function Choice({ label }) { return <div className="choice"><span>{label}</span><div><button className="selected">Sí</button><button>No</button></div></div>; }
function Checklist({ items }) { return <div className="checklist">{items.map(item=><label key={item}><input type="checkbox" defaultChecked/><span>{item}</span></label>)}</div>; }
function ReviewScreen({ title, status, items }) { return <div className="review-screen"><div className="review-head"><div><small>SUPERVISIÓN</small><h3>{title}</h3></div><span>{status}</span></div><div className="review-list">{items.map(([a,b])=><div key={a}><span>{a}</span><strong>{b}</strong></div>)}</div><div className="evidence-strip"><Camera size={20}/><span>2 evidencias adjuntas</span><button>Ver evidencia</button></div><textarea defaultValue="Corregir el acabado antes de continuar con la siguiente etapa."/><div className="review-actions"><button>Aprobar</button><button className="danger">Solicitar corrección</button></div></div>; }
function PublicConstruction() { return <div className="public-screen"><div className="public-head"><Brand/><span>Actualizado hoy · 11:18 a. m.</span></div><div className="public-hero"><Building2/><div><small>RESIDENCIAL VISTA REAL</small><h3>Apartamento 304</h3><p>Seguimiento de avance autorizado por el proyecto.</p></div><strong>65%</strong></div><div className="public-progress"><i style={{width:'65%'}}/></div><div className="public-cards"><div><span>Etapa actual</span><strong>Primera pintura</strong></div><div><span>Última actualización</span><strong>Corrección solicitada</strong></div><div><span>Próxima revisión</span><strong>Mañana · 3:00 p. m.</strong></div></div><div className="public-timeline"><TimelineRow label="Inicio de primera pintura" time="8:15 a. m."/><TimelineRow label="Avance registrado · 65%" time="10:48 a. m."/><TimelineRow label="Supervisor solicita corrección" time="11:18 a. m." alert/></div></div>; }
function PublicLogistics() { return <div className="public-screen"><div className="public-head"><Brand/><span>Seguimiento seguro</span></div><div className="public-hero"><Truck/><div><small>PEDIDO INT-1048</small><h3>Tu pedido está en ruta</h3><p>Entrega estimada hoy antes de las 5:00 p. m.</p></div><strong>75%</strong></div><div className="public-progress"><i style={{width:'75%'}}/></div><div className="public-timeline"><TimelineRow label="Pedido confirmado" time="9:12 a. m."/><TimelineRow label="Picking completado" time="10:03 a. m."/><TimelineRow label="Empaque validado" time="10:57 a. m."/><TimelineRow label="Despacho en ruta" time="11:22 a. m."/></div><div className="delivery-card"><MapPin/><div><span>Destino</span><strong>Ensanche Naco, Santo Domingo</strong></div><button>Contactar soporte</button></div></div>; }

export default function App() {
  const [scenario, setScenario] = useState(null);
  return scenario ? <Simulator type={scenario} onBack={()=>setScenario(null)}/> : <Home onOpen={setScenario}/>;
}
