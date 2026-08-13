import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const RUBROS = [
  {
    id: "hospitality",
    label: "Hostelería",
    icon: "hotel",
    options: ["Limpieza de habitaciones", "Mantenimiento", "Áreas comunes", "Experiencia del huésped"],
  },
  {
    id: "restaurant",
    label: "Restaurante",
    icon: "restaurant",
    options: ["Control de temperatura", "Limpieza", "Recepción de alimentos", "Apertura y cierre"],
  },
  {
    id: "construction",
    label: "Construcción",
    icon: "construction",
    options: ["Avance de obra", "Inspecciones", "Materiales", "Seguridad laboral"],
  },
  {
    id: "property",
    label: "Propiedades",
    icon: "property",
    options: ["Entrega de propiedades", "Inspecciones", "Mantenimiento", "Garantías y postventa"],
  },
  {
    id: "rental",
    label: "Alquileres",
    icon: "rental",
    options: ["Entrada y salida", "Inventario", "Inspección periódica", "Mantenimiento"],
  },
  {
    id: "other",
    label: "Otros rubros",
    icon: "other",
    options: ["Logística", "Almacén", "Servicios", "Configurar otro tipo de operación"],
  },
];

function RubroIcon({ type }) {
  const common = {
    width: 34,
    height: 34,
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  if (type === "hotel") {
    return <svg {...common}><path d="M7 27V7h13v20M20 13h5v14M4 27h24M11 11h2M16 11h2M11 15h2M16 15h2M11 19h2M16 19h2M12 27v-4h4v4"/></svg>;
  }

  if (type === "restaurant") {
    return <svg {...common}><path d="M8 5v8M5 5v5a3 3 0 0 0 6 0V5M8 13v14M20 5c-3 3-3 9 0 12v10M24 5v22"/></svg>;
  }

  if (type === "construction") {
    return <svg {...common}><path d="M6 27V9M6 9h18M10 9l8-4 6 4M17 9v18M17 13h9M25 13v8M22 21h6M11 14h6M7 18h10"/></svg>;
  }

  if (type === "property") {
    return <svg {...common}><path d="M5 27h22M7 27V11h10v16M17 27V6h8v21M10 15h2M10 19h2M20 10h2M20 14h2M20 18h2"/></svg>;
  }

  if (type === "rental") {
    return <svg {...common}><circle cx="12" cy="11" r="6"/><path d="M16 15l11 11M21 20l-3 3M24 23l-3 3"/></svg>;
  }

  return <svg {...common}><rect x="5" y="5" width="8" height="8" rx="1"/><rect x="19" y="5" width="8" height="8" rx="1"/><rect x="5" y="19" width="8" height="8" rx="1"/><rect x="19" y="19" width="8" height="8" rx="1"/></svg>;
}

function Progress({ step }) {
  return (
    <div className="flex items-center gap-6 text-sm text-slate-700">
      <span className="whitespace-nowrap font-medium">Paso {step} de 4</span>
      <div className="flex items-center gap-7" aria-label={`Paso ${step} de 4`}>
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={`h-4 w-4 rounded-full transition ${n === step ? "bg-blue-600" : n < step ? "bg-blue-200" : "bg-slate-200"}`}
          />
        ))}
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-baseline gap-2 tracking-tight">
      <span className="text-2xl font-black text-slate-950">KAWVO</span>
      <span className="text-2xl font-semibold text-blue-600">Trace</span>
    </div>
  );
}

