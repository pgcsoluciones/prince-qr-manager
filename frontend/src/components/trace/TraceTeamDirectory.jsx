import{useEffect,useState}from'react';
import TraceTeamWorkspace from'./TraceTeamWorkspace.jsx';
const BASE=import.meta.env.VITE_API_URL||'https://api.code.intaprd.com';
function headers(){const token=localStorage.getItem('qr_token')||'';return{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})}}
export default function TraceTeamDirectoryV2(){
 const[data,setData]=useState({people:[],departments:[],projects:[]}),[error,setError]=useState('');
 async function load(){try{setError('');const r=await fetch(`${BASE}/api/trace/v1/admin/team-overview`,{headers:headers()});const d=await r.json();if(!r.ok)throw new Error(d.message||d.error);setData(d.data||{people:[],departments:[],projects:[]})}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[]);
 async function request(path,body,method='POST'){try{setError('');const r=await fetch(`${BASE}${path}`,{method,headers:headers(),body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.message||d.error);await load();return d}catch(e){setError(e.message);throw e}}
 return <div>{error&&<div className="mx-auto mb-4 max-w-[1450px] rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}<TraceTeamWorkspace people={data.people||[]} departments={data.departments||[]} projects={data.projects||[]} onAddDepartment={b=>request('/api/trace/v1/admin/workspace/departments',b)} onInvite={b=>request('/api/team/invite',b)} onAssign={(projectId,b)=>request(`/api/trace/v1/admin/workspace/projects/${encodeURIComponent(projectId)}/participants`,b)} onRemove={(projectId,b)=>request(`/api/trace/v1/admin/project-team/projects/${encodeURIComponent(projectId)}/participants`,b,'DELETE')}/></div>
}
