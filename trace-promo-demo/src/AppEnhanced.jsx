import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Building2, Camera, Check, ClipboardCheck,
  Eye, Hotel, MapPin, ShieldCheck, Sparkles, Trash2, Truck,
  UserRoundCheck, Utensils
} from 'lucide-react';

const sectors = [
  { title: 'Construcción', icon: Building2, text: 'Avance, evidencias, incidencias, correcciones y supervisión.', active: 'construction' },
  { title: 'Logística', icon: Truck, text: 'Pedidos, picking, empaque, incidencias, despacho y entrega.', active: 'logistics' },
  { title: 'Restaurantes', icon: Utensils, text: 'Preparación, tiempos, calidad, despacho y entrega.' },
  { title: 'Limpieza y conserjería', icon: Sparkles, text: 'Rutinas, checklist, evidencia y validación del supervisor.' },
  { title: 'Hotelería', icon: Hotel, text: 'Habitaciones, mantenimiento, solicitudes e incidencias.' },
  { title: 'Seguridad', icon: ShieldCheck, text: 'Rondas, novedades, alertas, evidencias y respuesta.' },
];

function Brand() {
  return <div className="brand"><span>IT</span><div><strong>INTAP Trace</strong><small>Trazabilidad operativa</small></div></div>;
}

function Home({ open }) {
  useEffect(() => window.scrollTo(0, 0), []);
  return <main className="trace-home page">
    <header className="site-header"><Brand/><button className="primary" onClick={() => open('construction')}>Ver plataforma</button></header>

    <section className="trace-hero">
      <div className="trace-hero-copy">
        <small>CONTROL · EVIDENCIA · CONFIANZA</small>
        <h1>Tu operación, demostrada paso a paso.</h1>
        <p>Cada actividad queda vinculada a una persona, un lugar, una hora, una evidencia y un resultado verificable.</p>
        <button className="primary" onClick={() => open('construction')}>Explorar construcción <ArrowRight size={18}/></button>
      </div>
      <div className="trace-dashboard desktop-summary">
        <div className="dash-head"><Brand/><b>Resumen operativo</b></div>
        <div className="dash-stats"><span><b>24</b> Operaciones activas</span><span><b>18</b> En ejecución</span><span><b>32</b> Incidencias</span></div>
        <h3>Actividad reciente</h3>
        <p>✓ Avance registrado · Apartamento 304</p>
        <p>✓ Empaque validado · INT-1048</p>
        <p className="alert-text">! Incidencia enviada a almacén</p>
      </div>
    </section>

    <section className="mobile-value-strip">
      <article><strong>Responsable</strong><span>Quién ejecutó la actividad</span></article>
      <article><strong>Evidencia</strong><span>Fotos y datos con contexto</span></article>
      <article><strong>Resultado</strong><span>Seguimiento claro y verificable</span></article>
    </section>

    <section className="sector-section">
      <div className="sector-heading"><small>SECTORES</small><h2>Una misma lógica de control para distintas operaciones.</h2><p>La plataforma adapta responsables, controles, incidencias y reportes a cada tipo de servicio.</p></div>
      <div className="sector-grid">{sectors.map(({title,icon:Icon,text,active}) => <button key={title} className={`sector-card ${active?'sector-active':''}`} onClick={() => active && open(active)}><Icon/><div><h3>{title}</h3><p>{text}</p>{active && <b>Explorar solución <ArrowRight size={15}/></b>}</div></button>)}</div>
    </section>

    <section className="mobile-process-section">
      <small>CÓMO FUNCIONA</small>
      <h2>Del trabajo en campo al reporte que recibe el cliente.</h2>
      <div className="mobile-process-grid">
        {['Registrar la actividad','Adjuntar evidencia','Reportar incidencias','Recibir y aprobar correcciones','Compartir la vista autorizada'].map((item,index)=><article key={item}><span>{index+1}</span><strong>{item}</strong></article>)}
      </div>
    </section>

    <section className="privacy-section">
      <ShieldCheck/>
      <div><small>INFORMACIÓN POR ROL</small><h2>Cada persona ve únicamente lo que necesita.</h2><p>Los datos internos, responsables, departamentos e incidencias permanecen en la operación. El cliente recibe una vista clara con el estado, los avances y las evidencias autorizadas.</p></div>
    </section>
  </main>;
}

