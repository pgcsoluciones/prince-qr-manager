export default function TraceActivityModal(props) {
  const open = props.open ?? true;
  const work = props.work || [];
  const executionId = props.executionId || "";
  const setExecutionId = props.setExecutionId || (()=>{});
  const description = props.description ?? props.text ?? "";
  const setDescription = props.setDescription || props.setText || (()=>{});
  const { busy, onClose, onSave } = props;
  if (!open) return null;

  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-6" onMouseDown={onClose}>
    <div className="w-full max-w-xl rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" onMouseDown={e=>e.stopPropagation()}>
      <div className="border-b border-slate-100 p-6">
        <h2 className="text-xl font-bold text-slate-900">Añadir nota</h2>
        <p className="mt-1 text-sm leading-5 text-slate-500">Añade contexto útil a la bitácora sin cambiar por sí solo el estado, progreso o cumplimiento del trabajo.</p>
      </div>
      <div className="space-y-5 p-6">
        <div>
          <label className="text-sm font-bold text-slate-900">Trabajo</label>
          <select value={executionId} onChange={e=>setExecutionId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm">
            <option value="">Selecciona…</option>
            {work.map(w=><option key={w.id} value={w.id}>{w.title||w.process_name} · {w.execution_code}</option>)}
          </select>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
          <div className="text-xs font-black text-blue-800">NOTA INFORMATIVA</div>
          <p className="mt-1 text-[11px] leading-4 text-blue-700">Quedará registrada en la trazabilidad, pero no completa actividades, no reporta incidencias, no valida evidencias y no modifica el avance.</p>
        </div>

        <div>
          <label className="text-sm font-bold text-slate-900">Nota</label>
          <textarea rows={5} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Escribe una nota breve y objetiva sobre el trabajo…" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"/>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button disabled={busy} onClick={onClose} className="btn-secondary">Cancelar</button>
          <button disabled={busy||!work.length||!description.trim()} onClick={onSave} className="btn-primary">{busy?"Guardando…":"Añadir a bitácora"}</button>
        </div>
      </div>
    </div>
  </div>;
}
