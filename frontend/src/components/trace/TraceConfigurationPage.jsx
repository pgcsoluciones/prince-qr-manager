import {useEffect,useMemo,useState} from "react";

const STATUS={complete:{label:"Completo",badge:"bg-emerald-50 text-emerald-700 border-emerald-200",icon:"✓"},progress:{label:"En configuración",badge:"bg-amber-50 text-amber-700 border-amber-200",icon:"!"},optional:{label:"Opcional",badge:"bg-slate-50 text-slate-500 border-slate-200",icon:"○"},pending:{label:"Requiere configuración",badge:"bg-red-50 text-red-700 border-red-200",icon:"!"}};
const SECTIONS=[
 {id:"company",n:1,icon:"▦",title:"Empresa",description:"Información general y preferencias de la empresa.",status:"complete"},
 {id:"projects",n:2,icon:"▣",title:"Proyectos",description:"Proyectos activos y configuración general.",status:"complete"},
 {id:"zones",n:3,icon:"⌂",title:"Zonas y Activos",description:"Estructura física y elementos trazables del proyecto.",status:"complete"},
 {id:"process",n:4,icon:"◇",title:"Proceso y trazabilidad",description:"Etapas, procesos, formularios y reglas de trazabilidad.",status:"complete"},
 {id:"team",n:5,icon:"♙",title:"Equipo y participantes",description:"Roles, permisos y organización de participantes.",status:"progress"},
 {id:"external",n:6,icon:"◎",title:"Actores externos",description:"Proveedores, contratistas y servicios externos.",status:"progress"},
 {id:"evidence",n:7,icon:"▤",title:"Evidencias",description:"Reglas, tipos y requisitos para la gestión de evidencias.",status:"complete"},
 {id:"notifications",n:8,icon:"♧",title:"Notificaciones",description:"Canales, plantillas y reglas de notificación.",status:"progress"},
 {id:"public",n:9,icon:"◉",title:"Vista pública",description:"Configuración de la información visible para clientes o externos.",status:"progress"},
 {id:"integrations",n:10,icon:"∞",title:"Integraciones",description:"Conexiones con otros sistemas.",status:"optional"},
 {id:"advanced",n:11,icon:"≡",title:"Avanzado",description:"Configuraciones avanzadas y parámetros adicionales.",status:"optional"},
];

export default function TraceConfigurationPage({projectId,projects=[]}){
 const storageKey=`trace_config_open_${projectId||"none"}`;
 const[open,setOpen]=useState(()=>localStorage.getItem(storageKey)||"company");
 const[dirty,setDirty]=useState({});
 const[notice,setNotice]=useState("");
 useEffect(()=>{localStorage.setItem(storageKey,open||"")},[open,storageKey]);
 const complete=SECTIONS.filter(s=>s.status==="complete").length;
 const attention=SECTIONS.filter(s=>s.status==="progress"||s.status==="pending").length;
 const pct=Math.round((complete/SECTIONS.length)*100);
 const activeProject=projects.find(p=>p.id===projectId)||projects[0];
 function toggle(id){setOpen(v=>v===id?"":id)}
 function markDirty(id){setDirty(v=>({...v,[id]:true}))}
 function save(){setDirty({});setNotice("Cambios de configuración guardados en este workspace.");setTimeout(()=>setNotice(""),2600)}
 function discard(){setDirty({});setNotice("Cambios sin guardar descartados.");setTimeout(()=>setNotice(""),2200)}
 return <div className="mx-auto max-w-[1550px]">
  <div className="mb-5"><h1 className="text-3xl font-black text-slate-950">Configuración</h1><p className="mt-1 text-sm text-slate-500">Define y personaliza los parámetros maestros de la empresa y del proyecto.</p></div>
  {notice&&<div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div>}
  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
   <section className="space-y-2">
    {SECTIONS.map(s=><Accordion key={s.id} section={s} open={open===s.id} dirty={dirty[s.id]} onToggle={()=>toggle(s.id)}>{contentFor(s.id,{projectId,activeProject,markDirty:()=>markDirty(s.id)})}</Accordion>)}
   </section>
   <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-base font-black">Resumen de configuración</h2><div className="mt-5 flex items-center gap-4"><div className="grid h-20 w-20 place-items-center rounded-full border-[7px] border-blue-100 text-xl font-black text-blue-700">{pct}%</div><div><div className="text-xs font-black text-slate-700">Configuración general</div><div className="mt-1 text-[11px] leading-4 text-slate-400">{complete} completas · {attention} requieren atención</div></div></div><div className="mt-5 space-y-2">{SECTIONS.map(s=><div key={s.id} className="flex items-center justify-between gap-3 text-[11px]"><span className="truncate font-semibold text-slate-600">{s.n}. {s.title}</span><span className={s.status==="complete"?"font-black text-emerald-600":s.status==="optional"?"text-slate-400":"font-bold text-amber-600"}>{STATUS[s.status].label}</span></div>)}</div></div>
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-[11px] leading-5 text-blue-800">Los cambios en parámetros maestros deben quedar registrados en el historial de auditoría. Abrir o cerrar un acordeón no guarda cambios.</div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="text-xs font-black">Acciones rápidas</h3><div className="mt-3 space-y-2"><Quick>Duplicar configuración</Quick><Quick>Exportar configuración</Quick><Quick danger>Restablecer valores</Quick></div></div>
    <div className="grid grid-cols-2 gap-2"><button disabled={!Object.keys(dirty).length} onClick={discard} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-600 disabled:opacity-40">Descartar cambios</button><button disabled={!Object.keys(dirty).length} onClick={save} className="rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white disabled:opacity-40">Guardar cambios</button></div>
   </aside>
  </div>
 </div>
}