const logisticsSteps = [
  ['Ingreso del pedido','Registrar la orden'],
  ['Preparación','Controlar picking y empaque'],
  ['Reportar incidencia','Dirigir el caso al área responsable'],
  ['Respuesta y corrección','Revisar la solución y aprobarla'],
  ['Reporte interno','Consultar el historial completo'],
];

const constructionSteps = [
  ['Identificación','Ubicar el punto de control'],
  ['Registro','Completar el control'],
  ['Evidencia','Adjuntar fotografías'],
  ['Supervisión','Revisar y solicitar corrección'],
  ['Reporte interno','Consultar el historial completo'],
];

function Simulator({ type, back }) {
  const steps = type === 'logistics' ? logisticsSteps : constructionSteps;
  const [step,setStep] = useState(0);
  const [publicView,setPublicView] = useState(false);
  const [files,setFiles] = useState([]);
  const [incident,setIncident] = useState({ reported:false, department:'Almacén y empaque', priority:'Alta', detail:'El peso registrado es 0.7 kg menor al esperado.', approved:false });

  useEffect(() => window.scrollTo(0, 0), [step, publicView]);

  const canContinue = type !== 'logistics' || step < 2 || (step === 2 && incident.reported) || (step === 3 && incident.approved) || step === 4;
  const next = () => { if (step === steps.length - 1) setPublicView(true); else if (canContinue) setStep(value => value + 1); };
  const role = publicView ? 'Cliente final' : step === 3 ? (type === 'logistics' ? 'Departamento responsable' : 'Supervisor') : step === 4 ? 'Administrador / Supervisor' : 'Operador';

  if (publicView) return <PublicClientView type={type} files={files} onBack={() => setPublicView(false)} onExit={back}/>;

  return <main className="simulator page">
    <header className="sim-header"><button className="back" onClick={back}><ArrowLeft size={17}/> Volver</button><Brand/><strong>{type==='logistics'?'Pedido INT-1048':'Apartamento 304'}</strong></header>
    <div className="sim-grid">
      <aside className="step-nav"><small>RECORRIDO OPERATIVO</small><h2>{type==='logistics'?'Logística':'Construcción'}</h2>{steps.map((item,index)=><button className={step===index?'active':''} key={item[0]} onClick={()=>setStep(index)}><span>{index<step?<Check size={14}/>:index+1}</span><div><strong>{item[0]}</strong><small>{item[1]}</small></div></button>)}</aside>
      <section className="workspace">
        <div className="workspace-top"><div><span className="role-badge">Vista: {role}</span><h1>{steps[step][0]}</h1><p>{steps[step][1]}</p></div><b>{step+1} / {steps.length}</b></div>
        <div className="progress"><i style={{width:`${((step+1)/steps.length)*100}%`}}/></div>
        <div className="screen-frame">{type==='logistics'?<LogisticsScreen step={step} files={files} setFiles={setFiles} incident={incident} setIncident={setIncident}/>:<ConstructionScreen step={step} files={files} setFiles={setFiles}/>}</div>
        <div className="sim-actions"><button disabled={step===0} onClick={()=>setStep(value=>value-1)}>Anterior</button><button className="primary" disabled={!canContinue} onClick={next}>{step===steps.length-1?'Ver como cliente':'Continuar'} {step===steps.length-1?<Eye size={17}/>:<ArrowRight size={17}/>}</button></div>
      </section>
    </div>
  </main>;
}

