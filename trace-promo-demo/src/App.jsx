import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  Check,
  Download,
  Eye,
  FileText,
  MapPin,
  ScanLine,
  ShieldCheck,
  Trash2,
  Truck,
  Upload,
  X,
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
      { role: 'public', title: 'Vista del cliente', subtitle: 'Consulta el avance y abre el reporte', view: 'public' },
    ],
  },
  logistics: {
    name: 'Logística',
    subject: 'Pedido INT-1048',
    intro: 'Registrar el pedido, ejecutar controles y confirmar la entrega.',
    steps: [
      { role: 'operador', title: 'Ingreso del pedido', subtitle: 'Registra los datos de la orden', view: 'order' },
      { role: 'operador', title: 'Control de preparación', subtitle: 'Confirma picking, empaque y evidencia', view: 'picking' },
      { role: 'supervisor', title: 'Validación', subtitle: 'Revisa y corrige la diferencia detectada', view: 'validation' },
      { role: 'operador', title: 'Despacho y entrega', subtitle: 'Registra salida y recepción', view: 'delivery' },
      { role: 'public', title: 'Vista del cliente', subtitle: 'Sigue el pedido y abre el reporte', view: 'public' },
    ],
  },
};

function Brand() {
  return <div className="brand"><span>IT</span><div><strong>INTAP Trace</strong><small>Trazabilidad operativa</small></div></div>;
}

