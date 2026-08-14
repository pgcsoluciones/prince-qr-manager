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
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  heic: "image/heic", heif: "image/heif",
  pdf: "application/pdf",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain", csv: "text/csv",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", webm: "audio/webm",
};

export const TRACE_ATTACHMENT_ACCEPT = [
  "image/jpeg","image/png","image/webp","image/heic","image/heif",
  ".jpg",".jpeg",".png",".webp",".heic",".heif",
  ".pdf",".doc",".docx",".xls",".xlsx",".ppt",".pptx",".txt",".csv",
  "audio/mpeg","audio/mp4","audio/aac","audio/wav","audio/ogg","audio/webm",
  ".mp3",".m4a",".aac",".wav",".ogg",".webm",
].join(",");

export const TRACE_MEDIA_LIMITS = {
  image: 15 * 1024 * 1024,
  document: 25 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
};

function ext(name="") {
  const value=String(name).toLowerCase();
  const index=value.lastIndexOf(".");
  return index>=0?value.slice(index+1):"";
}

export function normalizedMime(file) {
  const direct=String(file?.type||"").toLowerCase().trim();
  if(direct && direct!=="application/octet-stream") return direct;
  return EXTENSION_MIME[ext(file?.name)] || direct || "application/octet-stream";
}

export function traceAttachmentKind(file) {
  const mime=normalizedMime(file);
  if(IMAGE_MIME.has(mime) || mime.startsWith("image/")) return "image";
  if(AUDIO_MIME.has(mime) || mime.startsWith("audio/")) return "audio";
  if(DOCUMENT_MIME.has(mime)) return "document";
  return "unsupported";
}

export function validateTraceAttachment(file) {
  if(!file) return {ok:false,message:"Selecciona un archivo."};
  if(file.size<1) return {ok:false,message:"El archivo está vacío."};
  const kind=traceAttachmentKind(file);
  if(kind==="unsupported") return {ok:false,message:"Formato no admitido. Usa imagen, audio, PDF, Word, Excel, PowerPoint, TXT o CSV."};
  const limit=TRACE_MEDIA_LIMITS[kind];
  if(file.size>limit) return {ok:false,message:`El archivo supera el límite de ${Math.round(limit/1024/1024)} MB para ${kind==="image"?"imágenes":kind==="audio"?"audio":"documentos"}.`};
  return {ok:true,kind,mime:normalizedMime(file)};
}

async function decodeImage(file) {
  const url=URL.createObjectURL(file);
  try {
    const img=new Image();
    img.decoding="async";
    img.src=url;
    await img.decode();
    return {image:img,width:img.naturalWidth,height:img.naturalHeight};
  } catch(error) {
    throw new Error("El navegador no pudo convertir esta imagen; se conservará el archivo original.");
  } finally {
    // The image keeps decoded pixels after decode(); the object URL is no longer needed.
    URL.revokeObjectURL(url);
  }
}

async function renderVariant(decoded,maxDimension,quality,name) {
  const {image,width,height}=decoded;
  const scale=Math.min(1,maxDimension/Math.max(width,height));
  const outWidth=Math.max(1,Math.round(width*scale));
  const outHeight=Math.max(1,Math.round(height*scale));
  const canvas=document.createElement("canvas");
  canvas.width=outWidth;
  canvas.height=outHeight;
  const ctx=canvas.getContext("2d",{alpha:false});
  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,outWidth,outHeight);
  ctx.drawImage(image,0,0,outWidth,outHeight);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("No se pudo optimizar la imagen.")),"image/jpeg",quality));
  return {file:new File([blob],name,{type:"image/jpeg",lastModified:Date.now()}),width:outWidth,height:outHeight};
}

function baseName(name="evidencia") {
  return String(name||"evidencia").replace(/\.[^.]+$/," ").trim().replace(/[^A-Za-z0-9áéíóúÁÉÍÓÚñÑ._ -]+/g,"").slice(0,120)||"evidencia";
}

export async function prepareTraceAttachment(file) {
  const check=validateTraceAttachment(file);
  if(!check.ok) throw new Error(check.message);
  const metadata={
    originalName:file.name||"archivo",
    originalMime:check.mime,
    originalBytes:file.size,
    attachmentKind:check.kind,
    optimization:"passthrough",
  };

  if(check.kind!=="image") return {file,thumbnail:null,metadata};

  try {
    const decoded=await decodeImage(file);
    metadata.originalWidth=decoded.width;
    metadata.originalHeight=decoded.height;
    const main=await renderVariant(decoded,1920,.82,`${baseName(file.name)}.jpg`);
    const thumb=await renderVariant(decoded,360,.72,`${baseName(file.name)}.thumb.jpg`);
    return {
      file:main.file,
      thumbnail:thumb.file,
      metadata:{
        ...metadata,
        optimization:"client-jpeg",
        optimizedMime:"image/jpeg",
        optimizedBytes:main.file.size,
        width:main.width,
        height:main.height,
        thumbnailBytes:thumb.file.size,
        thumbnailWidth:thumb.width,
        thumbnailHeight:thumb.height,
      },
    };
  } catch(error) {
    // HEIC/HEIF and other formats may not be decodable in every browser.
    // They are still accepted and stored; preview/normalization can be added server-side later.
    return {file,thumbnail:null,metadata:{...metadata,optimization:"passthrough",optimizationNote:error.message}};
  }
}

export function humanAttachmentSupport() {
  return "Imágenes JPG, PNG, WebP, HEIC/HEIF · PDF, Word, Excel, PowerPoint, TXT/CSV · Audio MP3, M4A/AAC, WAV, OGG/WebM";
}