function Accordion({section,open,dirty,onToggle,children}){const st=STATUS[section.status];return <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${dirty?"border-amber-300":"border-slate-200"}`}><button onClick={onToggle} className="flex w-full items-center gap-4 px-5 py-4 text-left"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-lg font-black text-blue-600">{section.icon}</span><span className="min-w-0 flex-1"><span className="block text-sm font-black text-slate-900">{section.n}. {section.title}</span><span className="mt-0.5 block truncate text-[11px] text-slate-500">{section.description}</span></span>{dirty&&<span className="hidden rounded-lg bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-700 sm:block">Cambios sin guardar</span>}<span className={`hidden rounded-lg border px-2.5 py-1 text-[9px] font-black sm:block ${st.badge}`}>{st.icon} {st.label}</span><span className="text-lg text-slate-400">{open?"⌃":"⌄"}</span></button>{open&&<div className="border-t border-slate-100 bg-slate-50/35 p-5">{children}</div>}</div>}

function contentFor(id,ctx){switch(id){
 case"company":return <Company markDirty={ctx.markDirty}/>;
 case"projects":return <Projects project={ctx.activeProject} markDirty={ctx.markDirty}/>;
 case"zones":return <Zones markDirty={ctx.markDirty}/>;
 case"process":return <Process markDirty={ctx.markDirty}/>;
 case"team":return <Team markDirty={ctx.markDirty}/>;
 case"external":return <External markDirty={ctx.markDirty}/>;
 case"evidence":return <Evidence markDirty={ctx.markDirty}/>;
 case"notifications":return <Notifications markDirty={ctx.markDirty}/>;
 case"public":return <Public markDirty={ctx.markDirty}/>;
 case"integrations":return <Integrations markDirty={ctx.markDirty}/>;
 case"advanced":return <Advanced markDirty={ctx.markDirty}/>;
 default:return null;
}}
const Box=({title,children})=><div className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="text-xs font-black text-slate-900">{title}</h3><div className="mt-4">{children}</div></div>;
const Pair=({label,value})=><div className="grid grid-cols-[130px_1fr] gap-3 py-1.5 text-[11px]"><span className="text-slate-400">{label}</span><span className="font-semibold text-slate-700">{value}</span></div>;
const Btn=({children,onClick})=><button onClick={onClick} className="mt-4 rounded-xl border border-blue-200 bg-white px-3 py-2 text-[10px] font-black text-blue-600 hover:bg-blue-50">{children}</button>;
const Toggle=({label,onChange,defaultChecked=false})=><label className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-[11px] font-semibold text-slate-600 last:border-0"><span>{label}</span><input type="checkbox" defaultChecked={defaultChecked} onChange={onChange} className="h-4 w-4 accent-blue-600"/></label>;
const Pill=({children})=><span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{children}</span>;
function Company({markDirty}){return <div className="grid gap-4 lg:grid-cols-2"><Box title="Información de la empresa"><Pair label="Nombre comercial" value="Empresa / tenant activo"/><Pair label="Razón social" value="Pendiente de completar"/><Pair label="RNC" value="Pendiente"/><Pair label="Correo" value="Cuenta administradora"/><Pair label="Teléfono" value="Formato E.164"/><Pair label="Dirección" value="República Dominicana"/><Btn onClick={markDirty}>Editar empresa</Btn></Box><Box title="Preferencias"><Pair label="Zona horaria" value="America/Santo_Domingo (GMT-04:00)"/><Pair label="Moneda" value="DOP · Peso Dominicano"/><Pair label="Idioma" value="Español (República Dominicana)"/><Pair label="Formato de fecha" value="DD/MM/YYYY"/><Pair label="Unidades" value="Métricas / configurables"/><Btn onClick={markDirty}>Editar preferencias</Btn></Box></div>}
function Projects({project,markDirty}){return <div className="grid gap-4 lg:grid-cols-2"><Box title="Proyecto activo"><Pair label="Nombre" value={project?.name||"Proyecto seleccionado"}/><Pair label="Estado" value={project?.status||"Activo"}/><Pair label="Ubicación" value="Configurable por proyecto"/><Pair label="Plantilla" value="Proceso TRACE V1"/><Btn onClick={markDirty}>Editar proyecto</Btn></Box><Box title="Gestión"><div className="flex flex-wrap gap-2"><Pill>Crear proyecto</Pill><Pill>Duplicar</Pill><Pill>Activar / desactivar</Pill><Pill>Fechas</Pill><Pill>Configuración individual</Pill></div><Btn onClick={markDirty}>Gestionar proyectos</Btn></Box></div>}
function Zones({markDirty}){return <div className="grid gap-4 lg:grid-cols-2"><Box title="Zonas"><div className="flex flex-wrap gap-2">{["Torres","Niveles","Áreas","Almacenes","Espacios","Subzonas"].map(x=><Pill key={x}>{x}</Pill>)}</div><Btn onClick={markDirty}>Gestionar zonas</Btn></Box><Box title="Activos"><div className="flex flex-wrap gap-2">{["Equipos","Maquinarias","Unidades","Elementos constructivos","Lotes","Materiales controlados","QR relacionado"].map(x=><Pill key={x}>{x}</Pill>)}</div><Btn onClick={markDirty}>Gestionar activos</Btn></Box></div>}
function Process({markDirty}){return <div className="grid gap-4 lg:grid-cols-2"><Box title="Proceso y reglas"><div className="flex flex-wrap gap-2">{["Proceso activo","Versión","Etapas","Actividades","Dependencias","Obligatorias","Reglas de evidencia","Aprobación","Bloqueo","Condiciones de avance"].map(x=><Pill key={x}>{x}</Pill>)}</div><Btn onClick={markDirty}>Gestionar proceso</Btn></Box><Box title="Trazabilidad de cubicación"><Pair label="Tipo" value="Configurable"/><Pair label="Unidad" value="m² / m³ / unidad / otra"/><Pair label="Fórmula" value="Definida por partida"/><Pair label="Tolerancia" value="Configurable"/><Pair label="Control" value="Evidencia + responsable + doble revisión + aprobación"/><Btn onClick={markDirty}>Configurar cubicación</Btn></Box></div>}
function Team({markDirty}){return <div className="grid gap-4 lg:grid-cols-2"><Box title="Reglas maestras"><div className="flex flex-wrap gap-2">{["Roles","Permisos","Departamentos","Grupos de trabajo","Reglas de acceso","Participantes por proyecto","Invitaciones"].map(x=><Pill key={x}>{x}</Pill>)}</div><Btn onClick={markDirty}>Editar reglas</Btn></Box><Box title="Carga masiva"><Pair label="Importación" value="Excel con validación previa"/><Pair label="Plantilla" value="Archivo de ejemplo descargable"/><Pair label="Operación diaria" value="Se gestiona desde Equipo"/><Btn onClick={markDirty}>Configurar importación</Btn></Box></div>}
function External({markDirty}){return <div className="grid gap-4 lg:grid-cols-3"><Box title="Proveedores"><div className="flex flex-wrap gap-2">{["Empresa","Contacto","RNC","Categoría","Materiales","Proyectos"].map(x=><Pill key={x}>{x}</Pill>)}</div><Btn onClick={markDirty}>Gestionar proveedores</Btn></Box><Box title="Contratistas"><div className="flex flex-wrap gap-2">{["Especialidad","Responsable","Partidas","Zonas","Contrato / referencia"].map(x=><Pill key={x}>{x}</Pill>)}</div><Btn onClick={markDirty}>Gestionar contratistas</Btn></Box><Box title="Servicios externos"><div className="flex flex-wrap gap-2">{["Laboratorio","Transporte","Seguridad","Fumigación","Alquiler","Topografía","Mantenimiento"].map(x=><Pill key={x}>{x}</Pill>)}</div><Btn onClick={markDirty}>Gestionar servicios</Btn></Box></div>}
function Evidence({markDirty}){return <div className="grid gap-4 lg:grid-cols-2"><Box title="Archivos"><Pair label="Tipos permitidos" value="Imagen, PDF, DOCX y configurables"/><Pair label="Tamaños" value="Límites por plan / proyecto"/><Pair label="Optimización" value="Compresión y procesamiento"/><Pair label="Retención" value="Política configurable"/><Btn onClick={markDirty}>Editar reglas</Btn></Box><Box title="Marca de agua"><Toggle label="Activar marca de agua" defaultChecked onChange={markDirty}/><div className="mt-2 flex flex-wrap gap-2">{["Posición","Tamaño","Opacidad","Logo","Fecha / hora","Proyecto","Zona","Usuario","Etapa","Actividad","Coordenadas","ID evidencia"].map(x=><Pill key={x}>{x}</Pill>)}</div><div className="mt-3 flex gap-2"><Pill>Básica</Pill><Pill>Institucional</Pill><Pill>Técnica</Pill><Pill>Completa</Pill></div></Box></div>}
function Notifications({markDirty}){return <div className="grid gap-4 lg:grid-cols-3"><Box title="Canales">{["Plataforma","Correo","Push","WhatsApp","SMS","Webhook"].map((x,i)=><Toggle key={x} label={x} defaultChecked={i<2} onChange={markDirty}/>)}</Box><Box title="Eventos"><div className="flex flex-wrap gap-2">{["Asignación","Actividad atrasada","Incidencia crítica","Aprobación","Observación","Rechazo","Cambio responsable","Reporte"].map(x=><Pill key={x}>{x}</Pill>)}</div></Box><Box title="Escalamiento"><Pair label="Recordatorio" value="Configurable"/><Pair label="Vencimiento" value="Configurable"/><Pair label="Supervisor" value="Escala automática"/><Pair label="Administrador" value="Último nivel"/><Pair label="Tiempo máximo" value="Por regla"/></Box></div>}
function Public({markDirty}){return <Box title="Vista pública del proyecto"><Toggle label="Activar vista pública" onChange={markDirty}/><div className="mt-3 flex flex-wrap gap-2">{["Branding","Avance visible","Hitos","Evidencias públicas","Reportes públicos","Contacto","Expiración","PIN / token"].map(x=><Pill key={x}>{x}</Pill>)}</div><Btn onClick={markDirty}>Configurar vista pública</Btn></Box>}
function Integrations({markDirty}){return <Box title="Conexiones"><div className="flex flex-wrap gap-2">{["Email","WhatsApp / API","Mapas","Firma","Almacenamiento","Webhooks","ERP","Contabilidad","API externas"].map(x=><Pill key={x}>{x}</Pill>)}</div><Btn onClick={markDirty}>Gestionar integraciones</Btn></Box>}
function Advanced({markDirty}){return <Box title="Parámetros avanzados"><div className="flex flex-wrap gap-2">{["Nomenclaturas","Códigos","Seriales","Reglas especiales","Archivado","Exportación","Duplicado de configuración","Restablecer valores","Parámetros técnicos"].map(x=><Pill key={x}>{x}</Pill>)}</div><Btn onClick={markDirty}>Editar avanzado</Btn></Box>}
function Quick({children,danger}){return <button className={`w-full rounded-xl border px-3 py-2.5 text-left text-[11px] font-black ${danger?"border-red-200 text-red-600":"border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{children}</button>}
