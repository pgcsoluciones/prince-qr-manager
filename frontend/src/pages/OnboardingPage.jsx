import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api.js";
import { useAuth } from "../context/AuthContext.jsx";

/* ── Industry options ── */
const INDUSTRIES = [
  { id: "personal",       label: "Personal",        icon: "👤", color: "bg-blue-50 text-blue-600"    },
  { id: "marketing",      label: "Marketing",        icon: "📣", color: "bg-pink-50 text-pink-600"    },
  { id: "restaurantes",   label: "Restaurantes",     icon: "🍽️", color: "bg-orange-50 text-orange-600"},
  { id: "retail",         label: "Retail",           icon: "🛍️", color: "bg-purple-50 text-purple-600"},
  { id: "educacion",      label: "Educación",        icon: "🎓", color: "bg-green-50 text-green-600"  },
  { id: "salud",          label: "Salud",            icon: "🏥", color: "bg-red-50 text-red-600"      },
  { id: "tecnologia",     label: "Tecnología",       icon: "💻", color: "bg-indigo-50 text-indigo-600"},
  { id: "inmobiliaria",   label: "Inmobiliaria",     icon: "🏠", color: "bg-teal-50 text-teal-600"    },
  { id: "finanzas",       label: "Finanzas",         icon: "💳", color: "bg-yellow-50 text-yellow-700"},
  { id: "entretenimiento",label: "Entretenimiento",  icon: "🎬", color: "bg-fuchsia-50 text-fuchsia-600"},
];

/* ── Progress dots ── */
function ProgressDots({ current, total }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i < current
              ? "w-6 h-2 bg-primary"
              : i === current
              ? "w-6 h-2 bg-primary/40"
              : "w-2 h-2 bg-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

/* ── Step 1 – Industry selection ── */
function StepIndustry({ selected, onSelect, onNext }) {
  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          ¿Para qué usarás Intap Code?
        </h2>
        <p className="text-slate-500 text-sm">
          Selecciona tu sector para personalizar tu experiencia
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        {INDUSTRIES.map((ind) => {
          const isSelected = selected === ind.id;
          return (
            <button
              key={ind.id}
              onClick={() => onSelect(ind.id)}
              className={`flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all duration-150 ${
                isSelected
                  ? "border-primary bg-blue-50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0 ${ind.color}`}>
                {ind.icon}
              </div>
              <span className={`text-sm font-medium leading-tight ${isSelected ? "text-primary" : "text-slate-700"}`}>
                {ind.label}
              </span>
              {isSelected && (
                <div className="ml-auto flex-shrink-0">
                  <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={onNext}
        disabled={!selected}
        className="btn-primary w-full py-3 text-base"
      >
        Continuar
        <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

/* ── Step 2 – Company name ── */
function StepCompany({ name, onChange, onNext, onBack }) {
  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          ¿Cuál es el nombre de tu empresa?
        </h2>
        <p className="text-slate-500 text-sm">
          Lo usaremos para personalizar tus QRs y proyectos
        </p>
      </div>

      <div className="mb-8">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Nombre de empresa o proyecto
        </label>
        <input
          type="text"
          autoFocus
          className="input py-3 text-base"
          placeholder="Ej. Mi Empresa S.A., Proyecto Personal…"
          value={name}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onNext()}
        />
        <p className="text-xs text-slate-400 mt-2">Puedes cambiarlo más tarde en tu perfil</p>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-secondary flex-1 py-3">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Atrás
        </button>
        <button
          onClick={onNext}
          disabled={!name.trim()}
          className="btn-primary flex-[2] py-3 text-base"
        >
          Continuar
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── Step 3 – Success / create first QR ── */
function StepDone({ companyName, onFinish }) {
  return (
    <div className="animate-fade-in text-center">
      {/* Animated success icon */}
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-30" />
        <div className="relative w-20 h-20 bg-gradient-to-br from-primary to-blue-700 rounded-full flex items-center justify-center shadow-lg">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-slate-900 mb-2">
        ¡Todo listo{companyName ? `, ${companyName}` : ""}!
      </h2>
      <p className="text-slate-500 text-sm mb-2">
        Tu cuenta está configurada. Ahora crea tu primer código QR
        y empieza a conectar el mundo físico con lo digital.
      </p>

      {/* Feature highlights */}
      <div className="grid grid-cols-3 gap-3 my-8">
        {[
          { icon: "📱", label: "QRs dinámicos" },
          { icon: "📊", label: "Analíticas" },
          { icon: "🔗", label: "Acortador" },
        ].map((f) => (
          <div key={f.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div className="text-2xl mb-1">{f.icon}</div>
            <div className="text-xs font-medium text-slate-600">{f.label}</div>
          </div>
        ))}
      </div>

      <button onClick={onFinish} className="btn-primary w-full py-3 text-base mb-3">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <path d="M14 14h2v2h-2zM18 14h3v2h-3zM14 18h3v2h-3zM19 18h2v3h-2z" />
        </svg>
        Crear mi primer QR
      </button>

      <button
        onClick={onFinish}
        className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
      >
        Ir al dashboard sin crear
      </button>
    </div>
  );
}

/* ── Main Onboarding page ── */
export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep]       = useState(0);
  const [industry, setIndustry] = useState("");
  const [company, setCompany]   = useState("");

  const TOTAL_STEPS = 3;

  const handleFinish = async () => {
    localStorage.setItem("onboarding_industry", industry);
    localStorage.setItem("onboarding_company",  company);
    localStorage.setItem("onboarding_done", "1");
    if (user) {
      localStorage.setItem("onboarding_done_" + user.id, "1");
      try { await api.put("/api/settings", { onboarding_done: true, industry, company }); } catch (_) {}
    }
    navigate("/dashboard/links");
  };

  const nextStep = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  const stepLabels = ["Sector", "Empresa", "Listo"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-white flex flex-col items-center justify-center p-4">

      {/* Header / logo */}
      <div className="flex items-center gap-2.5 mb-8">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white font-extrabold text-sm shadow-sm">
          IC
        </div>
        <span className="font-bold text-slate-900 text-lg">Intap Code</span>
      </div>

      {/* Card */}
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-card p-8">

        {/* Progress header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
              Paso {step + 1} de {TOTAL_STEPS}
            </p>
            <div className="flex items-center gap-2">
              {stepLabels.map((label, i) => (
                <span key={label} className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${i === step ? "text-primary" : i < step ? "text-slate-400 line-through" : "text-slate-300"}`}>
                    {label}
                  </span>
                  {i < stepLabels.length - 1 && (
                    <span className="text-slate-200 text-xs">›</span>
                  )}
                </span>
              ))}
            </div>
          </div>
          <ProgressDots current={step} total={TOTAL_STEPS} />
        </div>

        {/* Step content */}
        {step === 0 && (
          <StepIndustry
            selected={industry}
            onSelect={setIndustry}
            onNext={nextStep}
          />
        )}
        {step === 1 && (
          <StepCompany
            name={company}
            onChange={setCompany}
            onNext={nextStep}
            onBack={prevStep}
          />
        )}
        {step === 2 && (
          <StepDone
            companyName={company.trim()}
            onFinish={handleFinish}
          />
        )}
      </div>

      {/* Footer */}
      <p className="text-xs text-slate-400 mt-6">
        ¿Ya configuraste tu cuenta?{" "}
        <button
          onClick={() => navigate("/dashboard/links")}
          className="text-primary hover:underline font-medium"
        >
          Ir al dashboard
        </button>
      </p>
    </div>
  );
}