function Metric({ value, label }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

function TimelineRow({ label, time, alert }) {
  return <div className={`timeline-row ${alert ? 'alert' : ''}`}><span><Check size={12}/></span><div><b>{label}</b><small>{time}</small></div></div>;
}

function Home({ onOpen }) {
  return <main className="page home">
    <header className="site-header"><Brand/><nav><span>Soluciones</span><span>Beneficios</span><span>Seguridad</span><button>Solicitar información</button></nav></header>
    <section className="hero-grid">
      <div className="hero-copy">
        <div className="eyebrow">CONTROL · EVIDENCIA · CONFIANZA</div>
        <h1>Tu operación, demostrada paso a paso.</h1>
        <p>INTAP Trace convierte cada actividad en un flujo trazable con responsables, evidencias, incidencias y seguimiento en tiempo real.</p>
        <div className="hero-actions"><button className="primary">Solicitar información <ArrowRight size={18}/></button><button className="secondary" onClick={() => onOpen('construction')}>Ver plataforma</button></div>
        <div className="metrics"><Metric value="2,458" label="Etapas registradas"/><Metric value="32" label="Incidencias activas"/><Metric value="1,842" label="Entregas verificadas"/><Metric value="98%" label="Cumplimiento SLA"/></div>
      </div>
      <ProductMockup/>
    </section>
    <section className="solution-grid">
      <Solution icon={Building2} title="Construcción" text="Gestiona avance, evidencia, incidencias, correcciones y supervisión." onClick={() => onOpen('construction')} chips={['Avance por etapa','Evidencia','Incidencias','Supervisión']}/>
      <Solution icon={Truck} title="Logística" text="Controla pedidos, picking, empaque, correcciones, despacho y entrega." onClick={() => onOpen('logistics')} chips={['Pedidos','Picking','Evidencia','Entrega']}/>
    </section>
  </main>;
}

function Solution({ icon: Icon, title, text, onClick, chips }) {
  return <button className="solution-card" onClick={onClick}><div className="solution-icon"><Icon/></div><div><h2>{title}</h2><p>{text}</p><div className="chips">{chips.map(item => <span key={item}>{item}</span>)}</div><b>Explorar solución <ArrowRight size={16}/></b></div></button>;
}

function ProductMockup() {
  return <div className="product-mockup"><div className="desktop"><div className="mock-top"><Brand/><span>Resumen operativo</span></div><div className="mock-body"><aside><span>Inicio</span><span>Operaciones</span><span>Tareas</span><span>Evidencias</span><span>Incidencias</span></aside><section><div className="mini-stats"><Metric value="24" label="Operaciones activas"/><Metric value="18" label="En ejecución"/><Metric value="32" label="Incidencias"/></div><h4>Actividad reciente</h4><TimelineRow label="Inicio de obra · Apartamento 304" time="08:15"/><TimelineRow label="Avance registrado · 65%" time="10:42"/><TimelineRow label="Corrección solicitada" time="11:05" alert/></section></div></div><div className="phone"><small>Entrega #INT-1048</small><strong>En ruta</strong><TimelineRow label="Pedido confirmado" time="09:12"/><TimelineRow label="Empaque validado" time="10:57"/><TimelineRow label="Despacho en ruta" time="11:22"/></div></div>;
}

function Simulator({ type, onBack }) {
  const data = scenarios[type];
  const [step, setStep] = useState(0);
  const [evidence, setEvidence] = useState([]);
  const [evidenceLinked, setEvidenceLinked] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const current = data.steps[step];
  const progress = ((step + 1) / data.steps.length) * 100;
  const roleLabel = current.role === 'operador' ? 'Operador' : current.role === 'supervisor' ? 'Supervisor' : 'Cliente final';

  if (reportOpen) return <FullReport type={type} evidence={evidence} onClose={() => setReportOpen(false)}/>;

  return <main className="page simulator">
    <header className="sim-header"><button className="back" onClick={onBack}><ArrowLeft size={17}/> Volver</button><Brand/><div className="context"><span>{data.name}</span><strong>{data.subject}</strong></div></header>
    <div className="sim-grid">
      <aside className="step-nav"><div className="scenario-title"><small>RECORRIDO OPERATIVO</small><h2>{data.name}</h2><p>{data.intro}</p></div>{data.steps.map((item, index) => <button key={item.title} className={index === step ? 'active' : ''} onClick={() => setStep(index)}><span>{index < step ? <Check size={14}/> : index + 1}</span><div><strong>{item.title}</strong><small>{item.subtitle}</small></div></button>)}</aside>
      <section className="workspace">
        <div className="workspace-top"><div><span className="role-badge">Vista: {roleLabel}</span><h1>{current.title}</h1><p>{current.subtitle}</p></div><div className="step-indicator">{step + 1} / {data.steps.length}</div></div>
        <div className="progress"><i style={{ width: `${progress}%` }}/></div>
        <div className="screen-frame"><Screen type={type} view={current.view} evidence={evidence} setEvidence={setEvidence} evidenceLinked={evidenceLinked} setEvidenceLinked={setEvidenceLinked} onOpenReport={() => setReportOpen(true)}/></div>
        <div className="sim-actions"><button disabled={step === 0} onClick={() => setStep(value => value - 1)}>Anterior</button><button className="primary" onClick={() => step === data.steps.length - 1 ? setReportOpen(true) : setStep(value => value + 1)}>{step === data.steps.length - 1 ? 'Ver reporte' : 'Continuar'} {step === data.steps.length - 1 ? <FileText size={17}/> : <ArrowRight size={17}/>}</button></div>
      </section>
    </div>
  </main>;
}

function EvidenceUploader({ files, onChange, linked, onLinked, title, description, compact = false }) {
  const inputRef = useRef(null);
  useEffect(() => () => files.forEach(item => URL.revokeObjectURL(item.url)), []);

  const addFiles = event => {
    const selected = Array.from(event.target.files || []).filter(file => file.type.startsWith('image/'));
    const next = selected.slice(0, Math.max(0, 6 - files.length)).map(file => ({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, url: URL.createObjectURL(file) }));
    if (next.length) { onChange([...files, ...next]); onLinked(false); }
    event.target.value = '';
  };

  const remove = id => {
    const target = files.find(item => item.id === id);
    if (target) URL.revokeObjectURL(target.url);
    onChange(files.filter(item => item.id !== id));
    onLinked(false);
  };

  const size = bytes => bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

  return <div className={compact ? 'evidence-inline' : 'form-screen evidence-form'}>
    <div className="form-head"><div><small>{title}</small><h3>Adjuntar evidencia</h3></div><span className="secure"><ShieldCheck size={15}/> Registro seguro</span></div>
    <input ref={inputRef} className="visually-hidden" type="file" accept="image/*" multiple onChange={addFiles}/>
    <button type="button" className="photo-upload interactive" onClick={() => inputRef.current?.click()}><Camera size={30}/><strong>{files.length ? 'Agregar más fotografías' : 'Agregar fotografía'}</strong><small>JPG, PNG o WebP · máximo 6 imágenes</small></button>
    {files.length ? <div className="uploaded-grid">{files.map((item, index) => <article className="uploaded-card" key={item.id}><img src={item.url} alt={`Evidencia ${index + 1}`}/><div><strong>Foto {index + 1}</strong><span>{item.file.name}</span><small>{size(item.file.size)}</small></div><button type="button" onClick={() => remove(item.id)} aria-label="Eliminar fotografía"><Trash2 size={16}/></button></article>)}</div> : <div className="photo-preview"><div>Foto 1</div><div>Foto 2</div></div>}
    <label className="field"><span>Descripción</span><input defaultValue={description}/></label>
    <button type="button" className="primary" disabled={!files.length || linked} onClick={() => onLinked(true)}>{linked ? <><Check size={17}/> Evidencia vinculada</> : <><Upload size={17}/> Vincular evidencia</>}</button>
    {linked && <div className="linked-message"><Check size={16}/><span>{files.length} {files.length === 1 ? 'imagen quedó vinculada' : 'imágenes quedaron vinculadas'} al evento.</span></div>}
  </div>;
}

function Screen(props) {
  const { type, view, evidence, setEvidence, evidenceLinked, setEvidenceLinked, onOpenReport } = props;
  if (type === 'construction') {
    if (view === 'scan') return <MobileShell title="Identificar ubicación"><div className="scan-box"><ScanLine size={46}/></div><h3>Apartamento 304</h3><p>Residencial Vista Real · Torre B</p><button className="full primary">Continuar</button></MobileShell>;
    if (view === 'control') return <FormScreen title="Registrar control" subtitle="Primera pintura"><Field label="Responsable" value="Luis Gómez"/><Field label="Tipo de control" value="Avance de etapa"/><Field label="Ubicación" value="Apartamento 304 · Muro norte"/><Choice label="¿Se completó la primera mano?"/><Field label="Porcentaje de avance" value="65 %"/><textarea defaultValue="Se detecta acabado irregular en esquina superior."/><button className="primary">Guardar evento</button></FormScreen>;
    if (view === 'evidence') return <EvidenceUploader files={evidence} onChange={setEvidence} linked={evidenceLinked} onLinked={setEvidenceLinked} title="Primera pintura · Apartamento 304" description="Estado actual del muro norte"/>;
    if (view === 'review') return <ReviewScreen title="Revisión del supervisor" status="Corrección solicitada" evidence={evidence} items={[['Responsable','Luis Gómez'],['Avance declarado','65 %'],['Evidencias',`${evidence.length} fotografía${evidence.length === 1 ? '' : 's'}`],['Incidencia','Acabado irregular'],['Acción correctiva','Rehacer esquina superior antes de segunda mano']]}/>;
    return <PublicConstruction evidence={evidence} onOpenReport={onOpenReport}/>;
  }
  if (view === 'order') return <FormScreen title="Registrar pedido" subtitle="Nueva ejecución logística"><Field label="Número de orden" value="INT-1048"/><Field label="Cliente" value="Andrea Pérez"/><Field label="Teléfono" value="809-555-0184"/><Field label="Dirección" value="Ensanche Naco, Santo Domingo"/><Field label="Entrega prometida" value="Hoy · 5:00 p. m."/><button className="primary">Crear recorrido logístico</button></FormScreen>;
  if (view === 'picking') return <PreparationScreen evidence={evidence} setEvidence={setEvidence} linked={evidenceLinked} setLinked={setEvidenceLinked}/>;
  if (view === 'validation') return <ReviewScreen title="Validación y corrección" status="Corrección aplicada" evidence={evidence} items={[['Pedido','INT-1048'],['Diferencia detectada','-0.7 kg'],['Causa','Caja de regalo faltante'],['Corrección','Artículo agregado y peso verificado'],['Peso final','4.2 kg'],['Resultado','Despacho liberado']]}/>;
  if (view === 'delivery') return <FormScreen title="Confirmar entrega" subtitle="Pedido INT-1048"><Field label="Conductor" value="Carlos Ruiz"/><Field label="Vehículo" value="F-204"/><Field label="Receptor" value="Andrea Pérez"/><Field label="PIN de entrega" value="4721"/><div className="signature">Firma del receptor</div><button className="primary">Cerrar entrega</button></FormScreen>;
  return <PublicLogistics evidence={evidence} onOpenReport={onOpenReport}/>;
}

function PreparationScreen({ evidence, setEvidence, linked, setLinked }) {
  return <div className="form-screen"><div className="form-head"><div><small>PEDIDO INT-1048</small><h3>Control de preparación</h3></div><span className="secure"><ShieldCheck size={15}/> Registro seguro</span></div><div className="form-grid"><Checklist items={['Set de vasos térmicos','Termo personalizado','Caja de regalo']}/><Field label="Peso esperado" value="4.2 kg"/><Field label="Peso registrado" value="3.5 kg"/><button className="danger">Reportar diferencia</button></div><div style={{ marginTop: 24 }}><EvidenceUploader compact files={evidence} onChange={setEvidence} linked={linked} onLinked={setLinked} title="Empaque · Pedido INT-1048" description="Contenido y estado del paquete antes del despacho"/></div></div>;
}

function MobileShell({ title, children }) { return <div className="mobile-shell"><div className="mobile-top"><Brand/><small>{title}</small></div>{children}</div>; }
function FormScreen({ title, subtitle, children }) { return <div className="form-screen"><div className="form-head"><div><small>{subtitle}</small><h3>{title}</h3></div><span className="secure"><ShieldCheck size={15}/> Registro seguro</span></div><div className="form-grid">{children}</div></div>; }
function Field({ label, value }) { return <label className="field"><span>{label}</span><input defaultValue={value}/></label>; }
function Choice({ label }) { return <div className="choice"><span>{label}</span><div><button className="selected">Sí</button><button>No</button></div></div>; }
function Checklist({ items }) { return <div className="checklist">{items.map(item => <label key={item}><input type="checkbox" defaultChecked/><span>{item}</span></label>)}</div>; }

function ReviewScreen({ title, status, items, evidence }) {
  const [open, setOpen] = useState(false);
  return <div className="review-screen"><div className="review-head"><div><small>SUPERVISIÓN</small><h3>{title}</h3></div><span>{status}</span></div><div className="review-list">{items.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="evidence-strip"><Camera size={20}/><span>{evidence.length} evidencias adjuntas</span><button disabled={!evidence.length} onClick={() => setOpen(true)}>Ver evidencia</button></div><textarea defaultValue="La corrección fue documentada y validada antes de continuar."/><div className="review-actions"><button>Aprobar</button><button className="danger">Solicitar corrección</button></div>{open && <EvidenceModal evidence={evidence} watermark="INTAP Trace · Registro operativo" onClose={() => setOpen(false)}/>}</div>;
}

function PublicConstruction({ evidence, onOpenReport }) {
  const [open, setOpen] = useState(false);
  return <div className="public-screen"><div className="public-head"><Brand/><span>Actualizado hoy · 11:18 a. m.</span></div><div className="public-hero"><Building2/><div><small>RESIDENCIAL VISTA REAL</small><h3>Apartamento 304</h3><p>Seguimiento de avance autorizado por el proyecto.</p></div><strong>65%</strong></div><div className="public-progress"><i style={{ width: '65%' }}/></div><div className="public-cards"><div><span>Etapa actual</span><strong>Primera pintura</strong></div><div><span>Última actualización</span><strong>Corrección solicitada</strong></div><div><span>Próxima revisión</span><strong>Mañana · 3:00 p. m.</strong></div></div><div className="public-timeline"><TimelineRow label="Inicio de primera pintura" time="8:15 a. m."/><TimelineRow label="Evidencia vinculada" time="10:48 a. m."/><TimelineRow label="Supervisor solicita corrección" time="11:18 a. m." alert/></div><div className="delivery-card"><Camera/><div><span>Evidencias disponibles</span><strong>{evidence.length} fotografías</strong></div><button disabled={!evidence.length} onClick={() => setOpen(true)}>Ver evidencia</button><button className="primary" onClick={onOpenReport}>Ver reporte completo</button></div>{open && <EvidenceModal evidence={evidence} watermark="Residencial Vista Real · Apartamento 304" onClose={() => setOpen(false)}/>}</div>;
}

function PublicLogistics({ evidence, onOpenReport }) {
  const [open, setOpen] = useState(false);
  return <div className="public-screen"><div className="public-head"><Brand/><span>Seguimiento seguro</span></div><div className="public-hero"><Truck/><div><small>PEDIDO INT-1048</small><h3>Tu pedido está en ruta</h3><p>Entrega estimada hoy antes de las 5:00 p. m.</p></div><strong>75%</strong></div><div className="public-progress"><i style={{ width: '75%' }}/></div><div className="public-timeline"><TimelineRow label="Pedido confirmado" time="9:12 a. m."/><TimelineRow label="Diferencia de peso detectada" time="10:47 a. m." alert/><TimelineRow label="Corrección aplicada y empaque validado" time="10:57 a. m."/><TimelineRow label="Despacho en ruta" time="11:22 a. m."/></div><div className="delivery-card"><MapPin/><div><span>Destino</span><strong>Ensanche Naco, Santo Domingo</strong></div><button disabled={!evidence.length} onClick={() => setOpen(true)}>Ver evidencia</button><button className="primary" onClick={onOpenReport}>Ver reporte completo</button></div>{open && <EvidenceModal evidence={evidence} watermark="Pedido INT-1048 · Evidencia logística" onClose={() => setOpen(false)}/>}</div>;
}

function EvidenceModal({ evidence, watermark, onClose }) {
  return <div style={ui.overlay}><div style={ui.modal}><div style={ui.modalHead}><div><small style={ui.kicker}>EVIDENCIA VERIFICADA</small><h2 style={{ margin: '5px 0 0' }}>Galería de evidencias</h2></div><button style={ui.iconButton} onClick={onClose}><X/></button></div><EvidenceGallery evidence={evidence} watermark={watermark}/></div></div>;
}

function EvidenceGallery({ evidence, watermark }) {
  if (!evidence.length) return <div style={ui.empty}><Camera size={34}/><p>No se adjuntaron fotografías en este recorrido.</p></div>;
  return <div style={ui.gallery}>{evidence.map((item, index) => <figure style={ui.figure} key={item.id}><img style={ui.image} src={item.url} alt={`Evidencia ${index + 1}`}/><figcaption style={ui.watermark}>{watermark}<br/>Evidencia {index + 1} · INTAP Trace</figcaption></figure>)}</div>;
}

function FullReport({ type, evidence, onClose }) {
  const construction = type === 'construction';
  const watermark = construction ? 'Residencial Vista Real · Apartamento 304' : 'Pedido INT-1048 · Evidencia logística';
  return <main style={ui.reportPage}><header style={ui.reportHeader}><Brand/><div style={ui.reportActions}><button style={ui.outlineButton}><Download size={17}/> Descargar reporte</button><button style={ui.iconButton} onClick={onClose}><X/></button></div></header><section style={ui.reportBody}><div style={ui.reportTitle}><div><small style={ui.kicker}>REPORTE OPERATIVO</small><h1 style={ui.h1}>{construction ? 'Avance y control de obra' : 'Trazabilidad completa del pedido'}</h1><p style={ui.lead}>{construction ? 'Apartamento 304 · Primera pintura · Residencial Vista Real' : 'Pedido INT-1048 · Andrea Pérez · Entrega en Santo Domingo'}</p></div><div style={ui.reportStatus}><Check size={20}/><div><span>Estado del reporte</span><strong>{construction ? 'Corrección en seguimiento' : 'Corrección validada · En ruta'}</strong></div></div></div><div style={ui.summaryGrid}>{(construction ? [['Responsable','Luis Gómez'],['Avance','65 %'],['Incidencia','Acabado irregular'],['Próxima revisión','Mañana · 3:00 p. m.']] : [['Responsable','Equipo de almacén'],['Diferencia detectada','-0.7 kg'],['Corrección','Caja agregada'],['Peso final','4.2 kg']]).map(([label, value]) => <div style={ui.summaryCard} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><section style={ui.section}><h2>Historial verificable</h2>{construction ? <><TimelineRow label="Control iniciado por Luis Gómez" time="8:15 a. m."/><TimelineRow label="Avance de 65 % registrado" time="10:42 a. m."/><TimelineRow label="Evidencias vinculadas al apartamento" time="10:48 a. m."/><TimelineRow label="Corrección solicitada por supervisión" time="11:18 a. m." alert/></> : <><TimelineRow label="Pedido INT-1048 registrado" time="9:12 a. m."/><TimelineRow label="Picking completado" time="10:03 a. m."/><TimelineRow label="Diferencia de peso detectada" time="10:47 a. m." alert/><TimelineRow label="Caja agregada y peso validado" time="10:57 a. m."/><TimelineRow label="Despacho liberado y en ruta" time="11:22 a. m."/></>}</section><section style={ui.section}><div style={ui.sectionHead}><div><h2>Evidencias del proceso</h2><p style={{ margin: 0, color: '#718096' }}>Cada imagen identifica el proyecto u operación a la que pertenece.</p></div><span style={ui.count}>{evidence.length} archivos</span></div><EvidenceGallery evidence={evidence} watermark={watermark}/></section></section></main>;
}

const ui = {
  overlay: { position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,35,69,.55)', padding: 24, display: 'grid', placeItems: 'center' },
  modal: { width: 'min(1100px,100%)', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: 18, padding: 24, boxShadow: '0 30px 80px rgba(15,35,69,.25)' },
  modalHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  iconButton: { width: 42, height: 42, border: '1px solid #d8e0ea', borderRadius: 10, background: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' },
  kicker: { color: '#1458e8', fontWeight: 800, letterSpacing: '.12em' },
  gallery: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 },
  figure: { position: 'relative', margin: 0, minHeight: 220, borderRadius: 14, overflow: 'hidden', background: '#e9eef5' },
  image: { width: '100%', height: '100%', minHeight: 220, objectFit: 'cover', display: 'block' },
  watermark: { position: 'absolute', left: 12, right: 12, bottom: 12, padding: '9px 11px', borderRadius: 8, background: 'rgba(8,25,52,.72)', color: '#fff', fontSize: 11, lineHeight: 1.45, letterSpacing: '.03em' },
  empty: { minHeight: 220, border: '1px dashed #b9c7d9', borderRadius: 14, display: 'grid', placeItems: 'center', alignContent: 'center', color: '#718096' },
  reportPage: { minHeight: '100vh', background: '#f4f7fb', color: '#10213d' },
  reportHeader: { height: 82, padding: '0 max(24px,5vw)', background: '#fff', borderBottom: '1px solid #e1e7ef', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  reportActions: { display: 'flex', gap: 10, alignItems: 'center' },
  outlineButton: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 14px', border: '1px solid #ccd6e3', borderRadius: 10, background: '#fff', color: '#223551', fontWeight: 700 },
  reportBody: { width: 'min(1180px,calc(100% - 32px))', margin: '0 auto', padding: '48px 0 70px' },
  reportTitle: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 },
  h1: { margin: '10px 0', fontSize: 'clamp(36px,5vw,64px)', letterSpacing: '-.045em' },
  lead: { margin: 0, color: '#65758d', fontSize: 18 },
  reportStatus: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 260, padding: 16, border: '1px solid #dce4ee', borderRadius: 14, background: '#fff' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14, marginTop: 32 },
  summaryCard: { padding: 18, border: '1px solid #dde5ef', borderRadius: 14, background: '#fff' },
  section: { marginTop: 24, padding: 24, border: '1px solid #dde5ef', borderRadius: 16, background: '#fff' },
  sectionHead: { display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', marginBottom: 18 },
  count: { padding: '7px 10px', borderRadius: 999, background: '#eef4ff', color: '#1458e8', fontWeight: 700, fontSize: 12 },
};

export default function App() {
  const [scenario, setScenario] = useState(null);
  return scenario ? <Simulator type={scenario} onBack={() => setScenario(null)}/> : <Home onOpen={setScenario}/>;
}
