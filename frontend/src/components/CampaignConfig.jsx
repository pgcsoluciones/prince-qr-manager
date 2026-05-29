// Panel de configuración de redirección programática y campaña temporal

const MODES = [
  { id: "direct",     icon: "→",  label: "Directo",         desc: "Siempre al mismo destino",              plan: "free" },
  { id: "ab_test",    icon: "⚡",  label: "A/B Test",        desc: "Divide tráfico entre 2 URLs",           plan: "pro" },
  { id: "weighted",   icon: "⚖️",  label: "Ponderado",       desc: "Divide tráfico con pesos personalizados", plan: "pro" },
  { id: "sequential", icon: "🔄", label: "Secuencial",      desc: "Rota entre URLs en orden",              plan: "enterprise" },
  { id: "geo",        icon: "🌍", label: "Por país",         desc: "Destino según ubicación del usuario",   plan: "pro" },
  { id: "device",     icon: "📱", label: "Por dispositivo",  desc: "Diferente URL para móvil/tablet/desktop", plan: "pro" },
];

const PLAN_RANK = { free: 0, starter: 1, pro: 2, enterprise: 3 };

function PlanBadge({ plan }) {
  const colors = { free: "bg-gray-100 text-gray-500", starter: "bg-blue-100 text-blue-600", pro: "bg-purple-100 text-purple-600", enterprise: "bg-amber-100 text-amber-600" };
  return <span className={`badge text-xs ${colors[plan]}`}>{plan}</span>;
}

