import jwt from "@tsndr/cloudflare-worker-jwt";
import { getTraceDatabase } from "./trace/shared/database.js";

const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"};
const MAX_BYTES=20*1024*1024;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=()=>crypto.randomUUID();
const text=(v,n=4000)=>{const s=String(v??"").trim();return s?s.slice(0,n):null};
const parse=(v,f={})=>{try{return v?JSON.parse(v):f}catch{return f}};
const encodeCursor=(row)=>btoa(JSON.stringify([row.created_at,row.id]));
const decodeCursor=(value)=>{try{const [createdAt,id]=JSON.parse(atob(value));return createdAt&&id?{createdAt,id}:null}catch{return null}};

async function context(request,env){
 const h=request.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))return null;
 let ok=false,token=h.slice(7).trim();try{ok=await jwt.verify(token,env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard")}catch{return null}if(!ok)return null;
 const p=jwt.decode(token)?.payload||{};if((p.session_type||"standard")!=="standard")return null;
 const userId=p.user_id||p.userId||p.id||p.sub;if(!userId)return null;
 const db=getTraceDatabase(env);const user=await db.prepare(`SELECT id,email,role,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
 if(!user||Number(user.is_active)!==1)return null;return{db,user,tenantId:user.enterprise_id||user.id};
}
async function projectContext(c,projectId){
 const project=await c.db.prepare(`SELECT id,name,status FROM trace_assets WHERE id=? AND tenant_id=? AND asset_type='project' LIMIT 1`).bind(projectId,c.tenantId).first();if(!project)return null;
 const part=await c.db.prepare(`SELECT project_role FROM trace_project_participants WHERE tenant_id=? AND project_id=? AND user_id=? AND status='active' LIMIT 1`).bind(c.tenantId,projectId,c.user.id).first();
 const projectRole=part?.project_role||null;return{project,projectRole,ownOnly:projectRole==='member'};
}
const canValidate=(c,pc)=>['superadmin','enterprise','admin','manager','supervisor'].includes(c.user.role)||['owner','manager','supervisor'].includes(pc.projectRole||'');
function inferType(mime){if(mime.startsWith('image/'))return'photo';if(mime.startsWith('video/'))return'video';if(mime.startsWith('audio/'))return'audio';return'file'}
async function sha256Hex(buffer){const digest=await crypto.subtle.digest('SHA-256',buffer);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
function rowSelect(){return `
 SELECT ev.id,ev.execution_id,ev.execution_stage_id,ev.execution_activity_id,ev.requirement_id,
        ev.evidence_type,ev.r2_key,ev.thumbnail_r2_key,ev.original_filename,ev.mime_type,ev.file_size,ev.checksum,
        ev.metadata_json,ev.uploaded_by,ev.captured_at,ev.created_at,ev.validation_status,ev.validation_notes,ev.validated_at,ev.validated_by,
        e.execution_code,e.title execution_title,s.id stage_id,s.name stage_name,ea.title activity_title,
        er.label requirement_label,er.required_count,er.requires_validation,
        u.email uploader_email,vu.email validator_email,
        (SELECT i.id FROM trace_incidents i WHERE i.tenant_id=ev.tenant_id AND i.execution_id=ev.execution_id AND (i.execution_activity_id=ev.execution_activity_id OR json_extract(ev.metadata_json,'$.incidentId')=i.id) ORDER BY i.reported_at DESC LIMIT 1) related_incident_id,
        (SELECT i.incident_code FROM trace_incidents i WHERE i.tenant_id=ev.tenant_id AND i.execution_id=ev.execution_id AND (i.execution_activity_id=ev.execution_activity_id OR json_extract(ev.metadata_json,'$.incidentId')=i.id) ORDER BY i.reported_at DESC LIMIT 1) related_incident_code
 FROM trace_evidences ev
 JOIN trace_executions e ON e.id=ev.execution_id AND e.tenant_id=ev.tenant_id
 LEFT JOIN trace_execution_stages es ON es.id=ev.execution_stage_id
 LEFT JOIN trace_stages s ON s.id=es.stage_id
 LEFT JOIN trace_execution_activities ea ON ea.id=ev.execution_activity_id
 LEFT JOIN trace_execution_evidence_requirements er ON er.id=ev.requirement_id
 LEFT JOIN users u ON u.id=ev.uploaded_by
 LEFT JOIN users vu ON vu.id=ev.validated_by`}
function mapRow(r,projectId){return{
 id:r.id,code:`EVI-${String(r.id).replace(/-/g,'').slice(0,6).toUpperCase()}`,title:r.requirement_label||r.activity_title||r.original_filename||'Evidencia',
 executionId:r.execution_id,executionCode:r.execution_code,executionTitle:r.execution_title,executionStageId:r.execution_stage_id,stageId:r.stage_id,stageName:r.stage_name,
 executionActivityId:r.execution_activity_id,activityTitle:r.activity_title,requirementId:r.requirement_id,requirementLabel:r.requirement_label,requiredCount:Number(r.required_count||0),requiresValidation:r.requires_validation===null?true:Number(r.requires_validation)===1,
 type:r.evidence_type,mimeType:r.mime_type,fileSize:Number(r.file_size||0),checksum:r.checksum,originalFilename:r.original_filename,
 status:r.validation_status||'pending',observation:r.validation_notes||null,uploadedBy:r.uploaded_by,uploaderEmail:r.uploader_email,capturedAt:r.captured_at,createdAt:r.created_at,validatedAt:r.validated_at,validatorEmail:r.validator_email,
 metadata:parse(r.metadata_json,{}),fileUrl:`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/evidence/${encodeURIComponent(r.id)}/file`,thumbnailUrl:r.thumbnail_r2_key?`/api/trace/v1/admin/projects/${encodeURIComponent(projectId)}/evidence/${encodeURIComponent(r.id)}/thumbnail`:null,
 relatedIncident:r.related_incident_id?{id:r.related_incident_id,code:r.related_incident_code}:null
}}
async function evidenceRow(c,projectId,evidenceId,ownOnly=false){
 const own=ownOnly?` AND (ev.uploaded_by=? OR ea.assigned_to=?)`:'';const binds=[c.tenantId,projectId,evidenceId,...(ownOnly?[c.user.id,c.user.id]:[])];
 return c.db.prepare(`${rowSelect()} WHERE ev.tenant_id=? AND e.asset_id=? AND ev.id=?${own} LIMIT 1`).bind(...binds).first();
}
async function listEvidence(request,c,projectId,pc){
 const url=new URL(request.url),stage=text(url.searchParams.get('stage'),100),type=text(url.searchParams.get('type'),40),status=text(url.searchParams.get('status'),40),cursor=decodeCursor(url.searchParams.get('cursor')||''),limit=Math.min(50,Math.max(1,Number(url.searchParams.get('limit')||30)));
 const own=pc.ownOnly?` AND (ev.uploaded_by=? OR ea.assigned_to=?)`:'';const binds=[c.tenantId,projectId,...(pc.ownOnly?[c.user.id,c.user.id]:[])];let where=` WHERE ev.tenant_id=? AND e.asset_id=?${own}`;
 if(stage){where+=` AND s.id=?`;binds.push(stage)}if(type){where+=` AND ev.evidence_type=?`;binds.push(type)}if(status){where+=` AND ev.validation_status=?`;binds.push(status)}if(cursor){where+=` AND (ev.created_at<? OR (ev.created_at=? AND ev.id<?))`;binds.push(cursor.createdAt,cursor.createdAt,cursor.id)}
 const rows=await c.db.prepare(`${rowSelect()}${where} ORDER BY ev.created_at DESC,ev.id DESC LIMIT ?`).bind(...binds,limit+1).all();let result=rows.results||[],hasMore=result.length>limit;if(hasMore)result=result.slice(0,limit);const items=result.map(r=>mapRow(r,projectId));
 const metricWhere=` FROM trace_evidences ev JOIN trace_executions e ON e.id=ev.execution_id LEFT JOIN trace_execution_activities ea ON ea.id=ev.execution_activity_id WHERE ev.tenant_id=? AND e.asset_id=?${own}`;const metricBinds=[c.tenantId,projectId,...(pc.ownOnly?[c.user.id,c.user.id]:[])];
 const metrics=await c.db.prepare(`SELECT SUM(CASE WHEN ev.validation_status='pending' THEN 1 ELSE 0 END) pending,SUM(CASE WHEN ev.validation_status='approved' THEN 1 ELSE 0 END) approved,SUM(CASE WHEN ev.validation_status='observed' THEN 1 ELSE 0 END) observed,SUM(CASE WHEN ev.validation_status='rejected' THEN 1 ELSE 0 END) rejected${metricWhere}`).bind(...metricBinds).first();
 const stages=await c.db.prepare(`SELECT DISTINCT s.id,s.name,s.stage_order FROM trace_evidences ev JOIN trace_executions e ON e.id=ev.execution_id LEFT JOIN trace_execution_stages es ON es.id=ev.execution_stage_id LEFT JOIN trace_stages s ON s.id=es.stage_id WHERE ev.tenant_id=? AND e.asset_id=? AND s.id IS NOT NULL ORDER BY s.stage_order`).bind(c.tenantId,projectId).all();
 return json({ok:true,data:{project:pc.project,viewer:{projectRole:pc.projectRole,scope:pc.ownOnly?'own':'project',canValidate:canValidate(c,pc)},summary:{pending:Number(metrics?.pending||0),approved:Number(metrics?.approved||0),observed:Number(metrics?.observed||0),rejected:Number(metrics?.rejected||0)},items,nextCursor:hasMore?encodeCursor(result[result.length-1]):null,stages:stages.results||[]}})
}
async function detailEvidence(c,projectId,pc,evidenceId){
 const r=await evidenceRow(c,projectId,evidenceId,pc.ownOnly);if(!r)return json({ok:false,error:'evidence_not_found'},404);
 const history=await c.db.prepare(`SELECT v.id,v.decision,v.notes,v.decided_at,u.email decided_by_email FROM trace_evidence_validations v LEFT JOIN users u ON u.id=v.decided_by WHERE v.tenant_id=? AND v.evidence_id=? ORDER BY v.decided_at DESC,v.id DESC`).bind(c.tenantId,evidenceId).all();
 return json({ok:true,data:{evidence:mapRow(r,projectId),viewer:{projectRole:pc.projectRole,scope:pc.ownOnly?'own':'project',canValidate:canValidate(c,pc)},history:history.results||[]}})
}
async function serveObject(c,env,projectId,pc,evidenceId,thumbnail=false){
 const r=await evidenceRow(c,projectId,evidenceId,pc.ownOnly);if(!r)return json({ok:false,error:'evidence_not_found'},404);const key=thumbnail?r.thumbnail_r2_key:r.r2_key;if(!key||!env.ASSETS)return json({ok:false,error:'evidence_file_not_found'},404);
 const obj=await env.ASSETS.get(key);if(!obj)return json({ok:false,error:'evidence_file_not_found'},404);const h=new Headers();obj.writeHttpMetadata(h);h.set('Cache-Control','private, max-age=300');h.set('Content-Disposition',`inline; filename="${(r.original_filename||'evidence').replace(/"/g,'')}"`);return new Response(obj.body,{headers:h});
}
async function uploadEvidence(request,c,env,projectId,pc){
 if(!env.ASSETS)return json({ok:false,error:'evidence_storage_unavailable'},503);let f;try{f=await request.formData()}catch{return json({ok:false,error:'invalid_multipart'},400)}
 const activityId=text(f.get('executionActivityId'),100),requirementId=text(f.get('requirementId'),100),file=f.get('file'),thumb=f.get('thumbnail');if(!activityId||!file||typeof file==='string')return json({ok:false,error:'activity_and_file_required'},422);if(file.size<1||file.size>MAX_BYTES)return json({ok:false,error:'invalid_file_size'},422);
 const a=await c.db.prepare(`SELECT ea.*,e.asset_id FROM trace_execution_activities ea JOIN trace_executions e ON e.id=ea.execution_id AND e.tenant_id=ea.tenant_id WHERE ea.id=? AND ea.tenant_id=? AND e.asset_id=? LIMIT 1`).bind(activityId,c.tenantId,projectId).first();if(!a)return json({ok:false,error:'invalid_execution_activity'},422);
 let req=null;if(requirementId){req=await c.db.prepare(`SELECT * FROM trace_execution_evidence_requirements WHERE id=? AND tenant_id=? AND execution_activity_id=? LIMIT 1`).bind(requirementId,c.tenantId,activityId).first();if(!req)return json({ok:false,error:'invalid_evidence_requirement'},422)}
 const mime=file.type||'application/octet-stream',evidenceType=inferType(mime);if(req&&req.evidence_type!==evidenceType&&!(req.evidence_type==='file'))return json({ok:false,error:'evidence_type_mismatch'},422);
 const id=uuid(),ext=(String(file.name||'evidence').split('.').pop()||'bin').replace(/[^A-Za-z0-9]/g,'').slice(0,10)||'bin',key=`trace/${c.tenantId}/${a.execution_id}/${a.execution_stage_id}/${id}.${ext}`,buffer=await file.arrayBuffer(),checksum=await sha256Hex(buffer);await env.ASSETS.put(key,buffer,{httpMetadata:{contentType:mime},customMetadata:{tenantId:c.tenantId,executionId:a.execution_id,executionStageId:a.execution_stage_id,executionActivityId:activityId,uploadedBy:c.user.id}});
 let thumbKey=null;if(thumb&&typeof thumb!=='string'&&thumb.size>0){thumbKey=`trace/${c.tenantId}/${a.execution_id}/${a.execution_stage_id}/${id}.thumb.jpg`;await env.ASSETS.put(thumbKey,await thumb.arrayBuffer(),{httpMetadata:{contentType:thumb.type||'image/jpeg'}})}
 const status=req&&Number(req.requires_validation)===0?'approved':'pending',eventId=uuid();try{await c.db.batch([
  c.db.prepare(`INSERT INTO trace_events(id,tenant_id,execution_id,execution_stage_id,execution_activity_id,asset_id,event_type,event_source,actor_user_id,actor_role,description,payload_json,occurred_at,received_at) VALUES(?,?,?,?,?,?,'evidence.added','admin',?,?,?, ?,datetime('now'),datetime('now'))`).bind(eventId,c.tenantId,a.execution_id,a.execution_stage_id,activityId,projectId,c.user.id,c.user.role,'Evidencia registrada.',JSON.stringify({evidenceId:id,requirementId:requirementId||null,evidenceType})),
  c.db.prepare(`INSERT INTO trace_evidences(id,tenant_id,execution_id,execution_stage_id,execution_activity_id,requirement_id,event_id,evidence_type,r2_key,thumbnail_r2_key,original_filename,mime_type,file_size,checksum,metadata_json,uploaded_by,captured_at,validation_status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).bind(id,c.tenantId,a.execution_id,a.execution_stage_id,activityId,requirementId||null,eventId,evidenceType,key,thumbKey,text(file.name,255)||'evidence',mime,file.size,checksum,JSON.stringify(parse(text(f.get('metadata'),8000),{})),c.user.id,text(f.get('capturedAt'),80),status)
 ])}catch(error){await env.ASSETS.delete(key).catch(()=>{});if(thumbKey)await env.ASSETS.delete(thumbKey).catch(()=>{});throw error}
 return json({ok:true,data:{id,status}},201)
}
async function validateEvidence(request,c,projectId,pc,evidenceId){
 if(!canValidate(c,pc))return json({ok:false,error:'forbidden'},403);const r=await evidenceRow(c,projectId,evidenceId,false);if(!r)return json({ok:false,error:'evidence_not_found'},404);if(r.validation_status!=='pending')return json({ok:false,error:'invalid_evidence_state'},409);
 let body={};try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}const decision=text(body.decision,20),notes=text(body.notes,4000);if(!['approved','observed','rejected'].includes(decision))return json({ok:false,error:'invalid_decision'},422);if(decision!=='approved'&&!notes)return json({ok:false,error:'validation_notes_required'},422);
 const validationId=uuid(),eventId=uuid();await c.db.batch([
  c.db.prepare(`UPDATE trace_evidences SET validation_status=?,validation_notes=?,validated_at=datetime('now'),validated_by=? WHERE id=? AND tenant_id=? AND validation_status='pending'`).bind(decision,notes,c.user.id,evidenceId,c.tenantId),
  c.db.prepare(`INSERT INTO trace_evidence_validations(id,tenant_id,evidence_id,decision,notes,decided_by,decided_at,metadata_json) VALUES(?,?,?,?,?,?,datetime('now'),'{}')`).bind(validationId,c.tenantId,evidenceId,decision,notes,c.user.id),
  c.db.prepare(`INSERT INTO trace_events(id,tenant_id,execution_id,execution_stage_id,execution_activity_id,asset_id,event_type,event_source,actor_user_id,actor_role,description,payload_json,occurred_at,received_at) VALUES(?,?,?,?,?,?,?,'admin',?,?,?,?,datetime('now'),datetime('now'))`).bind(eventId,c.tenantId,r.execution_id,r.execution_stage_id,r.execution_activity_id,projectId,`evidence.${decision}`,c.user.id,c.user.role,decision==='approved'?'Evidencia aprobada.':decision==='observed'?'Evidencia observada.':'Evidencia rechazada.',JSON.stringify({evidenceId,decision,notes}))
 ]);return json({ok:true,data:{evidenceId,status:decision}})
}

export async function handleTraceV1ProjectEvidenceApi(request,env){
 const url=new URL(request.url),m=url.pathname.match(/^\/api\/trace\/v1\/admin\/projects\/([^/]+)\/evidence(?:\/([^/]+))?(?:\/(file|thumbnail|validate))?$/);if(!m)return null;if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
 const c=await context(request,env);if(!c)return json({ok:false,error:'unauthorized'},401);const projectId=decodeURIComponent(m[1]),evidenceId=m[2]?decodeURIComponent(m[2]):null,action=m[3]||null,pc=await projectContext(c,projectId);if(!pc)return json({ok:false,error:'project_not_found'},404);
 if(!evidenceId&&request.method==='GET')return listEvidence(request,c,projectId,pc);if(!evidenceId&&request.method==='POST')return uploadEvidence(request,c,env,projectId,pc);
 if(evidenceId&&!action&&request.method==='GET')return detailEvidence(c,projectId,pc,evidenceId);if(evidenceId&&action==='file'&&request.method==='GET')return serveObject(c,env,projectId,pc,evidenceId,false);if(evidenceId&&action==='thumbnail'&&request.method==='GET')return serveObject(c,env,projectId,pc,evidenceId,true);if(evidenceId&&action==='validate'&&request.method==='POST')return validateEvidence(request,c,projectId,pc,evidenceId);
 return json({ok:false,error:'method_not_allowed'},405)
}
