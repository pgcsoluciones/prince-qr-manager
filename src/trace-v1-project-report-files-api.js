import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";
import { renderReportFile,reportFilename,sha256Hex } from "./trace/report-renderers.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=()=>crypto.randomUUID();
const parse=(v,f={})=>{try{return v?JSON.parse(v):f}catch{return f}};

async function context(request,env){
 const h=request.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))return null;
 let ok=false,token=h.slice(7).trim();try{ok=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null}if(!ok)return null;
 const p=jwt.decode(token)?.payload||{};if((p.session_type||"standard")!=="standard")return null;
 const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;
 const db=getTraceDatabase(env),user=await db.prepare(`SELECT id,email,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null;return{db,user,tenantId:user.enterprise_id||user.id};
}

async function reportRow(c,projectId,reportId){
 const row=await c.db.prepare(`SELECT r.* FROM trace_reports r WHERE r.id=? AND r.tenant_id=? AND r.project_id=? LIMIT 1`).bind(reportId,c.tenantId,projectId).first();if(!row)return null;
 if(c.user.id!==c.tenantId){const p=await c.db.prepare(`SELECT 1 ok FROM trace_project_participants WHERE tenant_id=? AND project_id=? AND user_id=? AND status='active' LIMIT 1`).bind(c.tenantId,projectId,c.user.id).first();if(!p)return null}
 return row;
}
function mapped(row){return{...row,type:row.report_type,definition:parse(row.definition_json,{}),snapshot:parse(row.snapshot_json,{}),generatedAt:row.generated_at,code:`RPT-${String(row.id).replace(/-/g,"").slice(0,8).toUpperCase()}`}}
function publicFile(f,projectId,reportId){return{id:f.id,format:f.format,filename:f.original_filename,mimeType:f.mime_type,sizeBytes:Number(f.size_bytes||0),checksum:f.checksum_sha256,status:f.status,generatedAt:f.generated_at,fileUrl:`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/reports/${encodeURIComponent(reportId)}/files/${f.format}`}}

async function generate(c,env,projectId,reportId,format){
 if(!env.ASSETS)return json({ok:false,error:"report_storage_unavailable"},503);
 const row=await reportRow(c,projectId,reportId);if(!row)return json({ok:false,error:"report_not_found_or_forbidden"},404);
 const report=mapped(row),rendered=renderReportFile(report,format),bytes=rendered.bytes instanceof Uint8Array?rendered.bytes:new Uint8Array(rendered.bytes),filename=reportFilename(report,format),checksum=await sha256Hex(bytes),r2Key=`trace/${c.tenantId}/reports/${projectId}/${reportId}/${format}/${checksum.slice(0,16)}.${format}`;
 await env.ASSETS.put(r2Key,bytes,{httpMetadata:{contentType:rendered.mime},customMetadata:{tenantId:c.tenantId,projectId,reportId,format,checksum,generatedBy:c.user.id}});
 const old=await c.db.prepare(`SELECT r2_key FROM trace_report_files WHERE report_id=? AND format=? LIMIT 1`).bind(reportId,format).first();
 const id=uuid();
 try{
  await c.db.prepare(`INSERT INTO trace_report_files(id,report_id,format,r2_key,original_filename,mime_type,size_bytes,checksum_sha256,status,generated_at,metadata_json) VALUES(?,?,?,?,?,?,?,?, 'ready',datetime('now'),?) ON CONFLICT(report_id,format) DO UPDATE SET r2_key=excluded.r2_key,original_filename=excluded.original_filename,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,checksum_sha256=excluded.checksum_sha256,status='ready',generated_at=datetime('now'),metadata_json=excluded.metadata_json`).bind(id,reportId,format,r2Key,filename,rendered.mime,bytes.byteLength,checksum,JSON.stringify({snapshotAt:report.snapshot?.snapshotAt||null,generatedBy:c.user.id})).run();
 }catch(error){await env.ASSETS.delete(r2Key).catch(()=>{});throw error}
 if(old?.r2_key&&old.r2_key!==r2Key)await env.ASSETS.delete(old.r2_key).catch(()=>{});
 const stored=await c.db.prepare(`SELECT * FROM trace_report_files WHERE report_id=? AND format=? LIMIT 1`).bind(reportId,format).first();
 return json({ok:true,data:publicFile(stored,projectId,reportId)},201);
}

async function serve(c,env,projectId,reportId,format){
 if(!env.ASSETS)return json({ok:false,error:"report_storage_unavailable"},503);
 const row=await reportRow(c,projectId,reportId);if(!row)return json({ok:false,error:"report_not_found_or_forbidden"},404);
 const f=await c.db.prepare(`SELECT * FROM trace_report_files WHERE report_id=? AND format=? AND status='ready' LIMIT 1`).bind(reportId,format).first();if(!f)return json({ok:false,error:"report_file_not_generated"},404);
 const obj=await env.ASSETS.get(f.r2_key);if(!obj)return json({ok:false,error:"report_file_missing"},404);
 const h=new Headers();obj.writeHttpMetadata(h);for(const[k,v]of Object.entries(CORS))h.set(k,v);h.set("Cache-Control","private, max-age=300");h.set("Content-Disposition",`attachment; filename="${String(f.original_filename||`report.${format}`).replace(/["\r\n]/g,"")}"`);h.set("X-Trace-Report-Id",reportId);h.set("X-Content-Checksum",f.checksum_sha256||"");return new Response(obj.body,{headers:h});
}

export async function handleTraceV1ProjectReportFilesApi(request,env){
 const url=new URL(request.url),m=url.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/reports\/([^/]+)\/files\/(pdf|docx|xlsx)$/);if(!m)return null;
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 const c=await context(request,env);if(!c)return json({ok:false,error:"unauthorized"},401);
 const projectId=decodeURIComponent(m[1]),reportId=decodeURIComponent(m[2]),format=m[3];
 if(request.method==="POST")return generate(c,env,projectId,reportId,format);
 if(request.method==="GET")return serve(c,env,projectId,reportId,format);
 return json({ok:false,error:"method_not_allowed"},405);
}
