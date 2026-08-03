import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Building2, Camera, Check, ClipboardCheck,
  FileText, Hotel, MapPin, PackageCheck, ShieldCheck, Sparkles,
  Store, Trash2, Truck, Upload, UserRoundCheck, Utensils, X
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
  return <main className="trace-home page">
    <header className="site-header"><Brand/><button className="primary">Solicitar información</button></header>
    <section className="trace-hero">
      <div><small>CONTROL · EVIDENCIA · CONFIANZA</small><h1>Tu operación, demostrada paso a paso.</h1><p>Cada actividad queda vinculada a una persona, un lugar, una hora, una evidencia y un resultado verificable.</p><button className="primary" onClick={() => open('construction')}>Ver plataforma <ArrowRight size={18}/></button></div>
      <div className="trace-dashboard"><div className="dash-head"><Brand/><b>Resumen operativo</b></div><div className="dash-stats"><span><b>24</b> Operaciones activas</span><span><b>18</b> En ejecución</span><span><b>32</b> Incidencias</span></div><h3>Actividad reciente</h3><p>✓ Avance registrado · Apartamento 304</p><p>✓ Empaque validado · INT-1048</p><p className="alert-text">! Incidencia enviada a almacén</p></div>
    </section>
    <section className="sector-section"><div className="sector-heading"><small>SECTORES</small><h2>Una misma lógica de control para distintas operaciones.</h2></div><div className="sector-grid">{sectors.map(({title,icon:Icon,text,active}) => <button key={title} className={`sector-card ${active?'sector-active':''}`} onClick={() => active && open(active)}><Icon/><div><h3>{title}</h3><p>{text}</p>{active && <b>Explorar solución <ArrowRight size={15}/></b>}</div></button>)}</div></section>
  </main>;
}

const logisticsSteps = [
  ['Ingreso del pedido','Registrar la orden'],
  ['Preparación','Controlar picking y empaque'],
  ['Reportar incidencia','Dirigir el caso al área responsable'],
  ['Respuesta y corrección','Revisar la solución y aprobarla'],
  ['Despacho y reporte','Continuar el flujo y consultar el resultado'],
];

function Simulator({ type, back }) {
  const steps = type === 'logistics' ? logisticsSteps : [['Identificación','Ubicar el punto de control'],['Registro','Completar el control'],['Evidencia','Adjuntar fotografías'],['Supervisión','Revisar y corregir'],['Reporte','Consultar el resultado']];
  const [step,setStep] = useState(0);
  const [files,setFiles] = useState([]);
  const [incident,setIncident] = useState({ reported:false, department:'Almacén y empaque', priority:'Alta', detail:'El peso registrado es 0.7 kg menor al esperado.', response:false, approved:false });
  const canContinue = type !== 'logistics' || step < 2 || (step === 2 && incident.reported) || (step === 3 && incident.approved) || step === 4;
  const next = () => { if (step === steps.length-1) setStep(0); else if (canContinue) setStep(v=>v+1); };
  return <main className="simulator page"><header className="sim-header"><button className="back" onClick={back}><ArrowLeft size={17}/> Volver</button><Brand/><strong>{type==='logistics'?'Pedido INT-1048':'Apartamento 304'}</strong></header><div className="sim-grid"><aside className="step-nav"><small>RECORRIDO OPERATIVO</small><h2>{type==='logistics'?'Logística':'Construcción'}</h2>{steps.map((item,i)=><button className={step===i?'active':''} key={item[0]} onClick={()=>setStep(i)}><span>{i<step?<Check size={14}/>:i+1}</span><div><strong>{item[0]}</strong><small>{item[1]}</small></div></button>)}</aside><section className="workspace"><div className="workspace-top"><div><span className="role-badge">Vista: {step===3?'Departamento responsable':step===4?'Cliente final':'Operador'}</span><h1>{steps[step][0]}</h1><p>{steps[step][1]}</p></div><b>{step+1} / {steps.length}</b></div><div className="progress"><i style={{width:`${((step+1)/steps.length)*100}%`}}/></div><div className="screen-frame">{type==='logistics'?<LogisticsScreen step={step} files={files} setFiles={setFiles} incident={incident} setIncident={setIncident}/>:<ConstructionScreen step={step} files={files} setFiles={setFiles}/>}</div><div className="sim-actions"><button disabled={step===0} onClick={()=>setStep(v=>v-1)}>Anterior</button><button className="primary" disabled={!canContinue} onClick={next}>{step===steps.length-1?'Reiniciar recorrido':'Continuar'} <ArrowRight size={17}/></button></div></section></div></main>;
}

