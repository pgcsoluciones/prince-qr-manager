import{useEffect,useState}from'react';
import TraceProjectTeamPage from'./TraceProjectTeamPage.jsx';

const BASE=import.meta.env.VITE_API_URL||'https://api.code.intaprd.com';
const ROLES={owner:'Propietario',manager:'Responsable',supervisor:'Supervisor',member:'Miembro',observer:'Observador'};
const authToken=()=>localStorage.getItem('qr_token')||'';
async function api(path,options={}){const r=await fetch(`${BASE}${path}`,{...options,headers:{Authorization:`Bearer ${authToken()}`,'Content-Type':'application/json',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok||d?.ok===false)throw new Error(d.message||d.error||`HTTP ${r.status}`);return d}

export default function TraceProjectTeamSecurePage({projectId}){
 const[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null),[team,setTeam]=useState(null);
 async function load(){if(!projectId)return;try{const d=await api(`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/team`);setTeam(d.data||null)}catch{}}
 useEffect(()=>{load()},[projectId]);
 async function createInvite(body){setBusy(true);setError('');try{const d=await api(`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/team/invitations`,{method:'POST',body:JSON.stringify(body)});setResult(d.data);setOpen(false);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function regenerate(id){setBusy(true);setError('');try{const d=await api(`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/team/invitations/${encodeURIComponent(id)}/regenerate`,{method:'POST',body:'{}'});setResult(d.data);await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function revoke(id){setBusy(true);setError('');try{await api(`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/team/invitations/${encodeURIComponent(id)}/revoke`,{method:'POST',body:'{}'});await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <div className="trace-secure-team relative"><style>{`.trace-secure-team > .team-base > div > header > div.relative > button:first-child{display:none!important}`}</style>
  <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3"><div><div className="text-xs font-black text-blue-900">Acceso de miembros por invitación segura</div><div className="mt-1 text-[11px] text-blue-700">Enlace de un solo uso + código temporal. El correo automático se conectará después.</div></div><button onClick={()=>setOpen(true)} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white">＋ Invitar miembro</button></div>
  {error&&<div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</div>}
  {(team?.invitations||[]).length>0&&<div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="text-xs font-black text-amber-900">Invitaciones pendientes · {team.invitations.length}</div><div className="mt-3 space-y-2">{team.invitations.map(i=><div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2"><div className="min-w-0"><div className="truncate text-xs font-black text-slate-800">{i.email}</div><div className="text-[10px] text-slate-500">{ROLES[i.project_role]||i.project_role}{i.department_name?` · ${i.department_name}`:''}</div></div><div className="flex gap-2"><button disabled={busy} onClick={()=>regenerate(i.id)} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-[10px] font-black text-amber-800">Generar nuevo enlace</button><button disabled={busy} onClick={()=>revoke(i.id)} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-[10px] font-black text-red-600">Cancelar</button></div></div>)}</div></div>}
  <div className="team-base"><TraceProjectTeamPage projectId={projectId}/></div>
  {open&&<InviteModal departments={team?.departments||[]} busy={busy} onClose={()=>setOpen(false)} onSave={createInvite}/>} 
  {result&&<InviteResult result={result} onClose={()=>setResult(null)}/>} 
 </div>
}

function InviteModal({departments,busy,onClose,onSave}){const[email,setEmail]=useState(''),[phone,setPhone]=useState(''),[projectRole,setRole]=useState('member'),[departmentId,setDepartment]=useState('');return <Modal title="Invitar miembro" onClose={onClose}><p className="text-xs leading-5 text-slate-500">La persona no será miembro activo hasta aceptar la invitación.</p><label className="mt-4 block text-xs font-black">Correo</label><input autoFocus value={email} onChange={e=>setEmail(e.target.value)} placeholder="persona@empresa.com" className="mt-2 w-full rounded-xl border px-4 py-3 text-sm"/><label className="mt-3 block text-xs font-black">Teléfono para validar</label><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+18095550000" className="mt-2 w-full rounded-xl border px-4 py-3 text-sm"/><select value={projectRole} onChange={e=>setRole(e.target.value)} className="mt-3 w-full rounded-xl border px-3 py-3 text-sm">{Object.entries(ROLES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><select value={departmentId} onChange={e=>setDepartment(e.target.value)} className="mt-3 w-full rounded-xl border px-3 py-3 text-sm"><option value="">Sin departamento</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><button disabled={busy||!email} onClick={()=>onSave({email,phone:phone||undefined,projectRole,departmentId})} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{busy?'Creando…':'Crear invitación segura'}</button></Modal>}

function InviteResult({result,onClose}){
 const url=`${window.location.origin}${result.acceptPath}`;
 const message=`Has sido invitado a KAWVO Trace.\n\nAbre este enlace para aceptar la invitación:\n${url}\n\nCódigo temporal: ${result.code}\n\nEl enlace y el código son de un solo uso.`;
 const whatsappUrl=`https://wa.me/?text=${encodeURIComponent(message)}`;
 async function copy(value){try{await navigator.clipboard.writeText(value);return true}catch{return false}}
 function openInvite(){window.open(url,'_blank','noopener,noreferrer')}
 function shareWhatsApp(){window.open(whatsappUrl,'_blank','noopener,noreferrer')}
 return <Modal title="Invitación creada" onClose={onClose}>
  <div className="rounded-2xl bg-emerald-50 p-4">
   <div className="text-xs font-black text-emerald-800">Enlace de un solo uso</div>
   <a href={url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-[11px] font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-900">{url}</a>
   <button onClick={openInvite} className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[10px] font-black text-emerald-800">Abrir enlace ↗</button>
  </div>
  <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-center"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Código temporal</div><div className="mt-1 text-3xl font-black tracking-[.25em] text-slate-950">{result.code}</div><div className="mt-1 text-[10px] text-slate-400">Expira: {result.expiresAt}</div></div>
  <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={()=>copy(url)} className="rounded-xl border px-3 py-3 text-xs font-black">Copiar enlace</button><button onClick={shareWhatsApp} className="rounded-xl bg-emerald-600 px-3 py-3 text-xs font-black text-white">Compartir por WhatsApp</button></div>
  <button onClick={()=>copy(message)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-black text-slate-600">Copiar mensaje completo</button>
  <p className="mt-4 text-[10px] leading-4 text-slate-400">Al generar un nuevo enlace, el anterior queda invalidado. El miembro solo se activa después de verificar el código y aceptar.</p>
 </Modal>
}
function Modal({title,onClose,children}){return <div className="fixed inset-0 z-[170] grid place-items-center bg-slate-950/45 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button onClick={onClose} className="text-xl text-slate-400">×</button></div>{children}</div></div>}
