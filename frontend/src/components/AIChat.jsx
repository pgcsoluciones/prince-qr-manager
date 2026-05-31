import { useState, useRef, useEffect, useCallback } from "react";

const BASE = import.meta.env.VITE_API_URL || "https://api.code.intaprd.com";

const QUICK_QUESTIONS = [
  "¿Cómo crear un QR TRACE?",
  "Analiza mis métricas",
  "¿Qué plan me conviene?",
];

function getTime() {
  return new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem("ai_chat_messages");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(messages) {
  try {
    sessionStorage.setItem("ai_chat_messages", JSON.stringify(messages));
  } catch {}
}

const WELCOME = {
  id: "welcome",
  role: "assistant",
  content: "¡Hola! Soy tu asistente de operaciones de Intap. Puedo ayudarte con métricas, QRs TRACE, planes y más. ¿En qué te ayudo hoy?",
  time: getTime(),
};

function DotsLoader() {
  return (
    <div className="flex items-end gap-1 px-4 py-3 bg-slate-100 rounded-2xl rounded-tl-sm w-fit max-w-[80%]">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
    </div>
  );
}

export default function AIChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => loadSession() || [WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [messages, open]);

  useEffect(() => {
    saveSession(messages);
  }, [messages]);

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg = { id: Date.now().toString(), role: "user", content: trimmed, time: getTime() };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput("");
      setLoading(true);

      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      try {
        const token = localStorage.getItem("qr_token") || "";
        const res = await fetch(`${BASE}/api/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            message: trimmed,
            history: nextMessages
              .filter((m) => m.role !== "system")
              .slice(-10)
              .map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        const data = await res.json();
        const reply =
          data.reply || data.message || data.content || "Lo siento, no pude procesar tu solicitud.";
        const assistantMsg = {
          id: Date.now().toString() + "_a",
          role: "assistant",
          content: reply,
          time: getTime(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString() + "_err",
            role: "assistant",
            content: "Hubo un error al conectar con el asistente. Inténtalo de nuevo.",
            time: getTime(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading]
  );

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleTextareaInput = (e) => {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 80) + "px";
    setInput(el.value);
  };

  const showQuickQuestions = messages.length <= 1;

  return (
    <>
      {/* Chat dialog */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
          style={{ width: 360, height: 520 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              🤖
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-sm leading-none">Intap IA</p>
              <p className="text-blue-200 text-xs mt-0.5">En línea · Tu asistente de operaciones</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
              aria-label="Cerrar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 min-h-0">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col gap-0.5 ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed max-w-[85%] whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white rounded-tr-sm"
                      : "bg-slate-100 text-slate-800 rounded-tl-sm"
                  }`}
                >
                  {msg.content}
                </div>
                <span className="text-[10px] text-slate-400 px-1">{msg.time}</span>
              </div>
            ))}

            {loading && (
              <div className="flex flex-col items-start gap-0.5">
                <DotsLoader />
              </div>
            )}

            {/* Quick questions */}
            {showQuickQuestions && !loading && (
              <div className="flex flex-wrap gap-2 mt-1">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-xs px-3 py-1.5 rounded-full border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="flex-shrink-0 border-t border-slate-100 px-3 py-3 flex items-end gap-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onInput={handleTextareaInput}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un mensaje..."
              disabled={loading}
              className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-slate-50 placeholder-slate-400 disabled:opacity-50"
              style={{ minHeight: 36, maxHeight: 80 }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Enviar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Floating button */}
      <div className="fixed bottom-6 right-6 z-50">
        <div className="relative group">
          {/* Tooltip */}
          <span className="absolute bottom-full right-0 mb-2 px-2 py-1 rounded-lg bg-slate-800 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none select-none">
            Asistente IA
          </span>

          <button
            onClick={() => setOpen((o) => !o)}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-300"
            aria-label={open ? "Cerrar asistente" : "Abrir asistente IA"}
          >
            {open ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                />
              </svg>
            )}
          </button>

          {/* Online status dot */}
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-white" />
        </div>
      </div>
    </>
  );
}
