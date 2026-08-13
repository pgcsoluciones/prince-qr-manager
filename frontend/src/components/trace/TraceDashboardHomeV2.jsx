import{useEffect,useState}from'react';
import TraceProjectsCanvas from'./TraceProjectsCanvas.jsx';
import TraceProjectDetailV2 from'./TraceProjectDetailV2.jsx';
const BASE=import.meta.env.VITE_API_URL||'https://api.code.intaprd.com';
function headers(){const token=localStorage.getItem('qr_token')||'';return{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}}
export default function TraceDashboardHomeV2({onOpenOperation}){
 const[data,setData]=useState({projects:[],people:[],departments:[]}),[detail,setDetail]=useState(null),[error,setError]=useState('');
 async function load(){try{setError('');const r=await fetch(`${BASE}/api/trace/v1/admin/workspace`,{headers:headers()});const d=await r.json();if(!r.ok)throw new Error(d.message||d.error);setData(d.data||{projects:[],people:[],departments:[]})}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[]);
 async function openProject(id){try{setError('');const r=await fetch(`${BASE}/api/trace/v1/admin/workspace/projects/${encodeURIComponent(id)}`,{headers:headers()});const d=await r.json();if(!r.ok)throw new Error(d.message||d.error);setDetail(d.data)}catch(e){setError(e.message)}}
 async function request(path,body,method='POST'){const r=await fetch(`${BASE}${path}`,{method,headers:headers(),body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.message||d.error);await load();return d}
 async function createProject(body){try{const d=await request('/api/trace/v1/admin/workspace/projects',body);await openProject(d.data.id)}catch(e){setError(e.message)}}
 async function assign(projectId,body){try{await request(`/api/trace/v1/admin/workspace/projects/${encodeURIComponent(projectId)}/participants`,body);await openProject(projectId)}catch(e){setError(e.message)}}
 async function remove(projectId,body){try{await request(`/api/trace/v1/admin/project-team/projects/${encodeURIComponent(projectId)}/participants`,body,'DELETE');await openProject(projectId)}catch(e){setError(e.message)}}
 return <div>{error&&<div className="mx-auto mb-4 max-w-[1250px] rounded-xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</div>}{detail?<TraceProjectDetailV2 data={detail} people={data.people||[]} departments={data.departments||[]} onBack={()=>setDetail(null)} onOpenOperation={onOpenOperation} onAssign={assign} onRemove={remove}/>:<TraceProjectsCanvas projects={data.projects||[]} onCreate={createProject} onOpen={openProject}/>}</div>
}
