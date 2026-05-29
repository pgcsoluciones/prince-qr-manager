/**
 * TraceLandingPreview
 * A visual mockup of the public QR landing page using styled divs.
 * Props: point (trace_point object)
 */
export default function TraceLandingPreview({ point }) {
  if (!point) return null;

  const brandColor = point.brand_color || "#2563eb";
  const brandLogo = point.brand_logo || null;
  const checklistItems = Array.isArray(point.checklist_items) ? point.checklist_items : [];
  const surveyQuestions = Array.isArray(point.survey_questions) ? point.survey_questions : [];
  const qrType = point.qr_type || "mixed";

  const showChecklist = (qrType === "checklist" || qrType === "mixed") && checklistItems.length > 0;
  const showSurvey = (qrType === "survey" || qrType === "mixed") && surveyQuestions.length > 0;
  const npsQuestion = surveyQuestions.find(q => q.type === "nps");

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm bg-[#f1f5f9] p-3 max-w-xs mx-auto select-none">
      {/* Simulated phone frame */}
      <div className="space-y-2">
        {/* Header */}
        <div
          className="rounded-xl p-3 text-white"
          style={{ background: `linear-gradient(135deg, ${brandColor}, ${brandColor}dd)` }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            {brandLogo ? (
              <img src={brandLogo} alt="Logo" className="h-5 object-contain" onError={e => { e.target.style.display = "none"; }} />
            ) : (
              <span className="text-[10px] font-bold opacity-80">Intap TRACE</span>
            )}
          </div>
          <div
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold mb-1"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            Intap TRACE
          </div>
          <p className="font-bold text-sm leading-tight">{point.name || "Nombre del punto"}</p>
          {point.area && <p className="text-[11px] opacity-80 mt-0.5">{point.area}</p>}
        </div>

        {/* Checklist preview */}
        {showChecklist && (
          <div className="bg-white rounded-xl px-3 py-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Checklist</p>
            <div className="space-y-1.5">
              {checklistItems.slice(0, 3).map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded flex-shrink-0 border-2"
                    style={{ borderColor: brandColor }}
                  />
                  <span className="text-[11px] text-slate-600 truncate">{item.label || "Ítem de verificación"}</span>
                  {item.required && <span className="text-[9px] text-red-400 flex-shrink-0">*</span>}
                </div>
              ))}
              {checklistItems.length > 3 && (
                <p className="text-[10px] text-slate-400">+{checklistItems.length - 3} ítems más...</p>
              )}
            </div>
          </div>
        )}

        {/* NPS preview */}
        {showSurvey && npsQuestion && (
          <div className="bg-white rounded-xl px-3 py-2">
            <p className="text-[11px] font-medium text-slate-700 mb-2">{npsQuestion.label}</p>
            <div className="flex gap-0.5 flex-wrap">
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <div
                  key={n}
                  className="flex-1 min-w-[18px] h-7 rounded border-2 border-slate-200 flex items-center justify-center text-[9px] font-semibold text-slate-500"
                >
                  {n}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Other survey questions (non-NPS, max 1) */}
        {showSurvey && !npsQuestion && surveyQuestions.length > 0 && (
          <div className="bg-white rounded-xl px-3 py-2">
            <p className="text-[11px] font-medium text-slate-700 mb-1">{surveyQuestions[0].label}</p>
            <div className="h-10 bg-slate-50 rounded-lg border border-slate-200" />
          </div>
        )}

        {/* Contact input */}
        <div className="bg-white rounded-xl px-3 py-2">
          <p className="text-[10px] text-slate-400 mb-1">¿Quieres que te contactemos? (opcional)</p>
          <div className="h-7 bg-slate-50 rounded-lg border border-slate-200" />
        </div>

        {/* Submit button */}
        <button
          className="w-full py-2.5 rounded-xl text-white text-xs font-bold"
          style={{ background: brandColor }}
        >
          Enviar respuesta
        </button>

        <p className="text-center text-[9px] text-slate-400">Verificación por Intap Code</p>
      </div>
    </div>
  );
}
