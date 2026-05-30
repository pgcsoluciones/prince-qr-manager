import { useState } from "react";
import { api } from "../utils/api.js";

export default function AIBanner() {
  const [minimized, setMinimized] = useState(() => sessionStorage.getItem("ai_banner_min") === "1");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);

  const minimize = () => { sessionStorage.setItem("ai_banner_min", "1"); setMinimized(true); };
  const restore = () => { sessionStorage.removeItem("ai_banner_min"); setMinimized(false); };

  const send = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setResponse(null);
    try {
      const data = await api.post("/api/ai/chat", { message: input });
      setResponse(data.message);
      setInput("");
    } catch (e) {
      setResponse("No pude conectarme con el asistente. Intenta de nuevo.");
    } finally { setLoading(false); }
  };

  if (minimized) return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-50 border-b border-blue-100 text-xs text-blue-600">
      <span>🤖</span>
      <span>Intap IA disponible</span>
      <button onClick={restore} className="ml-auto text-blue-500 hover:text-blue-700 underline">Mostrar</button>
    </div>
  );

  return (
    <div className="border-b border-blue-100">
      <div className="flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50">
        <span className="text-lg">🤖</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-blue-800">Intap IA</span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
            <span className="text-xs text-blue-500">En línea · Tu asistente de operaciones y análisis</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Pregúntame sobre tus métricas, procesos o cómo usar la plataforma..."
              className="flex-1 text-xs border border-blue-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
            />
            <button onClick={send} disabled={loading || !input.trim()}
              className="px-3 py-1.5 bg-primary text-white text-xs rounded-lg hover:bg-primary-dark disabled:opacity-50 font-medium flex items-center gap-1">
              {loading ? (
                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              ) : (
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
              )}
              {loading ? "..." : "Enviar"}
            </button>
          </div>
        </div>
        <button onClick={minimize} className="text-blue-300 hover:text-blue-500 text-xs p-1">—</button>
      </div>
      {response && (
        <div className="bg-white border-t border-blue-100 px-4 py-3 flex items-start gap-3">
          <span className="text-base mt-0.5">🤖</span>
          <div className="flex-1">
            <p className="text-xs font-semibold text-blue-700 mb-1">Intap IA</p>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{response}</p>
          </div>
          <button onClick={() => setResponse(null)} className="text-slate-300 hover:text-slate-500 text-xs">✕</button>
        </div>
      )}
    </div>
  );
}
