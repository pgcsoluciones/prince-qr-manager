import jwt from "@tsndr/cloudflare-worker-jwt";
import bcrypt from "bcryptjs";
import { getTraceDatabase } from "./trace/shared/database.js";

const BASE = "/api/trace/v1/admin";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const PARTICIPATION_ROLES = new Set([
  "process_owner","department_lead","executor","collaborator","reviewer","approver","consulted","informed",
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type":"application/json", "Cache-Control":"no-store" } });
}
function uuid(){ return crypto.randomUUID(); }
function text(v, n=255){ if(v===null||v===undefined)return null; const s=String(v).trim(); return s?s.slice(0,n):null; }
function obj(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function arr(v){ return Array.isArray(v) ? v : []; }
function parse(v,f){ try{return v?JSON.parse(v):f}catch{return f} }
function escCsv(v){ const s=v===null||v===undefined?"":String(v); return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }
function sanitizeXml(v){ return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

async function auth(request, env){
  const h=request.headers.get("Authorization")||"";
  if(!h.startsWith("Bearer ")) return {error:json({ok:false,error:"unauthorized",message:"Se requiere un token administrativo."},401)};
  const token=h.slice(7).trim();
  const valid=await jwt.verify(token, env.JWT_SECRET||"changeme-set-in-cloudflare-dashboard");
  if(!valid) return {error:json({ok:false,error:"invalid_token"},401)};
  const payload=jwt.decode(token)?.payload||{};
  if((payload.session_type||"standard")!=="standard") return {error:json({ok:false,error:"restricted_session_scope"},403)};
  const userId=payload.user_id||payload.userId||payload.id||payload.sub;
  const db=getTraceDatabase(env);
  const user=await db.prepare(`SELECT id,email,role,plan,enterprise_id,is_active FROM users WHERE id=? LIMIT 1`).bind(userId).first();
  if(!user||Number(user.is_active)!==1) return {error:json({ok:false,error:"inactive_user"},401)};
  return {db,user,tenantId:user.enterprise_id||user.id};
}

async function listTemplates(request, env){
  const a=await auth(request,env); if(a.error)return a.error;
  const url=new URL(request.url); const industry=text(url.searchParams.get("industry"),80);
  const q=industry
    ? a.db.prepare(`SELECT * FROM trace_process_templates WHERE status='active' AND industry=? ORDER BY name`).bind(industry)
    : a.db.prepare(`SELECT * FROM trace_process_templates WHERE status='active' ORDER BY industry,name`);
  const r=await q.all();
  return json({ok:true,data:r.results.map(x=>({id:x.id,key:x.template_key,industry:x.industry,name:x.name,description:x.description,version:Number(x.version),process:parse(x.process_json,{}),stages:parse(x.stages_json,[]),fields:parse(x.fields_json,[]),metadata:parse(x.metadata_json,{})}))});
}

async function instantiateTemplate(request, env, templateId){
  const a=await auth(request,env); if(a.error)return a.error;
  let body={}; try{body=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const tpl=await a.db.prepare(`SELECT * FROM trace_process_templates WHERE id=? AND status='active' LIMIT 1`).bind(templateId).first();
  if(!tpl)return json({ok:false,error:"template_not_found"},404);
  const p=parse(tpl.process_json,{}), stages=parse(tpl.stages_json,[]), fields=parse(tpl.fields_json,[]);
  const processId=uuid(), versionId=uuid();
  const name=text(body.name,180)||tpl.name;
  const statements=[
    a.db.prepare(`INSERT INTO trace_processes (id,tenant_id,name,description,category,status,current_version_id,color,icon,settings_json,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'draft',NULL,?,?,?, ?,datetime('now'),datetime('now'))`)
      .bind(processId,a.tenantId,name,text(body.description,1000)||tpl.description,p.category||tpl.industry||"general",p.color||"#2563eb",p.icon||null,JSON.stringify({...obj(p.settings),templateId:tpl.id,templateKey:tpl.template_key}),a.user.id),
    a.db.prepare(`INSERT INTO trace_process_versions (id,process_id,version_number,name,description,status,schema_json,created_by,created_at) VALUES (?,?,1,?,?,'draft','{}',?,datetime('now'))`)
      .bind(versionId,processId,name,text(body.description,1000)||tpl.description,a.user.id),
  ];
  const stageIds={};
  stages.forEach((s,i)=>{ const id=uuid(); stageIds[s.key||String(i+1)]=id; statements.push(a.db.prepare(`INSERT INTO trace_stages (id,process_version_id,name,description,stage_order,stage_type,responsible_role,instructions,estimated_duration_minutes,requires_evidence,requires_approval,allow_skip,settings_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).bind(id,versionId,text(s.name,180)||`Etapa ${i+1}`,text(s.description,1000),i+1,s.stageType||"operation",text(s.responsibleRole,80),text(s.instructions,2000),Number(s.estimatedDurationMinutes||0)||null,s.requiresEvidence?1:0,s.requiresApproval?1:0,s.allowSkip?1:0,JSON.stringify(obj(s.settings)))); });
  fields.forEach((f,i)=>{ const stageId=stageIds[f.stageKey]; if(!stageId)return; statements.push(a.db.prepare(`INSERT INTO trace_stage_fields (id,stage_id,field_key,label,description,field_type,field_order,is_required,options_json,validation_json,conditional_json,default_value_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`).bind(uuid(),stageId,text(f.key,100)||`field_${i+1}`,text(f.label,180)||`Campo ${i+1}`,text(f.description,800),f.type||"text",Number(f.order||i+1),f.required?1:0,JSON.stringify(arr(f.options)),JSON.stringify(obj(f.validation)),JSON.stringify(obj(f.conditional)),f.defaultValue===undefined?null:JSON.stringify(f.defaultValue))); });
  await a.db.batch(statements);
  return json({ok:true,data:{processId,versionId,status:"draft",templateId:tpl.id,name,editable:true}});
}

function validateRows(type, rows){
  const errors=[];
  rows.forEach((r,i)=>{
    const n=i+2;
    if(type==="assets"){
      if(!text(r.externalKey||r.external_reference||r.assetCode||r.asset_code)) errors.push({row:n,column:"externalKey",code:"required",message:"Se requiere externalKey o assetCode."});
      if(!text(r.assetCode||r.asset_code)) errors.push({row:n,column:"assetCode",code:"required",message:"Se requiere assetCode."});
      if(!text(r.name)) errors.push({row:n,column:"name",code:"required",message:"Se requiere name."});
    } else if(type==="processes"){
      if(!text(r.externalKey)) errors.push({row:n,column:"externalKey",code:"required",message:"Se requiere externalKey."});
      if(!text(r.name)) errors.push({row:n,column:"name",code:"required",message:"Se requiere name."});
    } else if(type==="users"){
      if(!text(r.email)) errors.push({row:n,column:"email",code:"required",message:"Se requiere email."});
    } else if(type==="participants"){
      if(!text(r.executionCode||r.execution_code)) errors.push({row:n,column:"executionCode",code:"required",message:"Se requiere executionCode."});
      if(!text(r.email)) errors.push({row:n,column:"email",code:"required",message:"Se requiere email."});
      const role=text(r.participationRole||r.participation_role)||"executor";
      if(!PARTICIPATION_ROLES.has(role)) errors.push({row:n,column:"participationRole",code:"invalid",message:"Rol de participación inválido."});
    }
  });
  return errors;
}

async function validateImport(request,env){
  const a=await auth(request,env); if(a.error)return a.error;
  let body={}; try{body=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const type=text(body.type,40), rows=arr(body.rows);
  if(!["assets","processes","users","participants"].includes(type))return json({ok:false,error:"invalid_import_type"},422);
  if(rows.length>2000)return json({ok:false,error:"batch_too_large",message:"Máximo 2,000 filas por lote."},422);
  const errors=validateRows(type,rows);
  return json({ok:true,data:{type,totalRows:rows.length,validRows:rows.length-new Set(errors.map(e=>e.row)).size,invalidRows:new Set(errors.map(e=>e.row)).size,errors}});
}

async function mapIdentity(db,tenantId,type,key,entityId){
  await db.prepare(`INSERT INTO trace_import_identity_map (id,tenant_id,entity_type,external_key,entity_id,created_at) VALUES (?,?,?,?,?,datetime('now')) ON CONFLICT(tenant_id,entity_type,external_key) DO UPDATE SET entity_id=excluded.entity_id`).bind(uuid(),tenantId,type,key,entityId).run();
}
async function existingIdentity(db,tenantId,type,key){ return db.prepare(`SELECT entity_id FROM trace_import_identity_map WHERE tenant_id=? AND entity_type=? AND external_key=? LIMIT 1`).bind(tenantId,type,key).first(); }

async function importRow(a,type,r){
  const db=a.db, tenantId=a.tenantId;
  if(type==="assets"){
    const externalKey=text(r.externalKey||r.external_reference||r.assetCode||r.asset_code), assetCode=text(r.assetCode||r.asset_code), name=text(r.name,180);
    const mapped=await existingIdentity(db,tenantId,"asset",externalKey);
    const existing=mapped||await db.prepare(`SELECT id entity_id FROM trace_assets WHERE tenant_id=? AND (asset_code=? OR external_reference=?) LIMIT 1`).bind(tenantId,assetCode,externalKey).first();
    if(existing){ await db.prepare(`UPDATE trace_assets SET name=?,description=?,asset_type=?,location=?,metadata_json=?,external_reference=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(name,text(r.description,1000),text(r.assetType||r.asset_type,80)||"item",text(r.location,500),JSON.stringify(obj(r.metadata)),externalKey,existing.entity_id,tenantId).run(); await mapIdentity(db,tenantId,"asset",externalKey,existing.entity_id); return {id:existing.entity_id,entityType:"asset",updated:true}; }
    const id=uuid(); await db.prepare(`INSERT INTO trace_assets (id,tenant_id,process_id,asset_code,name,description,asset_type,status,external_reference,location,metadata_json,public_data_json,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'active',?,?,?,'{}',?,datetime('now'),datetime('now'))`).bind(id,tenantId,null,assetCode,name,text(r.description,1000),text(r.assetType||r.asset_type,80)||"item",externalKey,text(r.location,500),JSON.stringify(obj(r.metadata)),a.user.id).run(); await mapIdentity(db,tenantId,"asset",externalKey,id); return {id,entityType:"asset",updated:false};
  }
  if(type==="processes"){
    const key=text(r.externalKey), name=text(r.name,180), mapped=await existingIdentity(db,tenantId,"process",key);
    if(mapped){ await db.prepare(`UPDATE trace_processes SET name=?,description=?,category=?,updated_at=datetime('now') WHERE id=? AND tenant_id=? AND status='draft'`).bind(name,text(r.description,1000),text(r.category,80)||"general",mapped.entity_id,tenantId).run(); return {id:mapped.entity_id,entityType:"process",updated:true}; }
    const id=uuid(), versionId=uuid(); await db.batch([
      db.prepare(`INSERT INTO trace_processes (id,tenant_id,name,description,category,status,color,settings_json,created_by,created_at,updated_at) VALUES (?,?,?,?,?,'draft',?,'{}',?,datetime('now'),datetime('now'))`).bind(id,tenantId,name,text(r.description,1000),text(r.category,80)||"general",text(r.color,20)||"#2563eb",a.user.id),
      db.prepare(`INSERT INTO trace_process_versions (id,process_id,version_number,name,description,status,schema_json,created_by,created_at) VALUES (?,?,1,?,?,'draft','{}',?,datetime('now'))`).bind(versionId,id,name,text(r.description,1000),a.user.id),
    ]); await mapIdentity(db,tenantId,"process",key,id); return {id,entityType:"process",versionId,updated:false};
  }
  if(type==="users"){
    const email=text(r.email,255)?.toLowerCase(); let u=await db.prepare(`SELECT id FROM users WHERE email=? LIMIT 1`).bind(email).first();
    if(u){ if(u.id!==tenantId){ await db.prepare(`UPDATE users SET enterprise_id=COALESCE(enterprise_id,?),is_active=1,updated_at=datetime('now') WHERE id=?`).bind(tenantId,u.id).run(); } await mapIdentity(db,tenantId,"user",email,u.id); return {id:u.id,entityType:"user",updated:true}; }
    const id=uuid(); const temporaryPassword=text(r.temporaryPassword,200)||uuid(); const hash=await bcrypt.hash(temporaryPassword,10); await db.prepare(`INSERT INTO users (id,email,password_hash,role,plan,enterprise_id,is_active,created_at,updated_at,settings,rubro) VALUES (?,?,?,'tenant',?, ?,1,datetime('now'),datetime('now'),'{}',?)`).bind(id,email,hash,a.user.plan||"free",tenantId,text(r.industry||r.rubro,80)||"general").run(); await mapIdentity(db,tenantId,"user",email,id); return {id,entityType:"user",updated:false,temporaryPasswordGenerated:!r.temporaryPassword};
  }
  if(type==="participants"){
    const email=text(r.email,255)?.toLowerCase(), code=text(r.executionCode||r.execution_code,120), role=text(r.participationRole||r.participation_role,80)||"executor";
    const u=await db.prepare(`SELECT id FROM users WHERE email=? AND (id=? OR enterprise_id=?) AND is_active=1 LIMIT 1`).bind(email,tenantId,tenantId).first(); if(!u) throw Object.assign(new Error("Usuario no encontrado dentro del tenant."),{column:"email",code:"user_not_found"});
    const e=await db.prepare(`SELECT id FROM trace_executions WHERE tenant_id=? AND execution_code=? LIMIT 1`).bind(tenantId,code).first(); if(!e) throw Object.assign(new Error("Ejecución no encontrada."),{column:"executionCode",code:"execution_not_found"});
    const old=await db.prepare(`SELECT id FROM trace_execution_participants WHERE tenant_id=? AND execution_id=? AND user_id=? AND participation_role=? LIMIT 1`).bind(tenantId,e.id,u.id,role).first();
    if(old){ await db.prepare(`UPDATE trace_execution_participants SET status='active',updated_at=datetime('now') WHERE id=?`).bind(old.id).run(); return {id:old.id,entityType:"participant",updated:true}; }
    const id=uuid(); await db.prepare(`INSERT INTO trace_execution_participants (id,tenant_id,execution_id,department_id,user_id,participation_role,assignment_source,status,settings_json,created_by,created_at,updated_at) VALUES (?,?,?,NULL,?,?,'manual','active','{}',?,datetime('now'),datetime('now'))`).bind(id,tenantId,e.id,u.id,role,a.user.id).run(); return {id,entityType:"participant",updated:false};
  }
  throw new Error("Tipo de importación no soportado.");
}

async function executeImport(request,env){
  const a=await auth(request,env); if(a.error)return a.error;
  let body={}; try{body=await request.json()}catch{return json({ok:false,error:"invalid_json"},400)}
  const type=text(body.type,40), rows=arr(body.rows); if(!["assets","processes","users","participants"].includes(type))return json({ok:false,error:"invalid_import_type"},422);
  const errors=validateRows(type,rows); if(errors.length)return json({ok:false,error:"validation_failed",data:{errors}},422);
  const key=text(body.idempotencyKey,180)||null; if(key){ const old=await a.db.prepare(`SELECT id,status,total_rows,success_rows,failed_rows FROM trace_import_batches WHERE tenant_id=? AND import_type=? AND idempotency_key=? LIMIT 1`).bind(a.tenantId,type,key).first(); if(old)return json({ok:true,data:{batchId:old.id,reused:true,status:old.status,totalRows:Number(old.total_rows),successRows:Number(old.success_rows),failedRows:Number(old.failed_rows)}}); }
  const batchId=uuid(); await a.db.prepare(`INSERT INTO trace_import_batches (id,tenant_id,import_type,source_name,source_format,idempotency_key,status,total_rows,created_by,created_at,metadata_json) VALUES (?,?,?,?,?,?, 'processing',?,?,datetime('now'),?)`).bind(batchId,a.tenantId,type,text(body.sourceName,255),text(body.sourceFormat,20)||"xlsx",key,rows.length,a.user.id,JSON.stringify(obj(body.metadata))).run();
  let success=0,failed=0; const results=[];
  for(let i=0;i<rows.length;i++){
    const row=rows[i], rowId=uuid(), ext=text(row.externalKey||row.email||row.assetCode||row.executionCode,255);
    try{ const out=await importRow(a,type,row); success++; await a.db.prepare(`INSERT INTO trace_import_rows (id,batch_id,row_number,external_key,status,input_json,result_entity_type,result_entity_id,processed_at) VALUES (?,?,?,?, 'success',?,?,?,datetime('now'))`).bind(rowId,batchId,i+2,ext,JSON.stringify(row),out.entityType,out.id).run(); results.push({row:i+2,status:"success",...out}); }
    catch(e){ failed++; await a.db.prepare(`INSERT INTO trace_import_rows (id,batch_id,row_number,external_key,status,input_json,error_code,error_column,error_message,processed_at) VALUES (?,?,?,?, 'failed',?,?,?,?,datetime('now'))`).bind(rowId,batchId,i+2,ext,JSON.stringify(row),e.code||"import_error",e.column||null,String(e.message||e).slice(0,1000)).run(); results.push({row:i+2,status:"failed",error:e.code||"import_error",column:e.column||null,message:String(e.message||e)}); }
  }
  const status=failed===0?"completed":success===0?"failed":"partial"; await a.db.prepare(`UPDATE trace_import_batches SET status=?,success_rows=?,failed_rows=?,completed_at=datetime('now') WHERE id=?`).bind(status,success,failed,batchId).run();
  return json({ok:true,data:{batchId,status,totalRows:rows.length,successRows:success,failedRows:failed,results}});
}

async function reportRows(a,url){
  const processId=text(url.searchParams.get("processId"),100), status=text(url.searchParams.get("status"),80), from=text(url.searchParams.get("from"),40), to=text(url.searchParams.get("to"),40);
  let sql=`SELECT e.execution_code,e.title,e.status,e.priority,e.completion_percentage,e.started_at,e.completed_at,e.due_at,p.name process_name,a.asset_code,a.name asset_name,(SELECT COUNT(*) FROM trace_incidents i WHERE i.execution_id=e.id) incidents,(SELECT COUNT(*) FROM trace_evidences ev WHERE ev.execution_id=e.id) evidences,(SELECT COUNT(*) FROM trace_execution_participants ep WHERE ep.execution_id=e.id AND ep.status='active') participants FROM trace_executions e JOIN trace_processes p ON p.id=e.process_id LEFT JOIN trace_assets a ON a.id=e.asset_id WHERE e.tenant_id=?`;
  const binds=[a.tenantId]; if(processId){sql+=` AND e.process_id=?`;binds.push(processId)} if(status){sql+=` AND e.status=?`;binds.push(status)} if(from){sql+=` AND e.created_at>=?`;binds.push(from)} if(to){sql+=` AND e.created_at<=?`;binds.push(to)} sql+=` ORDER BY e.created_at DESC LIMIT 5000`;
  const r=await a.db.prepare(sql).bind(...binds).all(); return r.results;
}

function toCsv(rows){ const cols=["execution_code","title","status","priority","completion_percentage","process_name","asset_code","asset_name","incidents","evidences","participants","started_at","completed_at","due_at"]; return [cols.join(","),...rows.map(r=>cols.map(c=>escCsv(r[c])).join(","))].join("\r\n"); }

// Minimal SpreadsheetML export, recognized by Excel and preserving tabular semantics.
function toSpreadsheetXml(rows){
  const cols=["execution_code","title","status","priority","completion_percentage","process_name","asset_code","asset_name","incidents","evidences","participants","started_at","completed_at","due_at"];
  const rowXml=(vals)=>`<Row>${vals.map(v=>`<Cell><Data ss:Type="String">${sanitizeXml(v)}</Data></Cell>`).join("")}</Row>`;
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Ejecuciones"><Table>${rowXml(cols)}${rows.map(r=>rowXml(cols.map(c=>r[c]??""))).join("")}</Table></Worksheet></Workbook>`;
}
function pdfEscape(s){return String(s??"").replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)").replace(/[^\x20-\x7E]/g,"?")}
function toSimplePdf(rows){
  const lines=["INTAP TRACE - Reporte de ejecuciones",`Registros: ${rows.length}`,"",...rows.slice(0,55).map(r=>`${r.execution_code} | ${r.status} | ${r.title||""}`)];
  const stream=`BT /F1 10 Tf 40 800 Td 13 TL ${lines.map((l,i)=>`${i?"T* ":""}(${pdfEscape(l)}) Tj`).join(" ")} ET`;
  const objs=[]; objs[1]="<< /Type /Catalog /Pages 2 0 R >>"; objs[2]="<< /Type /Pages /Kids [3 0 R] /Count 1 >>"; objs[3]="<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"; objs[4]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`; objs[5]="<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  let out="%PDF-1.4\n", offsets=[0]; for(let i=1;i<=5;i++){offsets[i]=out.length;out+=`${i} 0 obj\n${objs[i]}\nendobj\n`;} const xref=out.length; out+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,"0")+" 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return out;
}

async function exportReport(request,env){
  const a=await auth(request,env); if(a.error)return a.error; const url=new URL(request.url); const format=(text(url.searchParams.get("format"),20)||"json").toLowerCase(); const rows=await reportRows(a,url);
  if(format==="json")return json({ok:true,data:{generatedAt:new Date().toISOString(),count:rows.length,rows}});
  if(format==="csv")return new Response(toCsv(rows),{headers:{...CORS,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=trace-report.csv"}});
  if(format==="xlsx")return new Response(toSpreadsheetXml(rows),{headers:{...CORS,"Content-Type":"application/vnd.ms-excel; charset=utf-8","Content-Disposition":"attachment; filename=trace-report.xls"}});
  if(format==="pdf")return new Response(toSimplePdf(rows),{headers:{...CORS,"Content-Type":"application/pdf","Content-Disposition":"attachment; filename=trace-report.pdf"}});
  return json({ok:false,error:"unsupported_format",message:"Formatos: json, csv, xlsx, pdf."},422);
}

export async function handleTraceV1AdminToolsApi(request,env){
  const url=new URL(request.url); if(!url.pathname.startsWith(BASE))return null; if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(url.pathname===`${BASE}/templates`&&request.method==="GET")return listTemplates(request,env);
  const inst=url.pathname.match(/^\/api\/trace\/v1\/admin\/templates\/([^/]+)\/instantiate$/); if(inst&&request.method==="POST")return instantiateTemplate(request,env,decodeURIComponent(inst[1]));
  if(url.pathname===`${BASE}/imports/validate`&&request.method==="POST")return validateImport(request,env);
  if(url.pathname===`${BASE}/imports`&&request.method==="POST")return executeImport(request,env);
  if(url.pathname===`${BASE}/reports/executions`&&request.method==="GET")return exportReport(request,env);
  return null;
}
