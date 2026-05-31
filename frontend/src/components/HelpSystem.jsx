import { useState } from "react";
import { useLocation } from "react-router-dom";

const HELP_CONTENT = {
  "/dashboard/links": {
    title: "Mis Códigos QR",
    description: "Aquí gestionas todos tus códigos QR dinámicos. Puedes editarlos, activarlos o desactivarlos en cualquier momento.",
    steps: [
      "Haz clic en '+ Nuevo QR' para crear tu primer código",
      "Elige el tipo: URL, WhatsApp, email, WiFi, entre otros",
      "Personaliza los colores y el diseño visual del QR",
      "Descarga tu QR en PNG o SVG para imprimirlo o compartirlo",
      "Desde la lista puedes ver cuántas veces fue escaneado cada QR",
    ],
    faqs: [
      { q: "¿Puedo cambiar el destino de un QR ya impreso?", a: "Sí. Como son QRs dinámicos, puedes cambiar la URL de destino en cualquier momento sin reimprimir el código." },
      { q: "¿Qué significa que un QR esté 'inactivo'?", a: "Un QR inactivo redirige a una página de error. Puedes activarlo o desactivarlo con el toggle de estado." },
      { q: "¿Cuántos QRs puedo crear?", a: "Depende de tu plan. El plan gratuito permite hasta 5 QRs. Puedes ver tu límite en la barra de uso del menú lateral." },
    ],
  },
  "/dashboard/trace": {
    title: "Intap TRACE",
    description: "TRACE te permite controlar operaciones físicas mediante QRs de punto de control. Mide, evalúa y recibe alertas automáticas.",
    steps: [
      "Crea un 'Punto de control' para cada área que quieres monitorear (baño, cocina, recepción, etc.)",
      "Elige la plantilla según tu industria o crea una personalizada",
      "Imprime el QR generado y pégalo en el área física",
      "Tu equipo escanea el QR para registrar el checklist o la ronda",
      "Tus clientes escanean para dejar su opinión y calificación",
      "Recibe alertas automáticas si algo no se completa a tiempo",
    ],
    faqs: [
      { q: "¿Cuál es la diferencia entre TRACE y los QR dinámicos normales?", a: "Los QR normales redirigen a una URL. Los QR TRACE muestran un formulario interactivo que recopila datos, registra checklists y genera estadísticas de operación." },
      { q: "¿Necesita internet el operario para escanear?", a: "Sí para enviar la respuesta. Si no hay señal, el formulario guarda los datos localmente y los envía cuando recupere la conexión." },
      { q: "¿Cómo recibo las alertas?", a: "Configura tus canales en TRACE → Configuración → Canales de notificación. Puedes recibir por email, WhatsApp, Slack o webhook." },
    ],
  },
  "/dashboard/analytics": {
    title: "Estadísticas",
    description: "Visualiza el rendimiento de todos tus QRs: escaneos, ubicaciones, dispositivos y tendencias en el tiempo.",
    steps: [
      "Selecciona el rango de fechas en la parte superior",
      "El gráfico principal muestra escaneos por día",
      "La tabla inferior muestra el detalle por cada QR",
      "Haz clic en un QR para ver sus estadísticas individuales",
      "Usa 'Exportar CSV' para descargar los datos (plan Pro+)",
    ],
    faqs: [
      { q: "¿Cada cuánto se actualizan las estadísticas?", a: "Casi en tiempo real. Hay un retraso máximo de 2 minutos entre el escaneo y la actualización del contador." },
      { q: "¿Por qué aparece una ubicación diferente a la real?", a: "La ubicación se detecta por la IP del dispositivo, que puede diferir de la ubicación física real, especialmente con VPN o datos móviles." },
    ],
  },
  "/dashboard/projects": {
    title: "Proyectos",
    description: "Organiza tus QRs en proyectos o carpetas para mantener todo ordenado. Ideal para separar campañas, sucursales o clientes.",
    steps: [
      "Crea un proyecto con '+ Nuevo proyecto'",
      "Asigna QRs a este proyecto desde la pantalla de 'Mis QRs'",
      "Filtra tus QRs por proyecto para ver solo los relevantes",
      "Puedes eliminar un proyecto sin borrar los QRs que contiene",
    ],
    faqs: [
      { q: "¿Puedo tener un QR en varios proyectos?", a: "No, cada QR pertenece a un solo proyecto. Puedes cambiarlo editando el QR." },
    ],
  },
  "/dashboard/shortener": {
    title: "Acortador de URLs",
    description: "Crea enlaces cortos con tu propio dominio (qr.intaprd.com/tu-slug) que puedes rastrear y editar en cualquier momento.",
    steps: [
      "Escribe o pega la URL larga que quieres acortar",
      "Personaliza el slug (la parte final del enlace) o déjalo automático",
      "Comparte el enlace corto — funciona igual que un QR dinámico",
      "Desde la lista puedes ver cuántos clics tuvo cada enlace",
    ],
    faqs: [
      { q: "¿Cuál es la diferencia entre un enlace corto y un QR?", a: "Son lo mismo internamente. Un enlace corto se comparte como texto; un QR se comparte como imagen escaneable. Puedes generar el QR de cualquier enlace corto." },
    ],
  },
  "/dashboard/team": {
    title: "Mi Equipo",
    description: "Invita a colaboradores a tu cuenta y asígnales roles según sus responsabilidades.",
    steps: [
      "Haz clic en 'Invitar miembro' e ingresa el email del colaborador",
      "Elige su rol: Administrador, Gestor, Operario o Visualizador",
      "El colaborador recibirá un email de invitación",
      "Puedes cambiar el rol o revocar el acceso en cualquier momento",
    ],
    faqs: [
      { q: "¿Cuál es la diferencia entre Administrador y Gestor?", a: "El Administrador puede invitar usuarios y cambiar roles. El Gestor puede crear y editar QRs pero no gestionar el equipo." },
      { q: "¿El equipo tiene acceso a los QRs TRACE?", a: "Sí, según el rol. Los Operarios solo pueden escanear puntos de control; los Gestores pueden ver reportes y crear puntos." },
    ],
  },
  "/dashboard/settings": {
    title: "Configuración",
    description: "Personaliza tu cuenta, activa notificaciones, configura tu agente IA y gestiona integraciones.",
    steps: [
      "En 'General': actualiza el nombre de tu empresa y sube tu logo",
      "En 'Notificaciones': elige cómo quieres recibir las alertas del sistema",
      "En 'Agente IA': personaliza el modelo y la personalidad de tu asistente",
      "En 'Integraciones': conecta Intap Code con otros sistemas via Webhook o API",
    ],
    faqs: [
      { q: "¿Qué es el Agente IA?", a: "Es un asistente que analiza tus datos de TRACE y genera reportes semanales con recomendaciones personalizadas para tu negocio." },
    ],
  },
  "/admin": {
    title: "Panel de Administración",
    description: "Gestiona todos los tenants, planes, suscripciones y configuraciones globales de la plataforma.",
    steps: [
      "En 'Overview': ve el resumen de ingresos y actividad de la plataforma",
      "En 'Tenants': busca, filtra y gestiona cada cuenta de cliente",
      "En 'Planes': configura precios, límites y funciones por plan",
      "En 'Modelos IA': asigna el LLM y personalidad del agente por tenant",
      "En 'Notificaciones': envía mensajes a todos o segmentos de clientes",
    ],
    faqs: [],
  },
};

