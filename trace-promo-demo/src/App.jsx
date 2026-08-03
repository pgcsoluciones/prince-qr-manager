import { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Building2, Camera, Check, CheckCircle2,
  CircleAlert, Clock3, FileCheck2, LockKeyhole, PackageCheck,
  ScanLine, ShieldCheck, Truck, UsersRound,
} from 'lucide-react';

const flows = {
  construction: {
    label: 'Construcción', context: 'Apartamento 304 · Residencial Vista Real',
    intro: 'Gestiona avances, evidencias, incidencias y supervisión en una sola línea de tiempo verificable.',
    steps: [
      ['Contexto identificado','El código del apartamento abre la tarea correcta para el responsable asignado.',ScanLine,'Registrado','8:12 a. m.'],
      ['Avance registrado','Luis Gómez reporta 65 % de avance en la primera mano de pintura.',Building2,'En progreso','8:15 a. m.'],
      ['Evidencia vinculada','Dos fotografías quedan asociadas a la etapa, responsable y ubicación.',Camera,'Verificado','10:48 a. m.'],
      ['Incidencia reportada','Se detecta una corrección pendiente en el muro norte.',CircleAlert,'Atención requerida','10:51 a. m.',true],
      ['Supervisión realizada','María Santos revisa la evidencia y solicita la corrección antes de continuar.',ShieldCheck,'Revisado','11:18 a. m.'],
      ['Historial actualizado','Cada acción queda fechada, atribuida y disponible para auditoría.',Clock3,'Trazabilidad completa','11:19 a. m.'],
    ].map(([title,copy,icon,status,meta,warning])=>({title,copy,icon,status,meta,warning})),
  },
  logistics: {
    label: 'Logística', context: 'Pedido INT-1048 · Andrea Pérez',
    intro: 'Controla el pedido desde su registro hasta la entrega confirmada al cliente.',
    steps: [
      ['Pedido recibido','Operaciones registra el pedido y activa automáticamente el recorrido logístico.',PackageCheck,'Registrado','10:08 a. m.'],
      ['Picking completado','Los tres artículos son localizados y validados en almacén.',CheckCircle2,'Completado','10:22 a. m.'],
      ['Diferencia detectada','El peso registrado no coincide y el despacho queda bloqueado.',CircleAlert,'Bloqueado','10:51 a. m.',true],
      ['Pedido corregido','Se agrega el artículo faltante y se valida el peso final de 4.2 kg.',FileCheck2,'Validado','10:57 a. m.'],
      ['Despacho en ruta','Carlos Ruiz recibe la asignación del vehículo F-204.',Truck,'En ruta','11:18 a. m.'],
      ['Entrega confirmada','Andrea Pérez confirma la recepción mediante PIN y comprobante.',ShieldCheck,'Entregado','3:42 p. m.'],
    ].map(([title,copy,icon,status,meta,warning])=>({title,copy,icon,status,meta,warning})),
  },
};

function ProductPreview(){return <div className="product-visual">
  <div className="laptop-frame"><div className="screen-top"><div className="mini-logo">IT</div><strong>INTAP Trace</strong><span>Resumen operativo</span></div><div className="dashboard-grid"><aside>{['Inicio','Operaciones','Tareas','Evidencias','Incidencias','Entregas'].map((x,i)=><div className={i===0?'active':''} key={x}>{x}</div>)}</aside><section><div className="metric-row"><Metric value="24" label="Operaciones activas"/><Metric value="18" label="En ejecución"/><Metric value="32" label="Incidencias" alert/></div><div className="activity-card"><div className="activity-head"><strong>Actividad reciente</strong><span>Hoy</span></div><Activity title="Inicio de obra · Apartamento 304" time="08:15"/><Activity title="Instalación eléctrica · Avance 60 %" time="10:42"/><Activity title="Incidencia reportada · Baño principal" time="11:05" alert/><Activity title="Verificación y corrección" time="12:30"/></div></section></div></div>
  <div className="phone-frame"><div className="phone-status"><span>Entrega #ENT-9841</span><strong>Entregada</strong></div>{['Pedido confirmado','Picking completado','Empaque','Despacho en ruta','Entrega confirmada'].map((x,i)=><div className="phone-step" key={x}><span><Check size={12}/></span><div><strong>{x}</strong><small>{['09:12','10:03','10:47','11:22','13:18'][i]}</small></div></div>)}<div className="proof-card"><Camera size={16}/><div><strong>Evidencia registrada</strong><small>Firma y fotografía</small></div></div></div>
</div>}
function Metric({value,label,alert}){return <div className="metric"><span>{label}</span><strong className={alert?'alert':''}>{value}</strong></div>}
function Activity({title,time,alert}){return <div className="activity"><span className={alert?'dot alert':'dot'}/><strong>{title}</strong><small>{time}</small></div>}
function Value({icon:Icon,title,text}){return <div><Icon/><span><strong>{title}</strong><small>{text}</small></span></div>}