function LogisticsScreen({ step, files, setFiles, incident, setIncident }) {
  if (step===0) return <Card title="Registrar pedido" kicker="NUEVA EJECUCIÓN LOGÍSTICA"><Fields values={[['Número de orden','INT-1048'],['Cliente','Andrea Pérez'],['Dirección','Ensanche Naco, Santo Domingo'],['Entrega prometida','Hoy · 5:00 p. m.']]}/><button className="primary">Crear recorrido logístico</button></Card>;
  if (step===1) return <Card title="Control de preparación" kicker="PEDIDO INT-1048"><Checklist/><Fields values={[['Peso esperado','4.2 kg'],['Peso registrado','3.5 kg']]}/><EvidenceUploader files={files} setFiles={setFiles} watermark="Pedido INT-1048 · Control de empaque"/></Card>;
  if (step===2) return <IncidentForm incident={incident} setIncident={setIncident}/>;
  if (step===3) return <CorrectionResponse incident={incident} setIncident={setIncident} files={files}/>;
  return <LogisticsReport files={files} incident={incident}/>;
}

function IncidentForm({ incident, setIncident }) {
  return <Card title="Reportar incidencia" kicker="CONTROL DE PREPARACIÓN"><div className="incident-banner"><ShieldCheck/><div><b>Diferencia detectada</b><span>El flujo se detendrá hasta recibir una respuesta.</span></div></div><div className="form-grid"><label className="field"><span>Departamento responsable</span><select value={incident.department} onChange={e=>setIncident({...incident,department:e.target.value,reported:false})}><option>Almacén y empaque</option><option>Compras</option><option>Control de calidad</option><option>Transporte y despacho</option><option>Servicio al cliente</option></select></label><label className="field"><span>Prioridad</span><select value={incident.priority} onChange={e=>setIncident({...incident,priority:e.target.value,reported:false})}><option>Alta</option><option>Media</option><option>Baja</option></select></label><label className="field full-span"><span>Descripción</span><textarea value={incident.detail} onChange={e=>setIncident({...incident,detail:e.target.value,reported:false})}/></label></div><button className="danger" onClick={()=>setIncident({...incident,reported:true,response:true})}>{incident.reported?<><Check size={17}/> Incidencia enviada</>:<>Reportar incidencia <ArrowRight size={17}/></>}</button>{incident.reported&&<div className="success-note"><Check/><div><b>INC-2048 enviada a {incident.department}</b><span>El departamento recibió una notificación y el despacho permanece bloqueado.</span></div></div>}</Card>;
}

function CorrectionResponse({ incident, setIncident, files }) {
  return <Card title="Respuesta del departamento" kicker={incident.department.toUpperCase()}><div className="response-head"><UserRoundCheck/><div><small>RESPUESTA RECIBIDA · 10:57 A. M.</small><h3>Corrección aplicada</h3><p>Se verificó el contenido del pedido. La caja de regalo faltante fue agregada y el paquete volvió a pesarse.</p></div></div><div className="review-list"><div><span>Incidencia</span><strong>INC-2048</strong></div><div><span>Departamento</span><strong>{incident.department}</strong></div><div><span>Peso anterior</span><strong>3.5 kg</strong></div><div><span>Peso corregido</span><strong>4.2 kg</strong></div><div><span>Acción ejecutada</span><strong>Caja agregada y empaque sellado</strong></div><div><span>Evidencias</span><strong>{files.length} fotografía{files.length===1?'':'s'}</strong></div></div><div className="approval-box"><ClipboardCheck/><div><b>Validación requerida</b><span>Aprueba la corrección para liberar el despacho.</span></div><button className="primary" disabled={incident.approved} onClick={()=>setIncident({...incident,approved:true})}>{incident.approved?<><Check/> Corrección aprobada</>:<>Aprobar corrección</>}</button></div>{incident.approved&&<div className="success-note"><Check/><div><b>Despacho liberado</b><span>La aprobación quedó registrada con responsable, fecha y hora.</span></div></div>}</Card>;
}

function LogisticsReport({ files, incident }) {
  return <Card title="Reporte del pedido" kicker="PEDIDO INT-1048"><div className="report-hero"><Truck/><div><h3>Pedido listo para despacho</h3><p>La incidencia fue corregida y aprobada antes de continuar.</p></div><strong>100%</strong></div><div className="report-timeline"><p>✓ Pedido registrado · 9:12 a. m.</p><p>✓ Picking completado · 10:03 a. m.</p><p className="alert-text">! INC-2048 reportada a {incident.department} · 10:47 a. m.</p><p>✓ Corrección recibida · 10:57 a. m.</p><p>✓ Corrección aprobada y despacho liberado · 11:02 a. m.</p></div><EvidenceGallery files={files} watermark="Pedido INT-1048 · Evidencia logística"/></Card>;
}

