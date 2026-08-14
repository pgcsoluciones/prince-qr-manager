import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";
import { evidenceExtension, sanitizeEvidenceMetadata, validateEvidenceUpload } from "./trace/shared/evidence-media.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=()=>crypto.randomUUID();
const text=(v,n=4000)=>{const s=String(v??"").trim();return s?s.slice(0,n):null};
const parse=(v,f={})=>{try{return v?JSON.parse(v):f}catch{return f}};
const safeArray=v=>Array.isArray(v)?v.map(x=>String(x||"").trim()).filter(Boolean):[];

async function context(request,env){
 const h=request.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))return null;
 const token=h.slice(7).trim();let ok=false;try{ok=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null}if(!ok)return null;
 const p=jwt.decode(token)?.payload||{};if((p.session_type||"standard")!=="standard")return null;
 const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;
 const db=getTraceDatabase(env);const user=await db.prepare(`SELECT id,email,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null;return{db,user,tenantId:user.enterprise_id||user.id};
}
async function project(c,projectId){return c.db.prepare(`SELECT id,name,status FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first()}
async function sha256Hex(buffer){const digest=await crypto.subtle.digest('SHA-256',buffer);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}

async function hierarchy(c,projectId,{executionId,stageId,activityId}){
 let execution=null,stage=null,activity=null;
 if(executionId){execution=await c.db.prepare(`SELECT id,execution_code,title,asset_id FROM trace_executions WHERE id=? AND tenant_id=? AND asset_id=? LIMIT 1`).bind(executionId,c.tenantId,projectId).first();if(!execution)return{error:'invalid_execution'}}
 if(stageId){if(!execution)return{error:'stage_requires_execution'};stage=await c.db.prepare(`SELECT es.id,es.execution_id,s.name stage_name,s.id stage_id FROM trace_execution_stages es JOIN trace_stages s ON s.id=es.stage_id WHERE es.id=? AND es.execution_id=? LIMIT 1`).bind(stageId,execution.id).first();if(!stage)return{error:'invalid_execution_stage'}}
 if(activityId){if(!stage)return{error:'activity_requires_stage'};activity=await c.db.prepare(`SELECT id,title,execution_id,execution_stage_id FROM trace_execution_activities WHERE id=? AND tenant_id=? AND execution_id=? AND execution_stage_id=? LIMIT 1`).bind(activityId,c.tenantId,execution.id,stage.id).first();if(!activity)return{error:'invalid_execution_activity'}}
 return{execution,stage,activity};
}

async function contextOptions(c,projectId){
 const p=await project(c,projectId);if(!p)return json({ok:false,error:'project_not_found'},404);
 const [usersR,deptsR]=await Promise.all([
  c.db.prepare(`SELECT DISTINCT u.id,u.email,pp.project_role FROM trace_project_participants pp JOIN users u ON u.id=pp.user_id WHERE pp.tenant_id=? AND pp.project_id=? AND pp.status='active' AND pp.user_id IS NOT NULL AND u.is_active=1 ORDER BY u.email`).bind(c.tenantId,projectId).all(),
  c.db.prepare(`SELECT DISTINCT d.id,d.name,pp.project_role FROM trace_project_participants pp JOIN trace_departments d ON d.id=pp.department_id WHERE pp.tenant_id=? AND pp.project_id=? AND pp.status='active' AND pp.department_id IS NOT NULL AND d.status='active' ORDER BY d.name`).bind(c.tenantId,projectId).all()
 ]);
 return json({ok:true,data:{project:p,people:usersR.results||[],departments:deptsR.results||[]}});
}

