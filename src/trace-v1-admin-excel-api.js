import * as XLSX from "xlsx";
import { handleTraceV1AdminToolsApi } from "./trace-v1-admin-tools-api.js";

const BASE = "/api/trace/v1/admin";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json","Cache-Control":"no-store"}})}
function cleanHeader(v){return String(v||"").trim().replace(/^\ufeff/,"")}
function normalizeRows(sheet){
  const raw=XLSX.utils.sheet_to_json(sheet,{defval:null,raw:false});
  return raw.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[cleanHeader(k),v])));
}
function firstSheet(workbook){const name=workbook.SheetNames?.[0];return name?workbook.Sheets[name]:null}
function forwardedHeaders(request){const h=new Headers();const auth=request.headers.get("Authorization");if(auth)h.set("Authorization",auth);h.set("Content-Type","application/json");return h}
function templateRows(type){
  if(type==="assets") return [{externalKey:"ACT-001",assetCode:"ACT-001",name:"Recurso de ejemplo",description:"",assetType:"item",location:"",metadata:""}];
  if(type==="processes") return [{externalKey:"PROC-001",name:"Proceso de ejemplo",description:"",category:"general",color:"#2563eb"}];
  if(type==="users") return [{email:"usuario@empresa.com",temporaryPassword:"",industry:"general"}];
  if(type==="participants") return [{executionCode:"TRACE-001",email:"usuario@empresa.com",participationRole:"executor"}];
  return null;
}

async function importTemplate(request,type){
  const rows=templateRows(type); if(!rows)return json({ok:false,error:"invalid_import_type"},422);
  const wb=XLSX.utils.book_new(); const ws=XLSX.utils.json_to_sheet(rows); XLSX.utils.book_append_sheet(wb,ws,"Importar");
  const bytes=XLSX.write(wb,{bookType:"xlsx",type:"array",compression:true});
  return new Response(bytes,{headers:{...CORS,"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename=trace-import-${type}.xlsx`,"Cache-Control":"no-store"}});
}

async function importExcel(request,env){
  let form;
  try{form=await request.formData()}catch{return json({ok:false,error:"invalid_multipart",message:"Envía file y type como multipart/form-data."},400)}
  const file=form.get("file"),type=String(form.get("type")||"").trim();
  if(!file||typeof file==="string")return json({ok:false,error:"file_required"},422);
  if(!["assets","processes","users","participants"].includes(type))return json({ok:false,error:"invalid_import_type"},422);
  if(file.size>15*1024*1024)return json({ok:false,error:"file_too_large",message:"Máximo 15 MB por archivo Excel."},422);
  let workbook;
  try{workbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true})}catch(e){return json({ok:false,error:"invalid_xlsx",message:"No se pudo leer el archivo Excel.",detail:String(e?.message||e)},422)}
  const sheet=firstSheet(workbook);if(!sheet)return json({ok:false,error:"empty_workbook",message:"El archivo no contiene hojas."},422);
  const rows=normalizeRows(sheet);if(rows.length>2000)return json({ok:false,error:"batch_too_large",message:"Máximo 2,000 filas por lote."},422);
  const body={type,rows,sourceName:file.name||"import.xlsx",sourceFormat:"xlsx",idempotencyKey:String(form.get("idempotencyKey")||"").trim()||null,metadata:{sheetName:workbook.SheetNames[0]}};
  const mode=String(form.get("mode")||"execute").trim();
  const target=mode==="validate"?`${BASE}/imports/validate`:`${BASE}/imports`;
  const proxied=new Request(new URL(target,request.url),{method:"POST",headers:forwardedHeaders(request),body:JSON.stringify(body)});
  return handleTraceV1AdminToolsApi(proxied,env);
}

async function exportXlsx(request,env){
  const url=new URL(request.url);
  const jsonUrl=new URL(`${BASE}/reports/executions`,url.origin);
  for(const [k,v] of url.searchParams.entries())if(k!=="format")jsonUrl.searchParams.set(k,v);
  jsonUrl.searchParams.set("format","json");
  const headers=new Headers();const auth=request.headers.get("Authorization");if(auth)headers.set("Authorization",auth);
  const source=await handleTraceV1AdminToolsApi(new Request(jsonUrl,{method:"GET",headers}),env);
  if(!source||!source.ok)return source||json({ok:false,error:"report_source_failed"},500);
  const payload=await source.json();const rows=payload?.data?.rows||[];
  const displayRows=rows.map(r=>({
    Codigo:r.execution_code||"",
    Titulo:r.title||"",
    Estado:r.status||"",
    Prioridad:r.priority||"",
    Avance:Number(r.completion_percentage||0),
    Proceso:r.process_name||"",
    Recurso:r.asset_code||"",
    NombreRecurso:r.asset_name||"",
    Incidencias:Number(r.incidents||0),
    Evidencias:Number(r.evidences||0),
    Participantes:Number(r.participants||0),
    Inicio:r.started_at||"",
    Completado:r.completed_at||"",
    Vencimiento:r.due_at||"",
  }));
  const wb=XLSX.utils.book_new();const ws=XLSX.utils.json_to_sheet(displayRows.length?displayRows:[{Mensaje:"Sin registros para los filtros seleccionados"}]);
  XLSX.utils.book_append_sheet(wb,ws,"Ejecuciones");
  const bytes=XLSX.write(wb,{bookType:"xlsx",type:"array",compression:true});
  return new Response(bytes,{headers:{...CORS,"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":"attachment; filename=trace-report.xlsx","Cache-Control":"no-store"}});
}

export async function handleTraceV1AdminExcelApi(request,env){
  const url=new URL(request.url);if(!url.pathname.startsWith(BASE))return null;
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  const tpl=url.pathname.match(/^\/api\/trace\/v1\/admin\/imports\/template\/(assets|processes|users|participants)$/); if(tpl&&request.method==="GET")return importTemplate(request,tpl[1]);
  if(url.pathname===`${BASE}/imports/file`&&request.method==="POST")return importExcel(request,env);
  if(url.pathname===`${BASE}/reports/executions`&&request.method==="GET"&&String(url.searchParams.get("format")||"").toLowerCase()==="xlsx")return exportXlsx(request,env);
  return null;
}
