import * as XLSX from "xlsx";

const encoder=new TextEncoder();
const text=v=>String(v??"").trim();
const clean=v=>text(v).replace(/[\u0000-\u001f<>:"/\\|?*]+/g," ").replace(/\s+/g," ").trim();
const xml=v=>text(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fmtDate=v=>{if(!v)return"—";try{return new Date(v).toLocaleString("es-DO",{dateStyle:"medium",timeStyle:"short",timeZone:"America/Santo_Domingo"})}catch{return text(v)}};
const labelStatus=v=>({pending:"Pendiente",assigned:"Asignada",in_progress:"En progreso",paused:"Pausada",blocked:"Bloqueada",pending_approval:"Pendiente de aprobación",correction_required:"Requiere corrección",completed:"Completada",cancelled:"Cancelada",overdue:"Atrasada",approved:"Aprobada",rejected:"Rechazada",observed:"Observada",open:"Abierta",resolved:"Resuelta",validated:"Validada",closed:"Cerrada"})[v]||text(v)||"—";
const typeLabel=v=>({executive:"Reporte ejecutivo",traceability:"Reporte de trazabilidad",incidents:"Incidencias y correcciones",evidence:"Registro de evidencias",compliance:"Cumplimiento de actividades",analytics:"Analítica y tiempos",client:"Informe para cliente"})[v]||"Reporte";
const sectionLabel=v=>({summary:"Resumen general",stages:"Etapas y avance",activities:"Actividades / trabajos",timeline:"Trazabilidad cronológica",incidents:"Incidencias y correcciones",approvals:"Decisiones y aprobaciones",evidence:"Evidencias registradas"})[v]||v;

export function reportFilename(report,format){
 const project=clean(report?.snapshot?.project?.name||"proyecto").slice(0,70)||"proyecto";
 const kind=clean(typeLabel(report?.report_type||report?.type)).slice(0,50).toLowerCase().replace(/\s+/g,"-");
 const day=String(report?.generated_at||report?.generatedAt||new Date().toISOString()).slice(0,10);
 return `KAWVO-TRACE_${project}_${kind}_${day}.${format}`;
}

function rowsForReport(report){
 const s=report.snapshot||{},sections=new Set(report.definition?.sections||[]),rows=[];
 rows.push("KAWVO TRACE");rows.push(typeLabel(report.report_type||report.type));rows.push(s.project?.name||"Proyecto");rows.push(`Generado: ${fmtDate(report.generated_at||report.generatedAt)}`);rows.push(`Snapshot: ${fmtDate(s.snapshotAt)}`);rows.push("");
 if(sections.has("summary")){
  rows.push("RESUMEN GENERAL");
  rows.push(`Avance: ${Number(s.summary?.progress||0)}%`);
  rows.push(`Trabajos: ${Number(s.summary?.totalExecutions||0)} · Completados: ${Number(s.summary?.completedExecutions||0)} · Activos: ${Number(s.summary?.activeExecutions||0)}`);
  rows.push(`Incidencias abiertas: ${Number(s.summary?.openIncidents||0)} · Aprobaciones pendientes: ${Number(s.summary?.pendingApprovals||0)} · Evidencias: ${Number(s.summary?.evidenceCount||0)}`);rows.push("");
 }
 if(sections.has("stages")){
  rows.push("ETAPAS Y AVANCE");
  for(const x of s.stages||[])rows.push(`${x.name||"Etapa"} · ${labelStatus(x.status)} · ${x.assigned_email||"Sin responsable"}`);rows.push("");
 }
 if(sections.has("activities")){
  rows.push("TRABAJOS / ACTIVIDADES");
  for(const x of s.executions||[])rows.push(`${x.execution_code||""} · ${x.title||"Trabajo"} · ${labelStatus(x.status)} · ${Number(x.completion_percentage||0)}%`);rows.push("");
 }
 if(sections.has("incidents")){
  rows.push("INCIDENCIAS Y CORRECCIONES");
  for(const x of s.incidents||[])rows.push(`${x.incident_code||""} · ${x.title||"Incidencia"} · ${x.severity||""} · ${labelStatus(x.status)} · ${fmtDate(x.reported_at)}`);rows.push("");
 }
 if(sections.has("approvals")){
  rows.push("DECISIONES Y APROBACIONES");
  for(const x of s.approvals||[])rows.push(`${x.stage_name||"Etapa"} · ${labelStatus(x.status)} · Solicitada ${fmtDate(x.requested_at)}${x.decision_notes?` · ${x.decision_notes}`:""}`);rows.push("");
 }
 if(sections.has("evidence")){
  rows.push("EVIDENCIAS REGISTRADAS");
  for(const x of s.evidence||[])rows.push(`${x.original_filename||"Evidencia"} · ${x.stage_name||"Sin etapa"} · ${labelStatus(x.status)} · ${x.uploaded_by_email||""} · ${fmtDate(x.created_at)}`);rows.push("");
 }
 if(sections.has("timeline")){
  rows.push("TRAZABILIDAD CRONOLÓGICA");
  for(const x of s.events||[])rows.push(`${fmtDate(x.occurred_at)} · ${x.event_type||"Evento"} · ${x.description||""} · ${x.actor_email||x.event_source||""}`);rows.push("");
 }
 rows.push(`Identificador: ${report.code||report.id}`);rows.push("Fuente: snapshot canónico e inmutable de KAWVO Trace.");
 return rows;
}

function pdfEscape(v){return text(v).replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)").replace(/[^\x20-\x7E]/g,ch=>({"á":"a","é":"e","í":"i","ó":"o","ú":"u","Á":"A","É":"E","Í":"I","Ó":"O","Ú":"U","ñ":"n","Ñ":"N","·":"-","—":"-"})[ch]||"?")}
function wrap(line,max=92){const words=text(line).split(/\s+/),out=[];let cur="";for(const w of words){if(!w)continue;if((cur+" "+w).trim().length>max){if(cur)out.push(cur);cur=w}else cur=(cur+" "+w).trim()}if(cur||!out.length)out.push(cur);return out}
export function renderPdf(report){
 const logical=[];for(const line of rowsForReport(report))logical.push(...wrap(line));
 const pages=[];for(let i=0;i<logical.length;i+=46)pages.push(logical.slice(i,i+46));if(!pages.length)pages.push(["KAWVO TRACE"]);
 const objects=[];const add=s=>{objects.push(s);return objects.length};
 const fontId=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
 const boldId=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
 const pageIds=[];
 for(const lines of pages){let y=790,content="BT\n/F1 10 Tf\n";lines.forEach((line,i)=>{const heading=/^[A-ZÁÉÍÓÚÑ0-9 /_-]{4,}$/.test(line)&&line.length<55;content+=`${heading?"/F2 12 Tf":"/F1 10 Tf"}\n1 0 0 1 48 ${y} Tm (${pdfEscape(line)}) Tj\n`;y-=heading?20:15});content+="ET";const contentId=add(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);const pageId=add(`<< /Type /Page /Parent PAGESREF /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R >>`);pageIds.push(pageId)}
 const pagesId=add(`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);for(const id of pageIds)objects[id-1]=objects[id-1].replace("PAGESREF",`${pagesId} 0 R`);const catalogId=add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
 let pdf="%PDF-1.4\n%KAWVO\n",offsets=[0];objects.forEach((obj,i)=>{offsets.push(encoder.encode(pdf).length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`});const xref=encoder.encode(pdf).length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)pdf+=`${String(offsets[i]).padStart(10,"0")} 00000 n \n`;pdf+=`trailer\n<< /Size ${objects.length+1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return encoder.encode(pdf);
}

function docParagraph(value,{bold=false,size=22}={}){return `<w:p><w:r><w:rPr>${bold?"<w:b/>":""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(value||" ")}</w:t></w:r></w:p>`}
export function renderDocx(report){
 const body=rowsForReport(report).map(line=>docParagraph(line,{bold:/^[A-ZÁÉÍÓÚÑ0-9 /_-]{4,}$/.test(line)&&line.length<55,size:line==="KAWVO TRACE"?32:22})).join("");
 const files={
  "[Content_Types].xml":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
  "_rels/.rels":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
  "word/document.xml":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>`,
  "docProps/core.xml":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(report.title)}</dc:title><dc:creator>KAWVO Trace</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`,
 };
 const cfb=XLSX.CFB.utils.cfb_new();for(const [name,value] of Object.entries(files))XLSX.CFB.utils.cfb_add(cfb,name,encoder.encode(value));return XLSX.CFB.write(cfb,{type:"array",fileType:"zip",compression:true});
}

function sheet(wb,name,rows){const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{Mensaje:"Sin registros para esta sección"}]);XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31));}
export function renderXlsx(report){
 const s=report.snapshot||{},sections=new Set(report.definition?.sections||[]),wb=XLSX.utils.book_new();
 sheet(wb,"Resumen",[{Proyecto:s.project?.name||"",Tipo:typeLabel(report.report_type||report.type),Generado:report.generated_at||report.generatedAt||"",Snapshot:s.snapshotAt||"",Avance:Number(s.summary?.progress||0),Trabajos:Number(s.summary?.totalExecutions||0),Completados:Number(s.summary?.completedExecutions||0),IncidenciasAbiertas:Number(s.summary?.openIncidents||0),AprobacionesPendientes:Number(s.summary?.pendingApprovals||0),Evidencias:Number(s.summary?.evidenceCount||0)}]);
 if(sections.has("activities"))sheet(wb,"Trabajos",(s.executions||[]).map(x=>({Codigo:x.execution_code,Titulo:x.title,Estado:x.status,Prioridad:x.priority,Avance:Number(x.completion_percentage||0),Responsable:x.assigned_email,Inicio:x.started_at,Vencimiento:x.due_at,Completado:x.completed_at})));
 if(sections.has("stages"))sheet(wb,"Etapas",(s.stages||[]).map(x=>({Etapa:x.name,Orden:Number(x.stage_order||0),Estado:x.status,Responsable:x.assigned_email,Inicio:x.started_at,Completado:x.completed_at,Trabajo:x.execution_id})));
 if(sections.has("incidents"))sheet(wb,"Incidencias",(s.incidents||[]).map(x=>({Codigo:x.incident_code,Titulo:x.title,Severidad:x.severity,Estado:x.status,Reportada:x.reported_at,Resuelta:x.resolved_at,ReportadaPor:x.reported_by_email})));
 if(sections.has("approvals"))sheet(wb,"Aprobaciones",(s.approvals||[]).map(x=>({Etapa:x.stage_name,Estado:x.status,Solicitada:x.requested_at,Decidida:x.decided_at,SolicitadaPor:x.requested_by_email,Notas:x.decision_notes})));
 if(sections.has("evidence"))sheet(wb,"Evidencias",(s.evidence||[]).map(x=>({Archivo:x.original_filename,Tipo:x.evidence_type,Estado:x.status,Etapa:x.stage_name,Actividad:x.activity_title,SubidaPor:x.uploaded_by_email,Fecha:x.created_at,Checksum:x.checksum})));
 if(sections.has("timeline"))sheet(wb,"Trazabilidad",(s.events||[]).map(x=>({Fecha:x.occurred_at,Evento:x.event_type,Origen:x.event_source,Descripcion:x.description,Actor:x.actor_email,Etapa:x.stage_name})));
 return XLSX.write(wb,{bookType:"xlsx",type:"array",compression:true});
}

export async function sha256Hex(bytes){const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);const digest=await crypto.subtle.digest("SHA-256",view);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("")}

export function renderReportFile(report,format){
 if(format==="pdf")return{bytes:renderPdf(report),mime:"application/pdf"};
 if(format==="docx")return{bytes:renderDocx(report),mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"};
 if(format==="xlsx")return{bytes:renderXlsx(report),mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"};
 throw new Error("unsupported_report_format");
}