function LogisticsScreen({ step, files, setFiles, incident, setIncident }) {
  if (step===0) return <Card title="Registrar pedido" kicker="NUEVA EJECUCIÓN LOGÍSTICA"><Fields values={[['Número de orden','INT-1048'],['Cliente','Andrea Pérez'],['Dirección','Ensanche Naco, Santo Domingo'],['Entrega prometida','Hoy · 5:00 p. m.']]}/><button className="primary">Crear recorrido logístico</button></Card>;
  if (step===1) return <Card title="Control de preparación" kicker="PEDIDO INT-1048"><Checklist/><Fields values={[['Peso esperado','4.2 kg'],['Peso registrado','3.5 kg']]}/><EvidenceUploader files={files} setFiles={setFiles} watermark="Pedido INT-1048 · Control de empaque"/></Card>;
  if (step===2) return <IncidentForm incident={incident} setIncident={setIncident}/>;
  if (step===3) return <CorrectionResponse incident={incident} setIncident={setIncident} files={files}/>;
  return <InternalLogisticsReport files={files} incident={incident}/>;
}

function IncidentForm({ incident, setIncident }) {
  return <Card title="Reportar incidencia" kicker="CONTROL DE PREPARACIÓN">
    <div className="incident-banner"><ShieldCheck/><div><b>Diferencia detectada</b><span>El flujo se detendrá hasta recibir una respuesta.</span></div></div>
    <div className="form-grid">
      <label className="field"><span>Departamento responsable</span><select value={incident.department} onChange={event=>setIncident({...incident,department:event.target.value,reported:false,approved:false})}><option>Almacén y empaque</option><option>Compras</option><option>Control de calidad</option><option>Transporte y despacho</option><option>Servicio al cliente</option></select></label>
      <label className="field"><span>Prioridad</span><select value={incident.priority} onChange={event=>setIncident({...incident,priority:event.target.value,reported:false,approved:false})}><option>Alta</option><option>Media</option><option>Baja</option></select></label>
      <label className="field full-span"><span>Descripción</span><textarea value={incident.detail} onChange={event=>setIncident({...incident,detail:event.target.value,reported:false,approved:false})}/></label>
    </div>
    <button className="danger" onClick={()=>setIncident({...incident,reported:true})}>{incident.reported?<><Check size={17}/> Incidencia enviada</>:<>Reportar incidencia <ArrowRight size={17}/></>}</button>
    {incident.reported&&<div className="success-note"><Check/><div><b>INC-2048 enviada a {incident.department}</b><span>El área recibió la notificación y el despacho permanece bloqueado.</span></div></div>}
  </Card>;
}

function CorrectionResponse({ incident, setIncident, files }) {
  return <Card title="Respuesta del departamento" kicker={incident.department.toUpperCase()}>
    <div className="response-head"><UserRoundCheck/><div><small>RESPUESTA RECIBIDA · 10:57 A. M.</small><h3>Corrección aplicada</h3><p>Se verificó el contenido. La caja faltante fue agregada y el paquete volvió a pesarse.</p></div></div>
    <div className="review-list"><div><span>Incidencia</span><strong>INC-2048</strong></div><div><span>Departamento</span><strong>{incident.department}</strong></div><div><span>Peso anterior</span><strong>3.5 kg</strong></div><div><span>Peso corregido</span><strong>4.2 kg</strong></div><div><span>Acción ejecutada</span><strong>Caja agregada y empaque sellado</strong></div><div><span>Evidencias</span><strong>{files.length} fotografía{files.length===1?'':'s'}</strong></div></div>
    <div className="approval-box"><ClipboardCheck/><div><b>Validación requerida</b><span>Aprueba la corrección para liberar el despacho.</span></div><button className="primary" disabled={incident.approved} onClick={()=>setIncident({...incident,approved:true})}>{incident.approved?<><Check/> Corrección aprobada</>:<>Aprobar corrección</>}</button></div>
    {incident.approved&&<div className="success-note"><Check/><div><b>Despacho liberado</b><span>La aprobación quedó registrada con responsable, fecha y hora.</span></div></div>}
  </Card>;
}

