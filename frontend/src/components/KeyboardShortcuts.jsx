import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const SHORTCUTS = [
  { key: "N",     description: "Nuevo QR" },
  { key: "/",     description: "Buscar" },
  { key: "G + L", description: "Ir a Mis QRs" },
  { key: "G + T", description: "Ir a TRACE" },
  { key: "G + A", description: "Ir a Estadísticas" },
  { key: "G + S", description: "Ir a Configuración" },
  { key: "Esc",   description: "Cerrar modal / panel" },
  { key: "?",     description: "Ver esta ayuda" },
];

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const [gPressed, setGPressed] = useState(false);

  useEffect(() => {
    let gTimer = null;

    const onKeyDown = (e) => {
      const tag = e.target.tagName.toLowerCase();
      const isInput = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;

      if (e.key === "Escape") {
        setOpen(false);
        return;
      }

      if (isInput) return;

      // "?" (Shift+/) opens shortcuts modal
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }

      // G + <key> navigation chords
      if (gPressed) {
        clearTimeout(gTimer);
        setGPressed(false);
        if (e.key === "l" || e.key === "L") {
          e.preventDefault();
          navigate("/dashboard/links");
        } else if (e.key === "t" || e.key === "T") {
          e.preventDefault();
          navigate("/dashboard/trace");
        } else if (e.key === "a" || e.key === "A") {
          e.preventDefault();
          navigate("/dashboard/analytics");
        } else if (e.key === "s" || e.key === "S") {
          e.preventDefault();
          navigate("/dashboard/settings");
        }
        return;
      }

      if (e.key === "g" || e.key === "G") {
        setGPressed(true);
        gTimer = setTimeout(() => setGPressed(false), 1000);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(gTimer);
    };
  }, [gPressed, navigate]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Atajos de teclado</h2>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Shortcuts list */}
        <div className="p-5 space-y-1">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <span className="text-sm text-slate-600">{s.description}</span>
              <kbd className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-mono font-semibold text-slate-700">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="px-5 pb-4 text-center">
          <p className="text-xs text-slate-400">Presiona <kbd className="px-1 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-xs">?</kbd> en cualquier momento para ver esta pantalla</p>
        </div>
      </div>
    </div>
  );
}
