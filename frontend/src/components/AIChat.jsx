import { useState, useRef, useEffect } from "react";
import { api } from "../utils/api.js";

const INITIAL_MESSAGE = {
  role: "assistant",
  text: "¡Hola! Soy Intap, tu asistente de operaciones. Puedo ayudarte a interpretar tus métricas, optimizar tus procesos o responder preguntas sobre la plataforma. ¿En qué te ayudo hoy?",
};

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-slate-100 rounded-xl w-fit">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

export default function AIChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);
    try {
      const data = await api.post("/api/ai/chat", { message: text });
      setMessages((m) => [...m, { role: "assistant", text: data.message || "No pude responder en este momento." }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "Lo siento, no pude conectarme al asistente. Inténtalo de nuevo." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col items-start gap-3">
      {/* Chat window */}
      {open && (
        <div className="w-80 h-[420px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-100 animate-scale-in">
          {/* Header */}
          <div className="bg-primary px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center text-lg flex-shrink-0">
              🤖
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm leading-none">Intap IA</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0" />
                <span className="text-white/80 text-[11px]">En línea</span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
              aria-label="Cerrar chat"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-white rounded-br-sm"
                      : "bg-slate-100 text-slate-700 rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <TypingIndicator />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-slate-100 flex items-end gap-2">
            <textarea
              className="flex-1 resize-none border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 max-h-24"
              placeholder="Escribe tu pregunta..."
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="p-2.5 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-40 flex-shrink-0"
              aria-label="Enviar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-14 h-14 rounded-full bg-primary text-white shadow-lg hover:bg-primary-dark transition-all hover:scale-105 active:scale-95 flex items-center justify-center text-2xl relative"
        aria-label="Abrir asistente Intap IA"
      >
        🤖
        {/* Online dot */}
        <span className="absolute top-1 right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
      </button>
    </div>
  );
}