function InternalLogisticsReport({ files, incident }) {
  return <Card title="Reporte interno del pedido" kicker="PEDIDO INT-1048">
    <div className="internal-warning"><ShieldCheck/><div><b>Información de uso interno</b><span>Incluye incidencia, departamento responsable, tiempos y aprobación.</span></div></div>
    <div className="report-hero"><Truck/><div><h3>Pedido liberado para despacho</h3><p>La incidencia fue corregida y aprobada.</p></div><strong>100%</strong></div>
    <div className="review-list"><div><span>Incidencia</span><strong>INC-2048</strong></div><div><span>Departamento asignado</span><strong>{incident.department}</strong></div><div><span>Prioridad</span><strong>{incident.priority}</strong></div><div><span>Resultado interno</span><strong>Corrección aprobada</strong></div></div>
    <div className="report-timeline"><p>✓ Pedido registrado · 9:12 a. m.</p><p>✓ Picking completado · 10:03 a. m.</p><p className="alert-text">! INC-2048 reportada a {incident.department} · 10:47 a. m.</p><p>✓ Corrección recibida · 10:57 a. m.</p><p>✓ Corrección aprobada y despacho liberado · 11:02 a. m.</p></div>
    <EvidenceGallery files={files} watermark="Pedido INT-1048 · Evidencia logística"/>
  </Card>;
}

function ConstructionScreen({ step, files, setFiles }) {
  if (step===0) return <Card title="Apartamento 304" kicker="RESIDENCIAL VISTA REAL"><div className="scan-box"><Building2 size={48}/></div><p className="centered">Torre B · Primera pintura</p></Card>;
  if (step===1) return <Card title="Registrar control" kicker="PRIMERA PINTURA"><Fields values={[['Responsable','Luis Gómez'],['Ubicación','Muro norte'],['Avance','65 %'],['Observación','Acabado irregular en esquina superior']]}/></Card>;
  if (step===2) return <Card title="Adjuntar evidencia" kicker="APARTAMENTO 304"><EvidenceUploader files={files} setFiles={setFiles} watermark="Residencial Vista Real · Apartamento 304"/></Card>;
  if (step===3) return <Card title="Revisión del supervisor" kicker="CORRECCIÓN SOLICITADA"><div className="review-list"><div><span>Incidencia interna</span><strong>Acabado irregular</strong></div><div><span>Responsable</span><strong>Luis Gómez</strong></div><div><span>Acción</span><strong>Rehacer esquina antes de segunda mano</strong></div><div><span>Evidencias</span><strong>{files.length} fotografías</strong></div></div></Card>;
  return <Card title="Reporte interno de avance" kicker="APARTAMENTO 304"><div className="internal-warning"><ShieldCheck/><div><b>Información de uso interno</b><span>Incluye responsables, observaciones e instrucciones de corrección.</span></div></div><div className="report-hero"><Building2/><div><h3>Primera pintura · 65%</h3><p>Corrección en seguimiento.</p></div><strong>65%</strong></div><div className="review-list"><div><span>Responsable</span><strong>Luis Gómez</strong></div><div><span>Hallazgo</span><strong>Acabado irregular</strong></div><div><span>Instrucción interna</span><strong>Rehacer esquina superior</strong></div></div><EvidenceGallery files={files} watermark="Residencial Vista Real · Apartamento 304"/></Card>;
}

