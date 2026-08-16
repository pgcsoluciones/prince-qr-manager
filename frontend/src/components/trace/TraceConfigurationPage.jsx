import {useEffect,useMemo,useState} from "react";

const BASE=import.meta.env.VITE_API_URL||"https://api.code.intaprd.com";
const token=()=>localStorage.getItem("qr_token")||"";
async function api(path,options={}){const r=await fetch(`${BASE}${path}`,{...options,headers:{Authorization:`Bearer ${token()}`,"Content-Type":"application/json",...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok||d?.ok===false)throw new Error(d.message||d.error||`HTTP ${r.status}`);return d}

const SECTIONS=[
 {id:"company",n:1,icon:"▦",title:"Empresa",description:"Información general y preferencias de la empresa."},
 {id:"projects",n:2,icon:"▣",title:"Proyectos",description:"Proyectos activos y configuración general."},
 {id:"zones",n:3,icon:"⌂",title:"Zonas y Activos",description:"Estructura física y elementos trazables del proyecto."},
 {id:"process",n:4,icon:"◇",title:"Proceso y trazabilidad",description:"Etapas, procesos, formularios y reglas de trazabilidad."},
 {id:"team",n:5,icon:"♙",title:"Equipo y participantes",description:"Roles, permisos y organización de participantes."},
 {id:"external",n:6,icon:"◎",title:"Actores externos",description:"Proveedores, contratistas y servicios externos."},
 {id:"evidence",n:7,icon:"▤",title:"Evidencias",description:"Reglas, tipos y requisitos para la gestión de evidencias."},
 {id:"notifications",n:8,icon:"♧",title:"Notificaciones",description:"Canales, plantillas y reglas de notificación."},
 {id:"public",n:9,icon:"◉",title:"Vista pública",description:"Configuración de la información visible para clientes o externos."},
 {id:"integrations",n:10,icon:"∞",title:"Integraciones",description:"Conexiones con otros sistemas.",optional:true},
 {id:"advanced",n:11,icon:"≡",title:"Avanzado",description:"Configuraciones avanzadas y parámetros adicionales.",optional:true},
];
const FIELDS={
 company:[
  ["tradeName","Nombre comercial","text"],["legalName","Razón social","text"],["rnc","RNC","text"],["corporateEmail","Correo corporativo","email"],["phone","Teléfono","text"],["address","Dirección","textarea"],["timezone","Zona horaria","select",["America/Santo_Domingo","America/New_York","America/Puerto_Rico","UTC"]],["currency","Moneda","select",["DOP","USD","EUR"]],["language","Idioma","select",["es-DO","es","en"]],["dateFormat","Formato de fecha","select",["DD/MM/YYYY","MM/DD/YYYY","YYYY-MM-DD"]],["units","Unidades","select",["metric","imperial"]]
 ],
 projects:[
  ["projectName","Nombre del proyecto","text"],["location","Ubicación","text"],["startDate","Fecha de inicio","date"],["endDate","Fecha objetivo","date"],["template","Plantilla / proceso","text"],["allowDuplicate","Permitir duplicado de configuración","checkbox"],["active","Proyecto activo","checkbox"]
 ],
 zones:[
  ["zoneTypes","Tipos de zonas","textarea"],["assetTypes","Tipos de activos","textarea"],["allowSubzones","Permitir subzonas","checkbox"],["requireQr","QR obligatorio para activos controlados","checkbox"],["materialLots","Controlar lotes de materiales","checkbox"],["assetSerials","Requerir serial / código de activo","checkbox"]
 ],
 process:[
  ["processName","Proceso activo","text"],["version","Versión","text"],["mandatoryActivities","Actividades obligatorias","checkbox"],["evidenceRules","Evidencia obligatoria según actividad","checkbox"],["approvalRules","Aprobación requerida","checkbox"],["blockOnReject","Bloquear avance ante rechazo","checkbox"],["dependencies","Dependencias entre actividades","checkbox"],["measurementType","Tipo de cubicación","select",["none","area","volume","unit","custom"]],["measurementUnit","Unidad de cubicación","text"],["measurementFormula","Fórmula / criterio","textarea"],["measurementTolerance","Tolerancia","text"],["doubleReview","Doble revisión de cubicación","checkbox"]
 ],
 team:[
  ["defaultProjectRole","Rol predeterminado en proyecto","select",["member","supervisor","observer"]],["inviteExpirationHours","Vigencia de invitaciones (horas)","number"],["requirePhone","Teléfono obligatorio para miembros","checkbox"],["allowExcelImport","Permitir importación Excel","checkbox"],["departmentRequired","Departamento obligatorio","checkbox"],["teamLeaderCanEvaluate","Líderes pueden evaluar miembros","checkbox"],["supervisorCanEvaluate","Supervisores pueden evaluar miembros","checkbox"]
 ],
 external:[
  ["supplierCategories","Categorías de proveedores","textarea"],["contractorSpecialties","Especialidades de contratistas","textarea"],["serviceTypes","Tipos de servicios externos","textarea"],["requireRnc","RNC obligatorio cuando aplique","checkbox"],["requireContractReference","Referencia de contrato obligatoria","checkbox"],["externalCanAccess","Permitir acceso limitado a actores externos","checkbox"]
 ],
 evidence:[
  ["allowedFileTypes","Tipos de archivo permitidos","textarea"],["maxFileMb","Tamaño máximo por archivo (MB)","number"],["optimizeImages","Optimizar imágenes al cargar","checkbox"],["retentionDays","Retención (días; 0 = indefinida)","number"],["watermarkEnabled","Marca de agua","checkbox"],["watermarkTemplate","Plantilla de marca","select",["basic","institutional","technical","complete"]],["watermarkOpacity","Opacidad (%)","number"],["includeCoordinates","Incluir coordenadas","checkbox"],["includeEvidenceId","Incluir ID de evidencia","checkbox"]
 ],
 notifications:[
  ["platform","Notificaciones en plataforma","checkbox"],["email","Correo","checkbox"],["push","Push","checkbox"],["whatsapp","WhatsApp","checkbox"],["sms","SMS","checkbox"],["webhook","Webhook","checkbox"],["reminderHours","Recordatorio antes de vencimiento (horas)","number"],["maxResponseHours","Tiempo máximo sin respuesta (horas)","number"],["criticalEscalation","Escalar incidencias críticas","checkbox"],["approvalEscalation","Escalar aprobaciones vencidas","checkbox"]
 ],
 public:[
  ["enabled","Vista pública activa","checkbox"],["showProgress","Mostrar avance","checkbox"],["showMilestones","Mostrar hitos","checkbox"],["showEvidence","Permitir evidencias públicas","checkbox"],["showReports","Permitir reportes públicos","checkbox"],["contactVisible","Mostrar contacto","checkbox"],["accessMode","Modo de acceso","select",["public","pin","token"]],["expirationDays","Expiración del acceso (días)","number"],["brandingTitle","Título / branding público","text"]
 ],
 integrations:[
  ["emailProvider","Proveedor de email","text"],["whatsappProvider","WhatsApp / API","text"],["mapsProvider","Mapas","text"],["signatureProvider","Firma","text"],["storageProvider","Almacenamiento externo","text"],["erp","ERP","text"],["accounting","Contabilidad","text"],["webhookUrl","Webhook principal","text"]
 ],
 advanced:[
  ["codePrefix","Prefijo de códigos","text"],["serialPattern","Patrón de seriales","text"],["archiveAfterDays","Archivar después de (días)","number"],["allowConfigExport","Permitir exportar configuración","checkbox"],["allowConfigClone","Permitir duplicar configuración","checkbox"],["specialRules","Reglas especiales","textarea"],["technicalParameters","Parámetros técnicos","textarea"]
 ]
};
const DEFAULTS={
 company:{timezone:"America/Santo_Domingo",currency:"DOP",language:"es-DO",dateFormat:"DD/MM/YYYY",units:"metric"},
 projects:{active:true,allowDuplicate:true},zones:{allowSubzones:true,requireQr:false,materialLots:true,assetSerials:false},
 process:{mandatoryActivities:true,evidenceRules:true,approvalRules:true,blockOnReject:true,dependencies:true,measurementType:"none",doubleReview:false},
 team:{defaultProjectRole:"member",inviteExpirationHours:48,requirePhone:true,allowExcelImport:true,departmentRequired:false,teamLeaderCanEvaluate:true,supervisorCanEvaluate:true},
 external:{requireRnc:false,requireContractReference:false,externalCanAccess:false},
 evidence:{allowedFileTypes:"image/*, PDF, DOCX",maxFileMb:25,optimizeImages:true,retentionDays:0,watermarkEnabled:true,watermarkTemplate:"institutional",watermarkOpacity:35,includeCoordinates:false,includeEvidenceId:true},
 notifications:{platform:true,email:false,push:false,whatsapp:false,sms:false,webhook:false,reminderHours:24,maxResponseHours:48,criticalEscalation:true,approvalEscalation:true},
 public:{enabled:false,showProgress:true,showMilestones:true,showEvidence:false,showReports:false,contactVisible:true,accessMode:"token",expirationDays:30},
 integrations:{},advanced:{allowConfigExport:true,allowConfigClone:true}
};
const STATUS={complete:{label:"Completo",cls:"border-emerald-200 bg-emerald-50 text-emerald-700",icon:"✓"},pending:{label:"Requiere configuración",cls:"border-amber-200 bg-amber-50 text-amber-700",icon:"!"},optional:{label:"Opcional",cls:"border-slate-200 bg-slate-50 text-slate-500",icon:"○"}};

export default function TraceConfigurationPage({projectId,projects=[]}){
 const storageKey=`trace_config_open_${projectId||"none"}`;
 const[open,setOpen]=useState(()=>localStorage.getItem(storageKey)||"company"),[settings,setSettings]=useState({}),[loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState(""),[editing,setEditing]=useState(null);
 const activeProject=projects.find(p=>p.id===projectId)||projects[0];
 useEffect(()=>{localStorage.setItem(storageKey,open||"")},[open,storageKey]);
 useEffect(()=>{load()},[projectId]);
 async function load(){if(!projectId)return;setLoading(true);setError("");try{const d=await api(`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/configuration`);setSettings(d.data?.settings||{})}catch(e){setError(e.message)}finally{setLoading(false)}}
 function statusFor(s){if(settings[s.id])return"complete";return s.optional?"optional":"pending"}
 const complete=SECTIONS.filter(s=>statusFor(s)==="complete").length,attention=SECTIONS.filter(s=>statusFor(s)==="pending").length,pct=Math.round((complete/SECTIONS.length)*100);
 async function saveSection(section,values){setError("");try{await api(`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/configuration/${section}`,{method:"PUT",body:JSON.stringify({values})});setEditing(null);setNotice("Configuración guardada y registrada en auditoría.");await load();setTimeout(()=>setNotice(""),2600)}catch(e){setError(e.message)}}
 function current(id){return settings[id]?.values||DEFAULTS[id]||{}}
 return <div className="mx-auto max-w-[1550px]">
  <div className="mb-5"><h1 className="text-3xl font-black text-slate-950">Configuración</h1><p className="mt-1 text-sm text-slate-500">Centro de parámetros maestros de la empresa y del proyecto.</p></div>
  {loading&&<div className="mb-4 h-1 overflow-hidden rounded-full bg-blue-100"><div className="h-full w-1/3 animate-pulse bg-blue-600"/></div>}
  {error&&<Notice type="error" text={error} onClose={()=>setError("")}/>} {notice&&<Notice type="success" text={notice} onClose={()=>setNotice("")}/>} 
  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
   <section className="space-y-2">{SECTIONS.map(s=><Accordion key={s.id} section={s} status={statusFor(s)} open={open===s.id} onToggle={()=>setOpen(v=>v===s.id?"":s.id)}><SectionPreview section={s} values={current(s.id)} project={activeProject} configured={Boolean(settings[s.id])} onConfigure={()=>setEditing(s.id)}/></Accordion>)}</section>
   <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-base font-black">Resumen de configuración</h2><div className="mt-5 flex items-center gap-4"><div className="grid h-20 w-20 place-items-center rounded-full border-[7px] border-blue-100 text-xl font-black text-blue-700">{pct}%</div><div><div className="text-xs font-black text-slate-700">Configuración general</div><div className="mt-1 text-[11px] leading-4 text-slate-400">{complete} configuradas · {attention} requieren atención</div></div></div><div className="mt-5 space-y-2">{SECTIONS.map(s=>{const st=STATUS[statusFor(s)];return <button key={s.id} onClick={()=>setOpen(s.id)} className="flex w-full items-center justify-between gap-3 text-[11px]"><span className="truncate font-semibold text-slate-600">{s.n}. {s.title}</span><span className={statusFor(s)==="complete"?"font-black text-emerald-600":statusFor(s)==="optional"?"text-slate-400":"font-bold text-amber-600"}>{st.label}</span></button>})}</div></div>
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-[11px] leading-5 text-blue-800">Los valores guardados son persistentes. Cada modificación registra sección, usuario, valor anterior, valor nuevo y fecha en auditoría.</div>
   </aside>
  </div>
  {editing&&<ConfigurationModal section={SECTIONS.find(s=>s.id===editing)} values={current(editing)} project={activeProject} onClose={()=>setEditing(null)} onSave={v=>saveSection(editing,v)}/>} 
 </div>
}
function Accordion({section,status,open,onToggle,children}){const st=STATUS[status];return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><button onClick={onToggle} className="flex w-full items-center gap-4 px-5 py-4 text-left"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-lg font-black text-blue-600">{section.icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-black">{section.n}. {section.title}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500">{section.description}</span></span><span className={`hidden rounded-lg border px-2.5 py-1 text-[9px] font-black sm:block ${st.cls}`}>{st.icon} {st.label}</span><span className="text-lg text-slate-400">{open?"⌃":"⌄"}</span></button>{open&&<div className="border-t border-slate-100 bg-slate-50/40 p-5">{children}</div>}</div>}
function SectionPreview({section,values,project,configured,onConfigure}){const entries=Object.entries(values||{}).filter(([,v])=>v!==""&&v!==null&&v!==undefined).slice(0,8);return <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-black">{configured?"Configuración actual":"Aún no configurado"}</h3><p className="mt-1 text-[11px] text-slate-500">{configured?"Estos valores provienen de la configuración persistida.":"Abre el workspace para definir y guardar esta sección."}</p></div><button onClick={onConfigure} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white">{configured?"Editar configuración":"Configurar"}</button></div>{section.id==="projects"&&<div className="mt-4 rounded-xl bg-blue-50 px-3 py-2 text-[11px] font-semibold text-blue-700">Proyecto: {project?.name||"Proyecto seleccionado"}</div>}<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{entries.length?entries.map(([k,v])=><div key={k} className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{fieldLabel(section.id,k)}</div><div className="mt-1 break-words text-xs font-semibold text-slate-700">{typeof v==='boolean'?(v?'Sí':'No'):String(v)}</div></div>):<div className="text-xs text-slate-400">Sin valores guardados.</div>}</div></div>}
function fieldLabel(section,key){return (FIELDS[section]||[]).find(f=>f[0]===key)?.[1]||key}
function ConfigurationModal({section,values,project,onClose,onSave}){const[draft,setDraft]=useState(()=>({...DEFAULTS[section.id],...values,...(section.id==='projects'&&!values.projectName&&project?.name?{projectName:project.name}:{})})),[saving,setSaving]=useState(false);function change(k,v){setDraft(d=>({...d,[k]:v}))}async function save(){setSaving(true);try{await onSave(draft)}finally{setSaving(false)}}return <div className="fixed inset-0 z-[190] grid place-items-center bg-slate-950/50 p-4" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-5"><div><h2 className="text-xl font-black">{section.n}. {section.title}</h2><p className="mt-1 text-xs text-slate-500">{section.description}</p></div><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border">×</button></div><div className="grid gap-4 p-6 md:grid-cols-2">{(FIELDS[section.id]||[]).map(f=><ConfigField key={f[0]} field={f} value={draft[f[0]]} onChange={v=>change(f[0],v)}/>)}</div><div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white px-6 py-4"><button onClick={onClose} className="rounded-xl border px-4 py-2.5 text-xs font-black text-slate-600">Cancelar</button><button disabled={saving} onClick={save} className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving?"Guardando…":"Guardar configuración"}</button></div></div></div>}
function ConfigField({field,value,onChange}){const[k,label,type,options]=field;if(type==='checkbox')return <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 text-xs font-bold"><span>{label}</span><input type="checkbox" checked={Boolean(value)} onChange={e=>onChange(e.target.checked)} className="h-5 w-5 accent-blue-600"/></label>;return <label className="block text-xs font-black text-slate-700">{label}{type==='textarea'?<textarea rows={4} value={value??''} onChange={e=>onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"/>:type==='select'?<select value={value??''} onChange={e=>onChange(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"><option value="">Seleccionar…</option>{options.map(x=><option key={x} value={x}>{x}</option>)}</select>:<input type={type} value={value??''} onChange={e=>onChange(type==='number'?(e.target.value===''?'':Number(e.target.value)):e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal"/>}</label>}
function Notice({type,text,onClose}){return <div className={`mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${type==='success'?'border-emerald-200 bg-emerald-50 text-emerald-700':'border-red-200 bg-red-50 text-red-700'}`}><span>{text}</span><button onClick={onClose} className="font-black">×</button></div>}
