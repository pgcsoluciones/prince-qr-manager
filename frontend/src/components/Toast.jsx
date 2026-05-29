import { useState, useCallback } from "react";

// ─── Toast System ────────────────────────────────────────────────────────────
let _setToasts = null;
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  _setToasts = setToasts;
  return (
    <>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white flex items-center gap-2 animate-fade-in ${
              t.type === "error" ? "bg-red-600" : t.type === "warning" ? "bg-amber-500" : "bg-gray-900"
            }`}
          >
            {t.type === "error" ? "✕" : t.type === "warning" ? "⚠" : "✓"} {t.message}
          </div>
        ))}
      </div>
    </>
  );
}

export function toast(message, type = "success") {
  if (!_setToasts) return;
  const id = Date.now();
  _setToasts((prev) => [...prev, { id, message, type }]);
  setTimeout(() => _setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
}