function PublicClientView({ type, files, onBack, onExit }) {
  const logistics = type === 'logistics';
  return <main className="public-client-page">
    <header className="public-client-header"><Brand/><button onClick={onExit}>Cerrar vista</button></header>
    <section className="public-client-shell">
      <button className="public-back" onClick={onBack}><ArrowLeft size={16}/> Volver al reporte interno</button>
      <span className="public-label">VISTA AUTORIZADA PARA EL CLIENTE</span>
      <div className="public-client-hero">{logistics?<Truck/>:<Building2/>}<div><small>{logistics?'PEDIDO INT-1048':'RESIDENCIAL VISTA REAL'}</small><h1>{logistics?'Tu pedido está listo para despacho':'Apartamento 304'}</h1><p>{logistics?'La preparación fue validada y el pedido continúa hacia su destino.':'Primera pintura en proceso. Próxima actualización programada.'}</p></div><strong>{logistics?'75%':'65%'}</strong></div>
      <div className="public-progress"><i style={{width:logistics?'75%':'65%'}}/></div>
      <div className="public-info-grid">{(logistics?[["Estado actual","Preparación completada"],["Entrega estimada","Hoy antes de las 5:00 p. m."],["Destino","Ensanche Naco, Santo Domingo"]]:[["Etapa actual","Primera pintura"],["Avance informado","65 %"],["Próxima actualización","Mañana · 3:00 p. m."]]).map(([label,value])=><article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <section className="public-history"><h2>Actualizaciones</h2>{logistics?<><p>✓ Pedido confirmado · 9:12 a. m.</p><p>✓ Preparación validada · 11:02 a. m.</p><p>○ Próximo paso: despacho</p></>:<><p>✓ Etapa iniciada · 8:15 a. m.</p><p>✓ Avance actualizado · 10:48 a. m.</p><p>○ Próxima revisión programada</p></>}</section>
      <section className="public-evidence"><div><Camera/><div><span>Evidencias autorizadas</span><strong>{files.length} fotografía{files.length===1?'':'s'}</strong></div></div><EvidenceGallery files={files} watermark={logistics?'Pedido INT-1048 · Evidencia autorizada':'Residencial Vista Real · Apartamento 304'}/></section>
      <div className="privacy-note"><ShieldCheck/><p>Esta vista no muestra responsables internos, departamentos, incidencias, instrucciones de corrección ni notas de supervisión.</p></div>
    </section>
  </main>;
}

function Card({title,kicker,children}) { return <div className="form-screen enhanced-card"><div className="form-head"><div><small>{kicker}</small><h3>{title}</h3></div><span className="secure"><ShieldCheck size={15}/> Registro seguro</span></div>{children}</div>; }
function Fields({values}) { return <div className="form-grid">{values.map(([label,value])=><label className={`field ${label==='Observación'?'full-span':''}`} key={label}><span>{label}</span><input defaultValue={value}/></label>)}</div>; }
function Checklist(){ return <div className="checklist">{['Set de vasos térmicos','Termo personalizado','Caja de regalo'].map((item,index)=><label key={item}><input type="checkbox" defaultChecked={index<2}/><span>{item}</span></label>)}</div>; }

function EvidenceUploader({ files, setFiles, watermark }) {
  const ref=useRef(null);
  useEffect(()=>()=>files.forEach(file=>URL.revokeObjectURL(file.url)),[]);
  const add=event=>{const incoming=Array.from(event.target.files||[]).filter(file=>file.type.startsWith('image/')).slice(0,6-files.length).map(file=>({id:`${file.name}-${file.lastModified}-${Math.random()}`,name:file.name,url:URL.createObjectURL(file)}));setFiles([...files,...incoming]);event.target.value='';};
  return <div className="evidence-uploader"><input ref={ref} hidden type="file" accept="image/*" multiple onChange={add}/><button className="photo-upload interactive" onClick={()=>ref.current?.click()}><Camera/><b>{files.length?'Agregar más fotografías':'Agregar fotografía'}</b><small>Máximo 6 imágenes</small></button>{files.length?<div className="uploaded-grid">{files.map((file,index)=><article className="uploaded-card" key={file.id}><div className="watermarked-thumb"><img src={file.url} alt={`Evidencia ${index+1}`}/><span>{watermark}</span></div><b>Foto {index+1}</b><small>{file.name}</small><button onClick={()=>{URL.revokeObjectURL(file.url);setFiles(files.filter(item=>item.id!==file.id));}}><Trash2 size={16}/></button></article>)}</div>:<p className="empty-evidence">No hay fotografías adjuntas.</p>}</div>;
}
function EvidenceGallery({ files, watermark }) { return files.length?<div className="evidence-gallery">{files.map((file,index)=><figure key={file.id}><img src={file.url} alt={`Evidencia ${index+1}`}/><figcaption>{watermark}<br/>Evidencia {index+1} · INTAP Trace</figcaption></figure>)}</div>:<div className="empty-evidence"><Camera/><span>Sin evidencias adjuntas</span></div>; }

export default function AppEnhanced(){const [scenario,setScenario]=useState(null);return scenario?<Simulator type={scenario} back={()=>setScenario(null)}/>:<Home open={setScenario}/>;}
