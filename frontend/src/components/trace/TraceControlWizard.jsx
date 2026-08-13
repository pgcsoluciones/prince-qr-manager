export default function TraceControlWizard(props) {
  const {
    solution, name, setName, selectedUsers=[], selectedDepartments=[], publicView, setPublicView,
    busy, onClose, onCreate,
  } = props;
  const users = props.users || props.options?.users || [];
  const departments = props.departments || props.options?.departments || [];
  const toggleUser = props.toggleUser || props.onToggleUser || (()=>{});
  const toggleDepartment = props.toggleDepartment || props.onToggleDepartment || (()=>{});
  if (!solution) return null;
  return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-6" onMouseDown={onClose}>
    <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" onMouseDown={e=>e.stopPropagation()}>
      <div className="border-b border-slate-100 p-6">
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">Solución lista para usar</span>
        <h2 className="mt-3 text-xl font-bold text-slate-900">{solution.name}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{solution.description}</p>
      </div>
      <div className="space-y-6 p-6">
        <div>
          <h3 className="text-sm font-bold text-slate-900">TRACE ya preparó estos pasos</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{(solution.stages||[]).map((s,i)=><div key={s.key||i} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5"><span className="grid h-6 w-6 place-items-center rounded-full bg-white text-xs font-bold text-blue-700 shadow-sm">{i+1}</span><span className="text-sm text-slate-700">{s.name}</span></div>)}</div>
        </div>
        <div>
          <label className="text-sm font-bold text-slate-900">¿Dónde usarás este control?</label>
          <p className="mt-1 text-xs text-slate-500">Ejemplo: Torre Central · Avance de obra / Apartamento 304 · Entrega.</p>
          <input value={name} onChange={e=>setName(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
        </div>
        <div>
          <div className="text-sm font-bold text-slate-900">Responsables</div>
          <p className="mt-1 text-xs text-slate-500">Puedes asignarlos ahora o hacerlo visualmente después.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{users.map(u=><label key={u.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${selectedUsers.includes(u.id)?"border-blue-400 bg-blue-50":"border-slate-200"}`}><input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={()=>toggleUser(u.id)}/><span className="min-w-0 truncate text-sm font-semibold text-slate-800">{u.email}</span></label>)}</div>
        </div>
        {departments.length>0&&<div><div className="text-sm font-bold text-slate-900">Equipos o departamentos</div><div className="mt-3 grid gap-2 sm:grid-cols-2">{departments.map(d=><label key={d.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${selectedDepartments.includes(d.id)?"border-blue-400 bg-blue-50":"border-slate-200"}`}><input type="checkbox" checked={selectedDepartments.includes(d.id)} onChange={()=>toggleDepartment(d.id)}/><span className="text-sm font-semibold text-slate-800">{d.name}</span></label>)}</div></div>}
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><input type="checkbox" checked={publicView} onChange={e=>setPublicView(e.target.checked)} className="mt-1"/><span><span className="block text-sm font-bold text-emerald-900">Preparar seguimiento para cliente, propietario, inversionista o usuario</span><span className="mt-1 block text-xs leading-5 text-emerald-700">Cuando exista trabajo en curso podrás generar un enlace o QR con únicamente la información autorizada.</span></span></label>
        <div className="rounded-xl bg-blue-50 p-4 text-xs leading-5 text-blue-700"><strong>No tienes que armar el proceso.</strong> TRACE deja los pasos y controles principales listos; puedes editar después solo lo particular de tu empresa.</div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button disabled={busy} onClick={onClose} className="btn-secondary">Cancelar</button><button disabled={busy} onClick={onCreate} className="btn-primary">{busy?"Preparando…":"Activar control"}</button></div>
      </div>
    </div>
  </div>;
}
