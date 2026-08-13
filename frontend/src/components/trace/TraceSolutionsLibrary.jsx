import { useMemo, useState } from "react";

const SECTORS = [
  ["all", "Todos"], ["construction", "Construcción"], ["property", "Propiedades"],
  ["maintenance", "Mantenimiento"], ["rental", "Alquileres"], ["logistics", "Logística"],
  ["warehouse", "Almacenes"], ["hospitality", "Hotelería"], ["other", "Otros"],
];

function industryName(v) {
  return ({construction:"Construcción",property:"Propiedades",maintenance:"Mantenimiento",rental:"Alquileres",logistics:"Logística",warehouse:"Almacenes",hospitality:"Hotelería",quality:"Calidad",service:"Servicios"}[v] || "Operaciones");
}

export default function TraceSolutionsLibraryV2({ templates = [], selected, onSelect, onUse }) {
  const [sector, setSector] = useState("all");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState(selected || null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      const known = SECTORS.some(([key]) => key === t.industry);
      const sectorOk = sector === "all" || t.industry === sector || (sector === "other" && !known);
      const text = `${t.name || ""} ${t.description || ""} ${industryName(t.industry)}`.toLowerCase();
      return sectorOk && (!q || text.includes(q));
    });
  }, [templates, sector, query]);

  function choose(solution) { setPreview(solution); onSelect?.(solution); }

  return <div className="mx-auto max-w-[1320px] space-y-6">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><h1 className="text-3xl font-black tracking-tight">Soluciones</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Elige el área y parte de una estructura ya preparada. Después solo ajustas responsables y detalles.</p></div>
      <div className="relative w-full max-w-sm"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none focus:border-blue-400" placeholder="Buscar una solución…"/></div>
    </header>

    <div className="flex gap-2 overflow-x-auto pb-1">{SECTORS.map(([key,label])=>{const count=key==='all'?templates.length:key==='other'?templates.filter(t=>!SECTORS.some(([k])=>k===t.industry)).length:templates.filter(t=>t.industry===key).length;if(key!=='all'&&!count)return null;return <button key={key} onClick={()=>{setSector(key);setPreview(null)}} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black ${sector===key?'border-slate-950 bg-slate-950 text-white':'border-slate-200 bg-white text-slate-600'}`}>{label}<span className={`ml-2 ${sector===key?'text-slate-300':'text-slate-400'}`}>{count}</span></button>})}</div>

    <div className={preview?"grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]":""}>
      <section className="min-w-0">
        <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">{filtered.length} {filtered.length===1?'solución':'soluciones'}</span>{(sector!=='all'||query)&&<button onClick={()=>{setSector('all');setQuery('');setPreview(null)}} className="text-xs font-black text-blue-600">Limpiar</button>}</div>
        {filtered.length?<div className={`grid gap-3 ${preview?'md:grid-cols-2':'md:grid-cols-2 xl:grid-cols-3'}`}>{filtered.map(t=>{const active=preview?.id===t.id;return <button key={t.id} onClick={()=>choose(t)} className={`rounded-2xl border bg-white p-5 text-left transition hover:border-blue-300 hover:shadow-sm ${active?'border-blue-500 ring-2 ring-blue-100':'border-slate-200'}`}><div className="flex items-start justify-between gap-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-600">{industryName(t.industry)}</span>{active&&<span className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-[10px] font-black text-white">✓</span>}</div><h2 className="mt-4 text-base font-black">{t.name}</h2><p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{t.description}</p><div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-[10px]"><span className="font-bold text-slate-500">{t.stages?.length||0} pasos preparados</span><span className="font-black text-blue-600">Ver →</span></div></button>})}</div>:<div className="grid min-h-[48vh] place-items-center rounded-3xl border border-dashed border-slate-300 bg-white"><div className="max-w-sm text-center"><h2 className="text-xl font-black">No encontramos una solución</h2><p className="mt-2 text-sm text-slate-500">Cambia el rubro o limpia la búsqueda.</p></div></div>}
      </section>

      {preview&&<aside className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm xl:sticky xl:top-[94px]"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[.16em] text-blue-600">{industryName(preview.industry)}</div><h2 className="mt-2 text-xl font-black">{preview.name}</h2></div><button onClick={()=>setPreview(null)} className="grid h-8 w-8 place-items-center rounded-lg text-lg text-slate-400 hover:bg-slate-100">×</button></div><p className="mt-3 text-xs leading-5 text-slate-500">{preview.description}</p><div className="mt-6 border-t border-slate-100 pt-5"><h3 className="text-xs font-black">Qué incluye</h3><div className="mt-3 space-y-3">{(preview.stages||[]).slice(0,8).map((stage,index)=><div key={stage.key||index} className="flex items-center gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-blue-50 text-[9px] font-black text-blue-700">{index+1}</span><span className="text-[11px] font-semibold text-slate-600">{stage.name}</span></div>)}</div></div><button onClick={()=>onUse?.(preview)} className="mt-7 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700">Usar esta solución</button></aside>}
    </div>
  </div>;
}