async function list(c,projectId){
 const p=await project(c,projectId);if(!p)return json({ok:false,error:'project_not_found'},404);
 const rows=await c.db.prepare(`SELECT li.*,e.execution_code,e.title execution_title,s.name stage_name,a.title activity_title FROM trace_evidence_library_items li LEFT JOIN trace_executions e ON e.id=li.execution_id LEFT JOIN trace_execution_stages es ON es.id=li.execution_stage_id LEFT JOIN trace_stages s ON s.id=es.stage_id LEFT JOIN trace_execution_activities a ON a.id=li.execution_activity_id WHERE li.tenant_id=? AND li.project_id=? AND li.owner_user_id=? ORDER BY li.created_at DESC LIMIT 100`).bind(c.tenantId,projectId,c.user.id).all();
 const items=[];for(const r of rows.results||[]){
  const [mentionsR,linksR]=await Promise.all([
   c.db.prepare(`SELECT m.mentioned_user_id,u.email mentioned_user_email,m.mentioned_department_id,d.name mentioned_department_name FROM trace_evidence_library_mentions m LEFT JOIN users u ON u.id=m.mentioned_user_id LEFT JOIN trace_departments d ON d.id=m.mentioned_department_id WHERE m.library_item_id=? ORDER BY m.created_at`).bind(r.id).all(),
   c.db.prepare(`SELECT id,link_type,link_id,note,created_at FROM trace_evidence_library_links WHERE library_item_id=? ORDER BY created_at DESC`).bind(r.id).all()
  ]);
  items.push({id:r.id,category:r.category,visibility:r.visibility,title:r.title||r.original_filename||'Evidencia',notes:r.notes||null,tags:parse(r.tags_json,[]),type:r.evidence_type,mimeType:r.mime_type,fileSize:Number(r.file_size||0),originalFilename:r.original_filename,createdAt:r.created_at,capturedAt:r.captured_at,executionId:r.execution_id,executionCode:r.execution_code,executionTitle:r.execution_title,executionStageId:r.execution_stage_id,stageName:r.stage_name,executionActivityId:r.execution_activity_id,activityTitle:r.activity_title,mentions:mentionsR.results||[],links:linksR.results||[],fileUrl:`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/evidence-library/${encodeURIComponent(r.id)}/file`,thumbnailUrl:r.thumbnail_r2_key?`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/evidence-library/${encodeURIComponent(r.id)}/thumbnail`:null});
 }
 return json({ok:true,data:{project:p,items}});
}