function WeightedEditor({ rules = [], onChange }) {
  const add    = () => onChange([...rules, { url: "", weight: 50 }]);
  const remove = (i) => onChange(rules.filter((_, j) => j !== i));
  const set    = (i, key, val) => onChange(rules.map((r, j) => j === i ? { ...r, [key]: val } : r));
  const total  = rules.reduce((s, r) => s + Number(r.weight || 0), 0);

  return (
    <div className="space-y-2">
      {rules.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input className="input flex-1 text-xs" placeholder="https://destino.com" value={r.url}
            onChange={e => set(i, "url", e.target.value)} />
          <div className="flex items-center gap-1 w-24">
            <input type="number" className="input text-xs w-16" min={1} max={100} value={r.weight}
              onChange={e => set(i, "weight", Number(e.target.value))} />
            <span className="text-xs text-gray-400">%</span>
          </div>
          <button type="button" onClick={() => remove(i)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button type="button" onClick={add} className="text-xs text-brand-600 hover:underline">+ Agregar URL</button>
        <span className={`text-xs ${total !== 100 ? "text-red-500" : "text-green-600"}`}>Total: {total}%</span>
      </div>
    </div>
  );
}

function SequentialEditor({ rules = [], onChange }) {
  const add    = () => onChange([...rules, { url: "" }]);
  const remove = (i) => onChange(rules.filter((_, j) => j !== i));
  const set    = (i, val) => onChange(rules.map((r, j) => j === i ? { url: val } : r));

  return (
    <div className="space-y-2">
      {rules.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-4">{i + 1}.</span>
          <input className="input flex-1 text-xs" placeholder={`URL ${i + 1}`} value={r.url}
            onChange={e => set(i, e.target.value)} />
          <button type="button" onClick={() => remove(i)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-xs text-brand-600 hover:underline">+ Agregar URL</button>
      <p className="text-xs text-gray-400">El escaneo N irá a la URL N % {rules.length || "?"}</p>
    </div>
  );
}

const COUNTRIES = [
  {code:"US",name:"Estados Unidos"},{code:"MX",name:"México"},{code:"DO",name:"Rep. Dominicana"},
  {code:"ES",name:"España"},{code:"AR",name:"Argentina"},{code:"CO",name:"Colombia"},
  {code:"CL",name:"Chile"},{code:"PE",name:"Perú"},{code:"VE",name:"Venezuela"},
  {code:"EC",name:"Ecuador"},{code:"GT",name:"Guatemala"},{code:"PA",name:"Panamá"},
  {code:"CR",name:"Costa Rica"},{code:"HN",name:"Honduras"},{code:"SV",name:"El Salvador"},
  {code:"NI",name:"Nicaragua"},{code:"BO",name:"Bolivia"},{code:"PY",name:"Paraguay"},
  {code:"UY",name:"Uruguay"},{code:"BR",name:"Brasil"},{code:"GB",name:"Reino Unido"},
  {code:"DE",name:"Alemania"},{code:"FR",name:"Francia"},{code:"IT",name:"Italia"},
  {code:"CA",name:"Canadá"},{code:"AU",name:"Australia"},
];

function GeoEditor({ rules = [], defaultUrl = "", onRulesChange, onDefaultChange }) {
  const add    = () => onRulesChange([...rules, { country: "", url: "" }]);
  const remove = (i) => onRulesChange(rules.filter((_, j) => j !== i));
  const set    = (i, key, val) => onRulesChange(rules.map((r, j) => j === i ? { ...r, [key]: val } : r));

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">URL por defecto (otros países)</label>
        <input className="input text-xs" placeholder="https://destino-global.com" value={defaultUrl}
          onChange={e => onDefaultChange(e.target.value)} />
      </div>
      <div className="space-y-2">
        {rules.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <select className="input text-xs w-40" value={r.country} onChange={e => set(i, "country", e.target.value)}>
              <option value="">País...</option>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            <input className="input flex-1 text-xs" placeholder="https://..." value={r.url}
              onChange={e => set(i, "url", e.target.value)} />
            <button type="button" onClick={() => remove(i)} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className="text-xs text-brand-600 hover:underline">+ Agregar país</button>
    </div>
  );
}

function DeviceEditor({ rules = {}, onChange }) {
  const set = (key, val) => onChange({ ...rules, [key]: val });
  return (
    <div className="space-y-2">
      {[{key:"mobile",label:"📱 Móvil"},{key:"tablet",label:"🖥 Tablet"},{key:"desktop",label:"💻 Desktop"}].map(({key,label}) => (
        <div key={key}>
          <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
          <input className="input text-xs" placeholder="https://..." value={rules[key]||""}
            onChange={e => set(key, e.target.value)} />
        </div>
      ))}
    </div>
  );
}

export default function CampaignConfig({ value, onChange, userPlan = "free" }) {
  const {
    redirect_mode = "direct",
    redirect_rules = [],
    expires_at = "",
    max_scans = "",
    fallback_url = "",
    geo_default = "",
  } = value;

  const set = (key, val) => onChange({ ...value, [key]: val });
  const userRank = PLAN_RANK[userPlan] || 0;
  const currentMode = MODES.find(m => m.id === redirect_mode) || MODES[0];

  return (
    <div className="space-y-5">
      {/* Modo de redirección */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Modo de redirección</label>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((m) => {
            const locked = PLAN_RANK[m.plan] > userRank;
            return (
              <button key={m.id} type="button"
                disabled={locked}
                onClick={() => !locked && set("redirect_mode", m.id)}
                className={`flex items-start gap-2 p-3 rounded-xl border text-left transition-colors ${
                  redirect_mode === m.id
                    ? "border-brand-500 bg-brand-50"
                    : locked
                    ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                    : "border-gray-200 hover:border-gray-300"
                }`}>
                <span className="text-lg leading-none mt-0.5">{m.icon}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-gray-800">{m.label}</span>
                    {locked && <PlanBadge plan={m.plan} />}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 leading-tight">{m.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reglas según modo */}
      {redirect_mode !== "direct" && (
        <div className="bg-gray-50 rounded-xl p-4">
          <label className="block text-xs font-semibold text-gray-700 mb-3">
            Configurar {currentMode.label}
          </label>
          {(redirect_mode === "weighted" || redirect_mode === "ab_test") && (
            <WeightedEditor
              rules={Array.isArray(redirect_rules) ? redirect_rules : []}
              onChange={(r) => set("redirect_rules", r)}
            />
          )}
          {redirect_mode === "sequential" && (
            <SequentialEditor
              rules={Array.isArray(redirect_rules) ? redirect_rules : []}
              onChange={(r) => set("redirect_rules", r)}
            />
          )}
          {redirect_mode === "geo" && (
            <GeoEditor
              rules={Array.isArray(redirect_rules) ? redirect_rules : []}
              defaultUrl={geo_default}
              onRulesChange={(r) => set("redirect_rules", r)}
              onDefaultChange={(v) => set("geo_default", v)}
            />
          )}
          {redirect_mode === "device" && (
            <DeviceEditor
              rules={typeof redirect_rules === "object" && !Array.isArray(redirect_rules) ? redirect_rules : {}}
              onChange={(r) => set("redirect_rules", r)}
            />
          )}
        </div>
      )}

      {/* Campaña temporal */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Límites de campaña</label>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className={PLAN_RANK["starter"] > userRank ? "opacity-50" : ""}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Fecha de expiración
                {PLAN_RANK["starter"] > userRank && <PlanBadge plan="starter" />}
              </label>
              <input type="datetime-local" className="input text-xs"
                disabled={PLAN_RANK["starter"] > userRank}
                value={expires_at}
                onChange={e => set("expires_at", e.target.value)} />
            </div>
            <div className={PLAN_RANK["pro"] > userRank ? "opacity-50" : ""}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Máx. escaneos
                {PLAN_RANK["pro"] > userRank && <PlanBadge plan="pro" />}
              </label>
              <input type="number" min={1} className="input text-xs"
                disabled={PLAN_RANK["pro"] > userRank}
                placeholder="Ej: 500"
                value={max_scans}
                onChange={e => set("max_scans", e.target.value)} />
            </div>
          </div>
          {(expires_at || max_scans) && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">URL de fallback al expirar (opcional)</label>
              <input className="input text-xs" placeholder="https://página-expirada.com"
                value={fallback_url}
                onChange={e => set("fallback_url", e.target.value)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
