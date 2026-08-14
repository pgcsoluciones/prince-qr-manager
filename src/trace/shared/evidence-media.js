const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const DOCUMENT_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);

const AUDIO_MIME = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
]);

const EXTENSION_MIME = {
  jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",heic:"image/heic",heif:"image/heif",
  pdf:"application/pdf",doc:"application/msword",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls:"application/vnd.ms-excel",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt:"application/vnd.ms-powerpoint",pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt:"text/plain",csv:"text/csv",
  mp3:"audio/mpeg",m4a:"audio/mp4",aac:"audio/aac",wav:"audio/wav",ogg:"audio/ogg",webm:"audio/webm",
};

export const EVIDENCE_MEDIA_LIMITS = Object.freeze({
  photo:15*1024*1024,
  audio:25*1024*1024,
  file:25*1024*1024,
});

function extension(name=""){
  const value=String(name).toLowerCase();
  const index=value.lastIndexOf(".");
  return index>=0?value.slice(index+1):"";
}

export function normalizeEvidenceMime(file){
  const direct=String(file?.type||"").trim().toLowerCase();
  if(direct&&direct!=="application/octet-stream")return direct;
  return EXTENSION_MIME[extension(file?.name)]||direct||"application/octet-stream";
}

export function classifyEvidenceMime(mime){
  const value=String(mime||"").toLowerCase();
  if(IMAGE_MIME.has(value))return"photo";
  if(AUDIO_MIME.has(value))return"audio";
  if(DOCUMENT_MIME.has(value))return"file";
  return null;
}

export function validateEvidenceUpload(file){
  if(!file||typeof file==="string")return{ok:false,error:"evidence_file_required"};
  const mime=normalizeEvidenceMime(file),evidenceType=classifyEvidenceMime(mime);
  if(!evidenceType)return{ok:false,error:"unsupported_evidence_type",mime};
  const limit=EVIDENCE_MEDIA_LIMITS[evidenceType];
  if(Number(file.size||0)<1||Number(file.size)>limit)return{ok:false,error:"invalid_file_size",mime,evidenceType,maxBytes:limit};
  return{ok:true,mime,evidenceType,maxBytes:limit};
}

export function sanitizeEvidenceMetadata(value){
  const source=value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  const out={};
  const textKeys=["originalName","originalMime","attachmentKind","optimization","optimizationNote","optimizedMime"];
  const numberKeys=["originalBytes","optimizedBytes","originalWidth","originalHeight","width","height","thumbnailBytes","thumbnailWidth","thumbnailHeight"];
  for(const key of textKeys){if(source[key]!==undefined&&source[key]!==null)out[key]=String(source[key]).slice(0,key==="optimizationNote"?500:255)}
  for(const key of numberKeys){const n=Number(source[key]);if(Number.isFinite(n)&&n>=0)out[key]=Math.round(n)}
  return out;
}

export function evidenceExtension(name,mime){
  const original=extension(name).replace(/[^a-z0-9]/g,"").slice(0,10);
  if(original)return original;
  const byMime={
    "image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/heic":"heic","image/heif":"heif",
    "application/pdf":"pdf","application/msword":"doc","application/vnd.openxmlformats-officedocument.wordprocessingml.document":"docx",
    "application/vnd.ms-excel":"xls","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"xlsx",
    "application/vnd.ms-powerpoint":"ppt","application/vnd.openxmlformats-officedocument.presentationml.presentation":"pptx",
    "text/plain":"txt","text/csv":"csv","audio/mpeg":"mp3","audio/mp4":"m4a","audio/x-m4a":"m4a","audio/aac":"aac","audio/wav":"wav","audio/x-wav":"wav","audio/ogg":"ogg","audio/webm":"webm",
  };
  return byMime[String(mime||"").toLowerCase()]||"bin";
}