function ConstructionScreen({ step, files, setFiles }) {
  if (step===0) return <Card title="Apartamento 304" kicker="RESIDENCIAL VISTA REAL"><div className="scan-box"><Building2 size={48}/></div><p className="centered">Torre B · Primera pintura</p></Card>;
  if (step===1) return <Card title="Registrar control" kicker="PRIMERA PINTURA"><Fields values={[['Responsable','Luis Gómez'],['Ubicación','Muro norte'],['Avance','65 %'],['Observación','Acabado irregular en esquina superior']]}/></Card>;
  if (step===2) return <Card title="Adjuntar evidencia" kicker="APARTAMENTO 304"><EvidenceUploader files={files} setFiles={setFiles} watermark="Residencial Vista Real · Apartamento 304"/></Card>;
  if (step===3) return <Card title="Revisión del supervisor" kicker="CORRECCIÓN SOLICITADA"><div className="review-list"><div><span>Incidencia</span><strong>Acabado irregular</strong></div><div><span>Acción</span><strong>Rehacer esquina antes de segunda mano</strong></div><div><span>Evidencias</span><strong>{files.length} fotografías</strong></div></div></Card>;
  return <Card title="Reporte de avance" kicker="APARTAMENTO 304"><div className="report-hero"><Building2/><div><h3>Primera pintura · 65%</h3><p>Corrección en seguimiento.</p></div><strong>65%</strong></div><EvidenceGallery files={files} watermark="Residencial Vista Real · Apartamento 304"/></Card>;
}

function Card({title,kicker,children}) { return <div className="form-screen enhanced-card"><div className="form-head"><div><small>{kicker}</small><h3>{title}</h3></div><span className="secure"><ShieldCheck size={15}/> Registro seguro</span></div>{children}</div>; }
function Fields({values}) { return <div className="form-grid">{values.map(([a,b])=><label className={`field ${a==='Observación'?'full-span':''}`} key={a}><span>{a}</span><input defaultValue={b}/></label>)}</div>; }
function Checklist(){ return <div className="checklist">{['Set de vasos térmicos','Termo personalizado','Caja de regalo'].map((x,i)=><label key={x}><input type="checkbox" defaultChecked={i<2}/><span>{x}</span></label>)}</div>; }

function EvidenceUploader({ files, setFiles, watermark }) {
  const ref=useRef(null);
  const add=e=>{const incoming=Array.from(e.target.files||[]).filter(f=>f.type.startsWith('image/')).slice(0,6-files.length).map(f=>({id:`${f.name}-${f.lastModified}-${Math.random()}`,name:f.name,url:URL.createObjectURL(f)}));setFiles([...files,...incoming]);e.target.value='';};
  return <div className="evidence-uploader"><input ref={ref} hidden type="file" accept="image/*" multiple onChange={add}/><button className="photo-upload interactive" onClick={()=>ref.current?.click()}><Camera/><b>{files.length?'Agregar más fotografías':'Agregar fotografía'}</b><small>Máximo 6 imágenes</small></button>{files.length?<div className="uploaded-grid">{files.map((f,i)=><article className="uploaded-card" key={f.id}><div className="watermarked-thumb"><img src={f.url}/><span>{watermark}</span></div><b>Foto {i+1}</b><small>{f.name}</small><button onClick={()=>{URL.revokeObjectURL(f.url);setFiles(files.filter(x=>x.id!==f.id));}}><Trash2 size={16}/></button></article>)}</div>:<p className="empty-evidence">No hay fotografías adjuntas.</p>}</div>;
}
function EvidenceGallery({ files, watermark }) { return files.length?<div className="evidence-gallery">{files.map((f,i)=><figure key={f.id}><img src={f.url}/><figcaption>{watermark}<br/>Evidencia {i+1} · INTAP Trace</figcaption></figure>)}</div>:<div className="empty-evidence"><Camera/><span>Sin evidencias adjuntas</span></div>; }

export default function AppEnhanced(){const [scenario,setScenario]=useState(null);return scenario?<Simulator type={scenario} back={()=>setScenario(null)}/>:<Home open={setScenario}/>;}