function Home({onOpen}){return <main>
  <header className="site-header container"><div className="brand"><div className="brandmark">IT</div><div><strong>INTAP Trace</strong><span>Trazabilidad operativa</span></div></div><nav><a href="#soluciones">Soluciones</a><a href="#beneficios">Beneficios</a><a href="#seguridad">Seguridad</a></nav><button className="header-cta" onClick={()=>onOpen('logistics')}>Ver plataforma</button></header>
  <section className="hero container"><div className="hero-copy"><span className="eyebrow">CONTROL · EVIDENCIA · CONFIANZA</span><h1>Tu operación, demostrada paso a paso.</h1><p>INTAP Trace convierte cada actividad en un flujo trazable con responsables, evidencias, incidencias y seguimiento en tiempo real.</p><div className="hero-actions"><button className="primary" onClick={()=>onOpen('construction')}>Explorar plataforma <ArrowRight size={18}/></button><button className="secondary" onClick={()=>onOpen('logistics')}>Ver logística</button></div><div className="trust-metrics"><div><FileCheck2/><strong>2,458</strong><span>Etapas registradas</span></div><div><CircleAlert/><strong>32</strong><span>Incidencias activas</span></div><div><CheckCircle2/><strong>1,842</strong><span>Entregas verificadas</span></div><div><UsersRound/><strong>98 %</strong><span>Cumplimiento SLA</span></div></div></div><ProductPreview/></section>
  <section className="solutions container" id="soluciones"><button className="solution-card" onClick={()=>onOpen('construction')}><div className="solution-icon"><Building2/></div><div><h2>Construcción</h2><p>Controla proyectos y apartamentos con visibilidad total del avance, evidencia, incidencias y supervisión.</p><div className="chips"><span>Avance por etapa</span><span>Evidencia fotográfica</span><span>Incidencias</span><span>Supervisión</span></div><strong>Explorar solución <ArrowRight size={17}/></strong></div></button><button className="solution-card" onClick={()=>onOpen('logistics')}><div className="solution-icon"><Truck/></div><div><h2>Logística</h2><p>Controla pedidos de extremo a extremo: picking, empaque, despacho y entrega confirmada.</p><div className="chips"><span>Trazabilidad de pedidos</span><span>Rutas y entregas</span><span>Evidencias</span><span>Notificaciones</span></div><strong>Explorar solución <ArrowRight size={17}/></strong></div></button></section>
  <section className="value-strip container" id="beneficios"><Value icon={ShieldCheck} title="Seguridad empresarial" text="Auditoría completa y control de acceso"/><Value icon={Clock3} title="Trazabilidad integral" text="De la planificación a la entrega"/><Value icon={LockKeyhole} title="Integraciones abiertas" text="Conecta tus sistemas y procesos"/><Value icon={CheckCircle2} title="Cumplimiento verificable" text="Reglas, evidencia y responsables"/></section>
</main>}

function Flow({type,onBack}){const[step,setStep]=useState(0);const flow=flows[type];const current=useMemo(()=>flow.steps[step],[flow,step]);const Icon=current.icon;const people=type==='construction'?['Operador','Luis Gómez','Luis Gómez','Terminaciones','María Santos','Sistema']:['Operaciones','Almacén','Empaque','Supervisor','Carlos Ruiz','Andrea Pérez'];return <main className="flow-page"><header className="flow-header container"><button onClick={onBack}><ArrowLeft size={18}/> Volver</button><div className="brand"><div className="brandmark">IT</div><div><strong>INTAP Trace</strong><span>{flow.label}</span></div></div><span>{flow.context}</span></header><section className="flow-layout container"><aside className="flow-nav"><span className="eyebrow">RECORRIDO OPERATIVO</span><h1>{flow.label}</h1><p>{flow.intro}</p>{flow.steps.map((item,index)=><button key={item.title} className={index===step?'active':index<step?'done':''} onClick={()=>setStep(index)}><span>{index<step?<Check size={14}/>:index+1}</span><div><strong>{item.title}</strong><small>{item.meta}</small></div></button>)}</aside><section className="flow-stage"><div className="stage-top"><span>Paso {step+1} de {flow.steps.length}</span><strong>{current.status}</strong></div><div className="stage-progress"><i style={{width:`${((step+1)/flow.steps.length)*100}%`}}/></div><div className={current.warning?'stage-icon warning':'stage-icon'}><Icon/></div><h2>{current.title}</h2><p>{current.copy}</p><div className="evidence-panel"><div><span>Responsable</span><strong>{people[step]}</strong></div><div><span>Registro</span><strong>{current.meta}</strong></div><div><span>Estado</span><strong>{current.status}</strong></div></div><div className="stage-actions"><button disabled={step===0} onClick={()=>setStep(step-1)}>Anterior</button><button className="primary" onClick={()=>setStep(step===flow.steps.length-1?0:step+1)}>{step===flow.steps.length-1?'Repetir recorrido':'Continuar'} <ArrowRight size={17}/></button></div></section></section></main>}

export default function App(){const[view,setView]=useState('home');return view==='home'?<Home onOpen={setView}/>:<Flow type={view} onBack={()=>setView('home')}/>}