function RubroRow({ item, active, selectedOption, onOpen, onOption }) {
  return (
    <div className={`relative bg-white transition ${active ? "z-10 ring-2 ring-inset ring-blue-600" : "border-b border-slate-200 last:border-b-0"}`}>
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={active}
        className={`flex w-full items-center gap-5 px-7 py-5 text-left transition ${active ? "text-blue-600" : "text-slate-950 hover:bg-slate-50"}`}
      >
        <span className={`grid h-10 w-10 place-items-center ${active ? "text-blue-600" : "text-slate-900"}`}>
          <RubroIcon type={item.icon} />
        </span>
        <span className="flex-1 text-lg font-black">{item.label}</span>
        <span className={`text-3xl font-light leading-none transition-transform ${active ? "rotate-90 text-blue-600" : "text-slate-950"}`}>›</span>
      </button>

      {active && (
        <div className="border-t border-blue-100 px-7 pb-4 pt-2 sm:pl-[84px]">
          <div className="grid gap-1">
            {item.options.map((option) => {
              const chosen = selectedOption === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onOption(option)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${chosen ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"}`}
                >
                  <span className={`h-2 w-2 rounded-full ${chosen ? "bg-blue-600" : "bg-slate-300"}`} />
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TraceOnboardingPage() {
  const navigate = useNavigate();
  const [selectedRubro, setSelectedRubro] = useState("");
  const [selectedOption, setSelectedOption] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customRubro, setCustomRubro] = useState("");
  const [customOperation, setCustomOperation] = useState("");

  const selected = useMemo(() => RUBROS.find((r) => r.id === selectedRubro), [selectedRubro]);
  const customReady = Boolean(customOpen && customRubro.trim() && customOperation.trim());
  const ready = Boolean((selectedRubro && selectedOption) || customReady);

  function chooseRubro(id) {
    setCustomOpen(false);
    setCustomRubro("");
    setCustomOperation("");
    setSelectedOption("");
    setSelectedRubro((current) => (current === id ? "" : id));
  }

  function openCustom() {
    setSelectedRubro("");
    setSelectedOption("");
    setCustomOpen(true);
  }

  function continueSetup() {
    if (!ready) return;

    const draft = customReady
      ? { rubro: "custom", rubroLabel: customRubro.trim(), operation: customOperation.trim(), customized: true }
      : { rubro: selectedRubro, rubroLabel: selected?.label || selectedRubro, operation: selectedOption, customized: false };

    localStorage.setItem("trace_onboarding_draft", JSON.stringify(draft));
    navigate("/trace/setup/company");
  }

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <div className="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <Brand />
          <Progress step={1} />
        </header>

        <main className="mx-auto mt-10 max-w-[940px] pb-10 sm:mt-12">
          <p className="text-2xl font-black tracking-tight sm:text-3xl">Hola, bienvenido a Trace</p>
          <h1 className="mt-5 text-4xl font-black tracking-[-0.035em] sm:text-5xl">¿En qué área deseas utilizar Trace?</h1>
          <p className="mt-3 text-base text-slate-600 sm:text-lg">Selecciona un rubro para configurar tu espacio de trabajo.</p>

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-300 bg-white">
            {RUBROS.map((item) => (
              <RubroRow
                key={item.id}
                item={item}
                active={selectedRubro === item.id}
                selectedOption={selectedRubro === item.id ? selectedOption : ""}
                onOpen={() => chooseRubro(item.id)}
                onOption={setSelectedOption}
              />
            ))}
          </section>

          <button
            type="button"
            onClick={openCustom}
            className={`mt-5 flex w-full items-center justify-center gap-3 rounded-xl border px-5 py-4 text-base font-black transition ${customOpen ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-900 bg-white text-slate-900 hover:bg-slate-50"}`}
          >
            <span className="text-xl">⚙</span>
            Personalizar mi operación
          </button>

          {customOpen && (
            <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50/40 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  Rubro o área
                  <input
                    autoFocus
                    value={customRubro}
                    onChange={(e) => setCustomRubro(e.target.value)}
                    placeholder="Ej. Clínica, taller, seguridad..."
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-blue-500"
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold text-slate-700">
                  ¿Qué deseas controlar?
                  <input
                    value={customOperation}
                    onChange={(e) => setCustomOperation(e.target.value)}
                    placeholder="Ej. Inspecciones, entregas, mantenimiento..."
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-blue-500"
                  />
                </label>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={continueSetup}
            disabled={!ready}
            className="mt-5 w-full rounded-xl bg-blue-600 px-6 py-4 text-lg font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            Continuar
          </button>
        </main>
      </div>
    </div>
  );
}
