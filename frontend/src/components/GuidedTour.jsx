import { useState, useEffect, useCallback } from "react";

export default function GuidedTour({ steps, onFinish, storageKey }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(storageKey) === "done") return;
    const t = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(t);
  }, [storageKey]);

  const updateRect = useCallback(() => {
    const s = steps[step];
    if (!s?.target) { setRect(null); return; }
    const el = document.querySelector(s.target);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }, 300);
  }, [step, steps]);

  useEffect(() => {
    if (!visible) return;
    updateRect();
    window.addEventListener("resize", updateRect);
    return () => window.removeEventListener("resize", updateRect);
  }, [visible, updateRect]);

  if (!visible) return null;

  const finish = () => {
    localStorage.setItem(storageKey, "done");
    setVisible(false);
    onFinish?.();
  };

  const next = () => {
    if (step < steps.length - 1) setStep(s => s + 1);
    else finish();
  };
  const prev = () => { if (step > 0) setStep(s => s - 1); };

  const s = steps[step];
  const PAD = 8;

  // Compute tooltip position
  let tooltipStyle = { position: "fixed", zIndex: 10000, width: 288 };
  if (rect) {
    const pos = s.position || "bottom";
    if (pos === "bottom") {
      tooltipStyle.top = rect.top + rect.height + PAD + 12;
      tooltipStyle.left = Math.max(8, Math.min(rect.left, window.innerWidth - 304));
    } else if (pos === "top") {
      tooltipStyle.top = rect.top - PAD - 160;
      tooltipStyle.left = Math.max(8, Math.min(rect.left, window.innerWidth - 304));
    } else if (pos === "right") {
      tooltipStyle.top = rect.top + rect.height / 2 - 80;
      tooltipStyle.left = Math.min(rect.left + rect.width + PAD + 12, window.innerWidth - 304);
    } else if (pos === "left") {
      tooltipStyle.top = rect.top + rect.height / 2 - 80;
      tooltipStyle.left = Math.max(8, rect.left - 304 - PAD);
    } else {
      tooltipStyle.top = "50%"; tooltipStyle.left = "50%";
      tooltipStyle.transform = "translate(-50%, -50%)";
    }
    // Clamp vertical
    if (tooltipStyle.top !== "50%") {
      tooltipStyle.top = Math.max(8, Math.min(tooltipStyle.top, window.innerHeight - 200));
    }
  } else {
    tooltipStyle.top = "50%"; tooltipStyle.left = "50%";
    tooltipStyle.transform = "translate(-50%, -50%)";
  }

  return (
    <>
      {/* Highlight box with cutout shadow */}
      {rect && (
        <div style={{
          position: "fixed",
          zIndex: 9999,
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          borderRadius: 10,
          border: "2px solid white",
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          pointerEvents: "none",
          transition: "all 0.3s ease",
        }} />
      )}
      {/* Fallback overlay when no target */}
      {!rect && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.55)" }} />
      )}
      {/* Tooltip card */}
      <div style={tooltipStyle} className="bg-white rounded-xl shadow-2xl p-5">
        <p className="font-semibold text-slate-900 text-sm mb-1">{s.title}</p>
        <p className="text-sm text-slate-600 leading-relaxed mb-3">{s.description}</p>
        <p className="text-xs text-center text-slate-400 mb-3">{step + 1} de {steps.length}</p>
        <div className="flex items-center justify-between gap-2">
          <button onClick={finish} className="text-xs text-slate-400 hover:text-slate-600 underline">
            Omitir visita
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={prev}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
                ← Atrás
              </button>
            )}
            <button onClick={next}
              className="px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary-dark font-medium">
              {step < steps.length - 1 ? "Siguiente →" : "Finalizar"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
