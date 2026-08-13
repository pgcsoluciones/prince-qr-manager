export default function TraceActivityModal(props) {
  const open = props.open ?? true;
  const work = props.work || [];
  const executionId = props.executionId || "";
  const setExecutionId = props.setExecutionId || (()=>{});
  const type = props.type ?? props.activityType ?? "progress.updated";
  const setType = props.setType || props.setActivityType || (()=>{});
  const description = props.description ?? props.text ?? "";
  const setDescription = props.setDescription || props.setText || (()=>{});
  const { busy, onClose, onSave } = props;
  if (!open) return null;
  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-6" onMouseDown={onClose}>
    <div className="w-full max-w-xl rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" onMouseDown={e=>e.stopPropagation()}>
      <div className="border-b border-slate-100 p-6"><h2 className="text-xl font-bold text-slate-900">Registrar actividad</h2><p className="mt-1 text-sm text-slate-500">Guarda lo ocurrido dentro del historial del trabajo.</p></div>
      <div className="space-y-5 p-6">
        <div><label className="text-sm font-bold text-slate-900">Trabajo</label><select value={executionId} onChange={e=>setExecutionId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"><option value="">Selecciona…</option>{work.map(w=><option key={w.id} value={w.id}>{w.title||w.process_name} · {w.execution_code}</option>)}</select></div>
        <div><label className="text-sm font-bold text-slate-900">¿Qué ocurrió?</label><select value={type} onChange={e=>setType(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm"><option value="progress.updated">Avance o actualización</option><option value="inspection.recorded">Inspección realizada</option><option value="evidence.noted">Evidencia u observación</option><option value="delivery.recorded">Entrega o recepción</option><option value="issue.noted">Situación que requiere atención</option><option value="activity.recorded">Otra actividad</option></select></div>
        <div><label className="text-sm font-bold text-slate-900">Detalle</label><textarea rows={4} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe brevemente lo ocurrido…" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"/></div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button disabled={busy} onClick={onClose} className="btn-secondary">Cancelar</button><button disabled={busy||!work.length} onClick={onSave} className="btn-primary">{busy?"Guardando…":"Guardar en historial"}</button></div>
      </div>
    </div>
  </div>;
}
