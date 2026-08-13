import { useEffect, useState } from "react";
import TraceProjectsCanvas from "./TraceProjectsCanvas.jsx";
import TraceProjectDetail from "./TraceProjectDetail.jsx";
import TraceTeamSimple from "./TraceTeamSimple.jsx";

const BASE=import.meta.env.VITE_API_URL||"https://api.code.intaprd.com";
const API="/api/trace/v1/admin/workspace";
function auth(){const token=localStorage.getItem("qr_token")||"";return{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})}}
async function req(path,options={}){const r=await fetch(`${BASE}${path}`,{...options,headers:{...auth(),...(options.headers||{})}});const d=await r.json().catch(()=>({ok:false,error:`HTTP ${r.status}`}));if(!r.ok||d?.ok===false)throw new Error(d?.message||d?.error||`HTTP ${r.status}`);return d}

export default function TraceWorkspaceSection({mode="projects",onOpenOperation,onMessage,onError}){
 const [data,setData]=useState({projects:[],people:[],departments:[]}),[project,setProject]=useState(null),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);try{const d=await req(API);setData(d.data||{projects:[],people:[],departments:[]})}catch(e){onError?.(e.message)}finally{setLoading(false)}}
 useEffect(()=>{load()},[]);
 async function createProject(payload){try{await req(`${API}/projects`,{method:"POST",body:JSON.stringify(payload)});onMessage?.("Proyecto agregado.");await load()}catch(e){onError?.(e.message)}}
 async function createDepartment(payload){try{await req(`${API}/departments`,{method:"POST",body:JSON.stringify(payload)});onMessage?.("Departamento agregado.");await load()}catch(e){onError?.(e.message)}}
 async function invite(payload){try{await req(`/api/team/invite`,{method:"POST",body:JSON.stringify(payload)});onMessage?.("Invitación enviada.");await load()}catch(e){onError?.(e.message)}}
 async function openProject(id){try{const d=await req(`${API}/projects/${encodeURIComponent(id)}`);setProject(d.data)}catch(e){onError?.(e.message)}}
 async function assignProject(id,payload){try{await req(`${API}/projects/${encodeURIComponent(id)}/participants`,{method:"POST",body:JSON.stringify(payload)});const d=await req(`${API}/projects/${encodeURIComponent(id)}`);setProject(d.data);await load();onMessage?.("Asignación guardada.")}catch(e){onError?.(e.message)}}
 if(loading)return <div className="grid min-h-[55vh] place-items-center text-sm text-slate-400">Cargando…</div>;
 if(mode==='team')return <TraceTeamSimple people={data.people||[]} departments={data.departments||[]} onAddDepartment={createDepartment} onInvite={invite}/>;
 if(project)return <TraceProjectDetail data={project} people={data.people||[]} departments={data.departments||[]} onBack={()=>setProject(null)} onOpenOperation={onOpenOperation} onAssign={assignProject}/>;
 return <TraceProjectsCanvas projects={data.projects||[]} onCreate={createProject} onOpen={openProject}/>;
}