const GENERIC_HELP = {
  title: "Centro de ayuda",
  description: "Bienvenido a Intap Code. Aquí encontrarás toda la información para sacar el máximo provecho de la plataforma.",
  steps: [
    "Crea tu primer QR dinámico desde 'Mis QRs'",
    "Organiza tus QRs en proyectos",
    "Activa TRACE para controlar operaciones físicas",
    "Revisa las analíticas para medir el impacto de tus QRs",
  ],
  faqs: [
    { q: "¿Qué es un QR dinámico?", a: "Es un código QR cuyo destino puedes cambiar en cualquier momento sin reimprimir el código físico." },
    { q: "¿Cómo contacto al soporte?", a: "Escríbenos a soporte@intaprd.com y te responderemos en menos de 24 horas hábiles." },
  ],
};

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors"
      >
        <span className="text-sm font-medium text-slate-700">{q}</span>
        <svg
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-3 text-sm text-slate-500 leading-relaxed border-t border-slate-100 pt-2">
          {a}
        </div>
      )}
    </div>
  );
}

export default function HelpSystem() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Match path to help content (check prefix for nested routes)
  const content = Object.keys(HELP_CONTENT).reduce((found, key) => {
    if (location.pathname.startsWith(key) && (!found || key.length > found.length)) {
      return key;
    }
    return found;
  }, null);

  const help = content ? HELP_CONTENT[content] : GENERIC_HELP;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 sm:bottom-24 right-6 z-50 w-10 h-10 rounded-full bg-primary text-white shadow-lg
                   flex items-center justify-center text-lg font-bold hover:bg-primary-dark transition-all
                   hover:scale-110 active:scale-95"
        aria-label="Abrir ayuda"
        title="Ayuda"
      >
        ?
      </button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/20" />

          {/* Panel */}
          <div
            className="relative w-full sm:w-80 h-full bg-white shadow-2xl flex flex-col animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: "slide-in-right 0.25s ease-out both" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0 bg-primary text-white">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70 mb-0.5">Centro de ayuda</p>
                <h2 className="font-bold text-base leading-tight">{help.title}</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                aria-label="Cerrar"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Description */}
              <p className="text-sm text-slate-600 leading-relaxed">{help.description}</p>

              {/* Steps */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Cómo usar esta sección</p>
                <ol className="space-y-2.5">
                  {help.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-sm text-slate-600 leading-snug">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* FAQs */}
              {help.faqs.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Preguntas frecuentes</p>
                  <div className="space-y-2">
                    {help.faqs.map((faq, i) => (
                      <FAQItem key={i} q={faq.q} a={faq.a} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex-shrink-0 border-t border-slate-100 p-4 space-y-2">
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-slate-50 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Ver video tutorial
              </a>
              <a
                href="mailto:soporte@intaprd.com"
                className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Contactar soporte
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