async function upload(request,c,env,projectId){
 const p=await project(c,projectId);if(!p)return json({ok:false,error:'project_not_found'},404);if(!env.ASSETS)return json({ok:false,error:'evidence_storage_unavailable'},503);
 let f;try{f=await request.formData()}catch{return json({ok:false,error:'invalid_multipart'},400)}
 const executionId=text(f.get('executionId'),100),stageId=text(f.get('executionStageId'),100),activityId=text(f.get('executionActivityId'),100),category=text(f.get('category'),40)||'general',title=text(f.get('title'),240),notes=text(f.get('notes'),4000),visibility=text(f.get('visibility'),20)||'private',file=f.get('file'),thumb=f.get('thumbnail');
 if(!['general','documentation','refutation','correction','inspection','reference'].includes(category))return json({ok:false,error:'invalid_category'},422);if(!['private','context'].includes(visibility))return json({ok:false,error:'invalid_visibility'},422);
 const h=await hierarchy(c,projectId,{executionId,stageId,activityId});if(h.error)return json({ok:false,error:h.error},422);
 const check=validateEvidenceUpload(file);if(!check.ok)return json({ok:false,error:check.error,mime:check.mime||null,maxBytes:check.maxBytes||null},422);
 const tags=safeArray(parse(text(f.get('tags'),3000),[])).slice(0,20),mentionUserIds=safeArray(parse(text(f.get('mentionUserIds'),4000),[])).slice(0,30),mentionDepartmentIds=safeArray(parse(text(f.get('mentionDepartmentIds'),4000),[])).slice(0,30),metadata=sanitizeEvidenceMetadata(parse(text(f.get('metadata'),8000),{}));
 const validUsers=[];for(const id of mentionUserIds){const row=await c.db.prepare(`SELECT pp.user_id FROM trace_project_participants pp JOIN users u ON u.id=pp.user_id WHERE pp.tenant_id=? AND pp.project_id=? AND pp.user_id=? AND pp.status='active' AND u.is_active=1 LIMIT 1`).bind(c.tenantId,projectId,id).first();if(row)validUsers.push(id)}
 const validDepts=[];for(const id of mentionDepartmentIds){const row=await c.db.prepare(`SELECT pp.department_id FROM trace_project_participants pp JOIN trace_departments d ON d.id=pp.department_id WHERE pp.tenant_id=? AND pp.project_id=? AND pp.department_id=? AND pp.status='active' AND d.status='active' LIMIT 1`).bind(c.tenantId,projectId,id).first();if(row)validDepts.push(id)}
 const id=uuid(),mime=check.mime,evidenceType=check.evidenceType,ext=evidenceExtension(file.name,mime),key=`trace-library/${c.tenantId}/${projectId}/${c.user.id}/${id}.${ext}`,buffer=await file.arrayBuffer(),checksum=await sha256Hex(buffer);await env.ASSETS.put(key,buffer,{httpMetadata:{contentType:mime},customMetadata:{tenantId:c.tenantId,projectId,ownerUserId:c.user.id,libraryItemId:id}});
 let thumbKey=null;if(thumb&&typeof thumb!=='string'&&thumb.size>0&&thumb.size<=2*1024*1024&&String(thumb.type||'').startsWith('image/')){thumbKey=`trace-library/${c.tenantId}/${projectId}/${c.user.id}/${id}.thumb.jpg`;await env.ASSETS.put(thumbKey,await thumb.arrayBuffer(),{httpMetadata:{contentType:thumb.type||'image/jpeg'}})}
 const statements=[c.db.prepare(`INSERT INTO trace_evidence_library_items(id,tenant_id,project_id,execution_id,execution_stage_id,execution_activity_id,owner_user_id,category,visibility,title,notes,tags_json,evidence_type,r2_key,thumbnail_r2_key,original_filename,mime_type,file_size,checksum,metadata_json,captured_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,c.tenantId,projectId,h.execution?.id||null,h.stage?.id||null,h.activity?.id||null,c.user.id,category,visibility,title,notes,JSON.stringify(tags),evidenceType,key,thumbKey,text(file.name,255)||'evidence',mime,file.size,checksum,JSON.stringify(metadata),text(f.get('capturedAt'),80))];
 for(const userId of validUsers)statements.push(c.db.prepare(`INSERT INTO trace_evidence_library_mentions(id,tenant_id,library_item_id,mentioned_user_id,created_by) VALUES(?,?,?,?,?)`).bind(uuid(),c.tenantId,id,userId,c.user.id));
 for(const departmentId of validDepts)statements.push(c.db.prepare(`INSERT INTO trace_evidence_library_mentions(id,tenant_id,library_item_id,mentioned_department_id,created_by) VALUES(?,?,?,?,?)`).bind(uuid(),c.tenantId,id,departmentId,c.user.id));
 if(h.stage)statements.push(c.db.prepare(`INSERT OR IGNORE INTO trace_evidence_library_links(id,tenant_id,library_item_id,project_id,link_type,link_id,note,linked_by) VALUES(?,?,?,?,?,?,?,?)`).bind(uuid(),c.tenantId,id,projectId,h.activity?'activity':'stage',h.activity?.id||h.stage.id,'Vínculo de captura',c.user.id));
 await c.db.batch(statements);
 return json({ok:true,data:{id,visibility,category}},201);
}

async function link(request,c,projectId,itemId){
 const item=await c.db.prepare(`SELECT id,execution_id,execution_stage_id FROM trace_evidence_library_items WHERE id=? AND tenant_id=? AND project_id=? AND owner_user_id=? LIMIT 1`).bind(itemId,c.tenantId,projectId,c.user.id).first();if(!item)return json({ok:false,error:'library_item_not_found'},404);
 let body={};try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}const linkType=text(body.linkType,30),linkId=text(body.linkId,100),note=text(body.note,1000);if(!['stage','activity','incident','approval'].includes(linkType)||!linkId)return json({ok:false,error:'invalid_link'},422);
 let target=null;if(linkType==='stage')target=await c.db.prepare(`SELECT es.id FROM trace_execution_stages es JOIN trace_executions e ON e.id=es.execution_id WHERE es.id=? AND e.tenant_id=? AND e.asset_id=? LIMIT 1`).bind(linkId,c.tenantId,projectId).first();
 if(linkType==='activity')target=await c.db.prepare(`SELECT ea.id FROM trace_execution_activities ea JOIN trace_executions e ON e.id=ea.execution_id WHERE ea.id=? AND ea.tenant_id=? AND e.asset_id=? LIMIT 1`).bind(linkId,c.tenantId,projectId).first();
 if(linkType==='incident')target=await c.db.prepare(`SELECT i.id FROM trace_incidents i JOIN trace_executions e ON e.id=i.execution_id WHERE i.id=? AND i.tenant_id=? AND e.asset_id=? LIMIT 1`).bind(linkId,c.tenantId,projectId).first();
 if(linkType==='approval')target=await c.db.prepare(`SELECT ap.id FROM trace_approvals ap JOIN trace_executions e ON e.id=ap.execution_id WHERE ap.id=? AND ap.tenant_id=? AND e.asset_id=? LIMIT 1`).bind(linkId,c.tenantId,projectId).first();
 if(!target)return json({ok:false,error:'link_target_not_found'},404);
 await c.db.prepare(`INSERT OR IGNORE INTO trace_evidence_library_links(id,tenant_id,library_item_id,project_id,link_type,link_id,note,linked_by) VALUES(?,?,?,?,?,?,?,?)`).bind(uuid(),c.tenantId,itemId,projectId,linkType,linkId,note,c.user.id).run();
 await c.db.prepare(`UPDATE trace_evidence_library_items SET visibility='context',updated_at=datetime('now') WHERE id=?`).bind(itemId).run();
 return json({ok:true,data:{itemId,linkType,linkId}});
}

async function serve(c,env,projectId,itemId,thumbnail=false){
 const item=await c.db.prepare(`SELECT * FROM trace_evidence_library_items WHERE id=? AND tenant_id=? AND project_id=? AND owner_user_id=? LIMIT 1`).bind(itemId,c.tenantId,projectId,c.user.id).first();if(!item)return json({ok:false,error:'library_item_not_found'},404);const key=thumbnail?item.thumbnail_r2_key:item.r2_key;if(!key||!env.ASSETS)return json({ok:false,error:'library_file_not_found'},404);const obj=await env.ASSETS.get(key);if(!obj)return json({ok:false,error:'library_file_not_found'},404);const headers=new Headers();obj.writeHttpMetadata(headers);headers.set('Cache-Control','private, max-age=300');headers.set('Content-Disposition',`inline; filename="${(item.original_filename||'evidence').replace(/"/g,'')}"`);return new Response(obj.body,{headers});
}

export async function handleTraceV1EvidenceLibraryApi(request,env){
 const u=new URL(request.url);
 const contextMatch=u.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/evidence-library\/context$/);
 const mainMatch=u.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/evidence-library(?:\/([^/]+)(?:\/(links|file|thumbnail))?)?$/);
 if(!contextMatch&&!mainMatch)return null;if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
 const c=await context(request,env);if(!c)return json({ok:false,error:'unauthorized'},401);
 if(contextMatch){if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);return contextOptions(c,decodeURIComponent(contextMatch[1]))}
 const projectId=decodeURIComponent(mainMatch[1]),itemId=mainMatch[2]?decodeURIComponent(mainMatch[2]):null,action=mainMatch[3]||null;
 if(!itemId&&!action&&request.method==='GET')return list(c,projectId);
 if(!itemId&&!action&&request.method==='POST')return upload(request,c,env,projectId);
 if(itemId&&action==='links'&&request.method==='POST')return link(request,c,projectId,itemId);
 if(itemId&&action==='file'&&request.method==='GET')return serve(c,env,projectId,itemId,false);
 if(itemId&&action==='thumbnail'&&request.method==='GET')return serve(c,env,projectId,itemId,true);
 return json({ok:false,error:'not_found'},404);
}