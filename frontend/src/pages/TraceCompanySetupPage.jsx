import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const BASE =
  import.meta.env.VITE_API_URL ||
  "https://api.code.intaprd.com";

function headers() {
  const token = localStorage.getItem("qr_token") || "";

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function Dot({ n }) {
  return (
    <span
      className={`h-4 w-4 rounded-full ${
        n <= 2 ? "bg-blue-600" : "bg-slate-200"
      }`}
    />
  );
}

export default function TraceCompanySetupPage() {
  const nav = useNavigate();
  const { user } = useAuth();

  const draft = useMemo(() => {
    try {
      return JSON.parse(
        localStorage.getItem("trace_onboarding_draft") || "{}"
      );
    } catch {
      return {};
    }
  }, []);

  const [company, setCompany] =
    useState(draft.company || "");

  const [operationName, setOperationName] =
    useState(draft.operationName || "");

  const [location, setLocation] =
    useState(draft.location || "");

  const [description, setDescription] =
    useState(draft.description || "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const ready =
    company.trim() &&
    operationName.trim();

  async function save() {
    if (!ready || saving) return;

    setSaving(true);
    setError("");

    try {
      let projectId = draft.projectId;

      if (!projectId) {
        const response = await fetch(
          `${BASE}/api/trace/v1/admin/workspace/projects`,
          {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({
              name: operationName.trim(),
              location: location.trim(),
              description: [
                draft.rubroLabel,
                draft.operation,
                description.trim(),
              ]
                .filter(Boolean)
                .join(" · "),
            }),
          }
        );

        const json = await response.json();

        if (!response.ok) {
          throw new Error(
            json.message ||
              json.error ||
              "No fue posible crear el proyecto."
          );
        }

        projectId = json.data.id;

        // El creador queda como Administrar
        if (user?.id) {
          const assign = await fetch(
            `${BASE}/api/trace/v1/admin/workspace/projects/${encodeURIComponent(
              projectId
            )}/participants`,
            {
              method: "POST",
              headers: headers(),
              body: JSON.stringify({
                userId: user.id,
                projectRole: "manager",
              }),
            }
          );

          const assignJson = await assign.json();

          if (!assign.ok) {
            throw new Error(
              assignJson.message ||
                assignJson.error ||
                "No fue posible asignar al administrador inicial."
            );
          }
        }
      }

      localStorage.setItem(
        "trace_onboarding_draft",
        JSON.stringify({
          ...draft,
          company: company.trim(),
          operationName: operationName.trim(),
          location: location.trim(),
          description: description.trim(),
          projectId,
          step: 2,
        })
      );

      nav("/trace/setup/team");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-2">
            <b className="text-2xl">KAWVO</b>
            <span className="text-2xl font-semibold text-blue-600">
              Trace
            </span>
          </div>

          <div className="flex items-center gap-5 text-sm">
            <span>Step 2 of 4</span>

            <div className="flex gap-6">
              {[1, 2, 3, 4].map((n) => (
                <Dot key={n} n={n} />
              ))}
            </div>
          </div>
        </header>

        <main className="mx-auto mt-12 max-w-[820px]">
          <button
            onClick={() => nav("/trace/setup")}
            className="mb-7 text-sm font-black text-slate-500"
          >
            ← Volver
          </button>

          <p className="text-sm font-black uppercase tracking-[.18em] text-blue-600">
            {draft.rubroLabel || "Tu operación"}
            {" · "}
            {draft.operation || "Configuración"}
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-[-.035em] sm:text-5xl">
            Cuéntanos sobre tu empresa y operación
          </h1>

          <p className="mt-3 text-base text-slate-600">
            Con estos datos Trace preparará el espacio
            con el contexto correcto.
          </p>

          {error && (
            <div className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-8 grid gap-5">
            <Field
              label="Nombre de la empresa"
              value={company}
              set={setCompany}
              placeholder="Ej. Constructora Vista Real"
            />

            <Field
              label="Nombre de la operación o proyecto"
              value={operationName}
              set={setOperationName}
              placeholder="Ej. Residencial Noria"
            />

            <Field
              label="Ubicación (opcional)"
              value={location}
              set={setLocation}
              placeholder="Ej. Santo Domingo"
            />

            <label className="grid gap-2 text-sm font-black">
              ¿Hay algo particular que Trace deba tomar en cuenta?

              <textarea
                rows="4"
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value)
                }
                className="resize-none rounded-xl border border-slate-300 px-4 py-3.5 font-normal outline-none focus:border-blue-500"
                placeholder="Ej. Controlar avance por apartamentos y exigir fotos antes de aprobar."
              />
            </label>
          </div>

          <div className="mt-8 flex gap-3">
            <button
              onClick={() => nav("/trace/setup")}
              className="rounded-xl border px-6 py-4 text-sm font-black"
            >
              Atrás
            </button>

            <button
              onClick={save}
              disabled={!ready || saving}
              className="flex-[2] rounded-xl bg-blue-600 px-6 py-4 text-base font-black text-white disabled:bg-slate-200 disabled:text-slate-400"
            >
              {saving
                ? "Creando proyecto…"
                : "Continuar"}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  set,
  placeholder,
}) {
  return (
    <label className="grid gap-2 text-sm font-black">
      {label}

      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-slate-300 px-4 py-3.5 text-base font-normal outline-none focus:border-blue-500"
      />
    </label>
  );
}
