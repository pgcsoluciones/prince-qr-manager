import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export default function TraceFinalSetupPage() {
  const nav = useNavigate();

  const draft = useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem("trace_onboarding_draft") || "{}"
      );
    } catch {
      return {};
    }
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <b className="text-2xl">KAWVO</b>
            <span className="text-2xl font-semibold text-blue-600">
              Trace
            </span>
          </div>

          <div className="flex items-center gap-5 text-sm">
            <span>Paso 4 de 4</span>

            <div className="flex gap-6">
              {[1, 2, 3, 4].map((n) => (
                <span
                  key={n}
                  className="h-4 w-4 rounded-full bg-blue-600"
                />
              ))}
            </div>
          </div>
        </header>

        <main className="mx-auto mt-16 max-w-[760px]">
          <p className="text-sm font-black uppercase tracking-[.18em] text-blue-600">
            {draft.operationName || "Tu proyecto"}
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
            Configuración final
          </h1>

          <p className="mt-4 text-base leading-7 text-slate-600">
            Este paso queda preparado para definir contigo
            la última configuración de Trace.
          </p>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <p className="text-sm text-slate-500">
              Proyecto
            </p>

            <p className="mt-1 text-xl font-black">
              {draft.operationName || "Proyecto TRACE"}
            </p>

            <p className="mt-3 text-sm text-slate-500">
              {draft.rubroLabel}
              {draft.operation
                ? ` · ${draft.operation}`
                : ""}
            </p>
          </div>

          <button
            onClick={() => nav("/trace/setup/team")}
            className="mt-8 rounded-xl border border-blue-500 px-7 py-3 text-sm font-black text-blue-600"
          >
            ← Volver al equipo
          </button>
        </main>
      </div>
    </div>
  );
}
