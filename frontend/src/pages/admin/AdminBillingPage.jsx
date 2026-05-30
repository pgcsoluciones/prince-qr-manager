import { useState, useEffect, useCallback } from "react";

const API = import.meta.env.VITE_API_URL || "https://api.code.intaprd.com";

function apiFetch(path, opts = {}) {
  const token = localStorage.getItem("qr_token");
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  }).then((r) => r.json());
}

// ── Status Badges ──────────────────────────────────────────────────────────────

const INVOICE_STATUS_BADGE = {
  paid:       "bg-green-100 text-green-800",
  pending:    "bg-yellow-100 text-yellow-800",
  failed:     "bg-red-100 text-red-800",
  cancelled:  "bg-gray-100 text-gray-700",
  refunded:   "bg-blue-100 text-blue-800",
};

const PAYMENT_STATUS_BADGE = {
  active:    "bg-green-100 text-green-800",
  past_due:  "bg-orange-100 text-orange-800",
  suspended: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-700",
};

function Badge({ label, colorClass }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${colorClass}`}>
      {label}
    </span>
  );
}

// ── Modal wrapper ──────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-bold text-slate-800 text-base">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(val, fallback = "—") {
  return val ?? fallback;
}

function fmtDate(s) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("es-DO", { year: "numeric", month: "short", day: "numeric" });
}

function fmtUSD(n) {
  if (n == null) return "—";
  return `$${Number(n).toFixed(2)}`;
}

const PLANS = ["free", "starter", "pro", "enterprise"];
const BILLING_CYCLES = [
  { value: "monthly", label: "Mensual" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
];
const PAYMENT_METHODS = [
  "Tarjeta de crédito",
  "Transferencia bancaria",
  "PayPal",
  "Azul",
  "Cardnet",
  "Stripe",
  "Efectivo",
  "Otro",
];
const INVOICE_STATUSES = ["paid", "pending", "failed", "cancelled", "refunded"];
const INVOICE_STATUS_LABELS = { paid: "Pagado", pending: "Pendiente", failed: "Fallido", cancelled: "Cancelado", refunded: "Reembolsado" };
const PAYMENT_STATUS_LABELS = { active: "Activo", past_due: "Vencido", suspended: "Suspendido", cancelled: "Cancelado" };

const PROVIDERS = [
  { group: "Internacional", items: ["stripe", "paypal", "mercadopago", "payoneer"] },
  { group: "República Dominicana", items: ["azul", "cardnet", "epagos_rd", "popular_en_linea", "payretailers"] },
];
const PROVIDER_LABELS = {
  stripe: "Stripe", paypal: "PayPal", mercadopago: "MercadoPago", payoneer: "Payoneer",
  azul: "Azul (Asoc. Cibao)", cardnet: "Cardnet (Visa/MC)", epagos_rd: "E-Pagos RD",
  popular_en_linea: "Popular en Línea", payretailers: "PayRetailers",
};

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1: Facturas
// ══════════════════════════════════════════════════════════════════════════════

function InvoicesTab({ onViewTenantInvoices }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTenant, setFilterTenant] = useState("");
  const [tenants, setTenants] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // New invoice form state
  const [form, setForm] = useState({
    tenant_id: "", plan: "starter", billing_cycle: "monthly", amount_usd: "",
    currency: "USD", payment_method: "", payment_gateway: "", gateway_ref: "",
    notes: "", due_date: "", status: "pending",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterTenant) params.set("tenant_id", filterTenant);
    const data = await apiFetch(`/api/admin/invoices?${params}`);
    setInvoices(data.invoices || []);
    setLoading(false);
  }, [filterStatus, filterTenant]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    apiFetch("/api/admin/tenants").then((d) => setTenants(d.tenants || []));
  }, []);

  const handleMarkPaid = async (inv) => {
    await apiFetch(`/api/admin/invoices/${inv.id}`, { method: "PUT", body: JSON.stringify({ status: "paid" }) });
    load();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    await apiFetch("/api/admin/invoices", { method: "POST", body: JSON.stringify(form) });
    setSaving(false);
    setShowModal(false);
    setForm({ tenant_id: "", plan: "starter", billing_cycle: "monthly", amount_usd: "", currency: "USD", payment_method: "", payment_gateway: "", gateway_ref: "", notes: "", due_date: "", status: "pending" });
    load();
  };

  // Stats
  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.amount_usd || 0), 0);
  const totalPending = invoices.filter((i) => i.status === "pending").reduce((s, i) => s + (i.amount_usd || 0), 0);
  const failedThisMonth = invoices.filter((i) => {
    if (i.status !== "failed") return false;
    const d = new Date(i.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const upcoming = invoices.filter((i) => {
    if (i.status !== "pending" || !i.due_date) return false;
    const d = new Date(i.due_date);
    const now = new Date();
    return d > now && (d - now) < 7 * 86400000;
  }).length;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total recaudado", value: fmtUSD(totalPaid), color: "text-green-600" },
          { label: "Pendientes de cobro", value: fmtUSD(totalPending), color: "text-yellow-600" },
          { label: "Fallidos este mes", value: failedThisMonth, color: "text-red-600" },
          { label: "Próx. vencimientos (7d)", value: upcoming, color: "text-blue-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 font-medium">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar + actions */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white"
        >
          <option value="">Todos los estados</option>
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>{INVOICE_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select
          value={filterTenant}
          onChange={(e) => setFilterTenant(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white min-w-[200px]"
        >
          <option value="">Todos los tenants</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.email}</option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          <span className="text-lg leading-none">+</span> Nueva factura manual
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Tenant", "Plan", "Ciclo", "Monto", "Método", "Pasarela", "Estado", "Vencimiento", "Acciones"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Cargando…</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No hay facturas</td></tr>
              ) : invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700 font-medium max-w-[160px] truncate">{fmt(inv.tenant_email)}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{fmt(inv.plan)}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{fmt(inv.billing_cycle)}</td>
                  <td className="px-4 py-3 text-slate-800 font-semibold">{fmtUSD(inv.amount_usd)}</td>
                  <td className="px-4 py-3 text-slate-600">{fmt(inv.payment_method)}</td>
                  <td className="px-4 py-3 text-slate-600">{fmt(inv.payment_gateway)}</td>
                  <td className="px-4 py-3">
                    <Badge
                      label={INVOICE_STATUS_LABELS[inv.status] || inv.status}
                      colorClass={INVOICE_STATUS_BADGE[inv.status] || "bg-gray-100 text-gray-700"}
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(inv.due_date)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {inv.status === "pending" && (
                        <button
                          onClick={() => handleMarkPaid(inv)}
                          className="text-xs bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded-lg font-semibold transition-colors"
                        >
                          Marcar pagado
                        </button>
                      )}
                      <button
                        onClick={() => onViewTenantInvoices && onViewTenantInvoices(inv.tenant_id)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Ver tenant
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Invoice Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nueva factura manual">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tenant *</label>
            <select
              required
              value={form.tenant_id}
              onChange={(e) => setForm((f) => ({ ...f, tenant_id: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Seleccionar tenant…</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.email}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Plan *</label>
              <select
                required
                value={form.plan}
                onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                {PLANS.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Ciclo de facturación</label>
              <select
                value={form.billing_cycle}
                onChange={(e) => setForm((f) => ({ ...f, billing_cycle: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                {BILLING_CYCLES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Monto (USD) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.amount_usd}
                onChange={(e) => setForm((f) => ({ ...f, amount_usd: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                placeholder="29.00"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Estado</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{INVOICE_STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Método de pago</label>
              <select
                value={form.payment_method}
                onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Pasarela</label>
              <input
                type="text"
                value={form.payment_gateway}
                onChange={(e) => setForm((f) => ({ ...f, payment_gateway: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                placeholder="Stripe, Azul, Cardnet…"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Referencia de pago</label>
            <input
              type="text"
              value={form.gateway_ref}
              onChange={(e) => setForm((f) => ({ ...f, gateway_ref: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Transaction ID, # recibo…"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha de vencimiento</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Notas</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
              placeholder="Observaciones adicionales…"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">
              {saving ? "Guardando…" : "Crear factura"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2: Suscripciones
// ══════════════════════════════════════════════════════════════════════════════

function SubscriptionsTab({ onFilterInvoicesByTenant }) {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [suspendModal, setSuspendModal] = useState(null); // { tenant }
  const [reactivateModal, setReactivateModal] = useState(null); // { tenant }
  const [suspendReason, setSuspendReason] = useState("");
  const [reactivatePlan, setReactivatePlan] = useState("starter");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await apiFetch("/api/admin/tenants");
    setSubs(data.tenants || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const failedCount = subs.filter((s) => (s.failed_attempts || 0) >= 2).length;

  const handleSuspend = async () => {
    setSaving(true);
    await apiFetch(`/api/admin/tenants/${suspendModal.id}/billing-suspend`, {
      method: "POST",
      body: JSON.stringify({ reason: suspendReason }),
    });
    setSaving(false);
    setSuspendModal(null);
    setSuspendReason("");
    load();
  };

  const handleReactivate = async () => {
    setSaving(true);
    await apiFetch(`/api/admin/tenants/${reactivateModal.id}/billing-reactivate`, {
      method: "POST",
      body: JSON.stringify({ plan: reactivatePlan }),
    });
    setSaving(false);
    setReactivateModal(null);
    load();
  };

  return (
    <div className="space-y-4">
      {failedCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2 text-red-700 text-sm font-medium">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          {failedCount} {failedCount === 1 ? "cuenta" : "cuentas"} con pagos fallidos — revisar
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Tenant", "Plan", "Estado de pago", "Intentos fallidos", "Último pago", "Próximo cobro", "Acciones"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Cargando…</td></tr>
              ) : subs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No hay tenants</td></tr>
              ) : subs.map((t) => {
                const ps = t.payment_status || "active";
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700 font-medium max-w-[180px] truncate">{t.email}</td>
                    <td className="px-4 py-3 text-slate-600 capitalize">{t.plan || "free"}</td>
                    <td className="px-4 py-3">
                      <Badge
                        label={PAYMENT_STATUS_LABELS[ps] || ps}
                        colorClass={PAYMENT_STATUS_BADGE[ps] || "bg-gray-100 text-gray-700"}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold ${(t.failed_attempts || 0) >= 2 ? "text-red-600" : "text-slate-600"}`}>
                        {t.failed_attempts || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(t.last_payment_at)}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(t.next_billing_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {ps !== "suspended" && (
                          <button
                            onClick={() => setSuspendModal(t)}
                            className="text-xs bg-red-50 hover:bg-red-100 text-red-700 px-2.5 py-1 rounded-lg font-semibold transition-colors border border-red-200"
                          >
                            Suspender
                          </button>
                        )}
                        {ps === "suspended" && (
                          <button
                            onClick={() => { setReactivateModal(t); setReactivatePlan("starter"); }}
                            className="text-xs bg-green-50 hover:bg-green-100 text-green-700 px-2.5 py-1 rounded-lg font-semibold transition-colors border border-green-200"
                          >
                            Reactivar
                          </button>
                        )}
                        <button
                          onClick={() => onFilterInvoicesByTenant && onFilterInvoicesByTenant(t.id)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Ver facturas
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Suspend Modal */}
      <Modal open={!!suspendModal} onClose={() => setSuspendModal(null)} title="Suspender cuenta">
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            Se suspenderá la cuenta de <strong>{suspendModal?.email}</strong> y se degradará al plan <strong>Free</strong>.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Motivo (opcional)</label>
            <textarea
              rows={3}
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
              placeholder="Falta de pago, fraude, etc."
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setSuspendModal(null)} className="px-4 py-2 text-sm text-slate-600">Cancelar</button>
            <button
              onClick={handleSuspend}
              disabled={saving}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
            >
              {saving ? "Procesando…" : "Suspender cuenta"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reactivate Modal */}
      <Modal open={!!reactivateModal} onClose={() => setReactivateModal(null)} title="Reactivar cuenta">
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            Selecciona el plan al que se reactivará <strong>{reactivateModal?.email}</strong>.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Plan de reactivación</label>
            <select
              value={reactivatePlan}
              onChange={(e) => setReactivatePlan(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              {PLANS.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setReactivateModal(null)} className="px-4 py-2 text-sm text-slate-600">Cancelar</button>
            <button
              onClick={handleReactivate}
              disabled={saving}
              className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60"
            >
              {saving ? "Procesando…" : "Reactivar cuenta"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3: Pasarelas de Pago
// ══════════════════════════════════════════════════════════════════════════════

function GatewayConfigFields({ provider, config, onChange }) {
  const field = (key, label, placeholder = "", type = "text") => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <input
        type={type}
        value={config[key] || ""}
        onChange={(e) => onChange({ ...config, [key]: e.target.value })}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
        placeholder={placeholder}
      />
    </div>
  );

  if (provider === "stripe") return <>{field("api_key", "API Key", "sk_live_…")}{field("webhook_secret", "Webhook Secret", "whsec_…")}</>;
  if (provider === "paypal") return <>{field("client_id", "Client ID")}{field("client_secret", "Client Secret")}</>;
  if (provider === "azul") return <>{field("merchant_id", "MerchantId")}{field("merchant_name", "MerchantName")}{field("merchant_type", "MerchantType")}{field("auth_hash", "AuthHash")}</>;
  if (provider === "cardnet") return <>{field("terminal_id", "TerminalID")}{field("merchant_id", "MerchantID")}{field("key", "Key")}</>;
  if (provider === "mercadopago") return <>{field("access_token", "Access Token")}</>;
  return <p className="text-xs text-slate-400 italic">No se requiere configuración adicional para este proveedor.</p>;
}

function GatewaysTab() {
  const [gateways, setGateways] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", provider: "stripe", is_default: false, config_json: {} });

  const load = useCallback(async () => {
    setLoading(true);
    const data = await apiFetch("/api/admin/payment-gateways");
    setGateways(data.gateways || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (gw) => {
    await apiFetch(`/api/admin/payment-gateways/${gw.id}`, {
      method: "PUT",
      body: JSON.stringify({ is_active: gw.is_active ? 0 : 1 }),
    });
    load();
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    await apiFetch("/api/admin/payment-gateways", {
      method: "POST",
      body: JSON.stringify({ ...form, is_default: form.is_default ? 1 : 0 }),
    });
    setSaving(false);
    setShowModal(false);
    setForm({ name: "", provider: "stripe", is_default: false, config_json: {} });
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          <span className="text-lg leading-none">+</span> Agregar pasarela
        </button>
      </div>

      {loading ? (
        <p className="text-center text-slate-400 py-10">Cargando…</p>
      ) : gateways.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-12 text-center text-slate-400">
          <p>No hay pasarelas configuradas.</p>
          <p className="text-sm mt-1">Agrega una pasarela para registrar métodos de pago.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {gateways.map((gw) => (
            <div key={gw.id} className={`bg-white rounded-xl border p-4 space-y-3 ${gw.is_active ? "border-slate-200" : "border-slate-100 opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{gw.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{PROVIDER_LABELS[gw.provider] || gw.provider}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {gw.is_default === 1 && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">DEFAULT</span>
                  )}
                  <button
                    onClick={() => handleToggle(gw)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${gw.is_active ? "bg-green-500" : "bg-slate-300"}`}
                    title={gw.is_active ? "Desactivar" : "Activar"}
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${gw.is_active ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">Creada {fmtDate(gw.created_at)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Info panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-2">
        <p className="font-semibold flex items-center gap-1.5">
          <span>ℹ️</span> Integración de cobros automáticos
        </p>
        <p className="text-blue-700 leading-relaxed">
          Las pasarelas configuradas aquí son para registro y referencia. Para cobros automáticos
          recurrentes, conecta tu cuenta de Stripe o MercadoPago y configura los webhooks de pago.
          Las pasarelas locales (Azul, Cardnet) requieren integración directa con la API del banco.
        </p>
        <p className="font-semibold mt-2">Pasarelas recomendadas para República Dominicana:</p>
        <ul className="space-y-1 text-blue-700">
          <li><strong>Azul</strong> — Acepta tarjetas Visa/MasterCard locales e internacionales. Requiere cuenta comercial con Asociación Cibao/Banco BHD.</li>
          <li><strong>Cardnet</strong> — Red dominicana de pagos electrónicos. Acepta tarjetas locales y puntos.</li>
          <li><strong>Stripe</strong> — Para clientes internacionales con tarjetas Visa/MasterCard/AmEx.</li>
          <li><strong>MercadoPago</strong> — Disponible en RD, acepta tarjetas y pagos locales.</li>
        </ul>
      </div>

      {/* Add Gateway Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Agregar pasarela de pago">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre descriptivo *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder='Ej. "Stripe producción"'
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Proveedor *</label>
            <select
              required
              value={form.provider}
              onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value, config_json: {} }))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              {PROVIDERS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((p) => <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-slate-700">Pasarela predeterminada</span>
            </label>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-600">Configuración</p>
            <GatewayConfigFields
              provider={form.provider}
              config={form.config_json}
              onChange={(cfg) => setForm((f) => ({ ...f, config_json: cfg }))}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-600">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60">
              {saving ? "Guardando…" : "Agregar pasarela"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Page
// ══════════════════════════════════════════════════════════════════════════════

const TABS = [
  { id: "invoices", label: "Facturas" },
  { id: "subscriptions", label: "Suscripciones" },
  { id: "gateways", label: "Pasarelas de Pago" },
];

export default function AdminBillingPage() {
  const [activeTab, setActiveTab] = useState("invoices");
  const [tenantFilter, setTenantFilter] = useState("");

  const handleViewTenantInvoices = (tenantId) => {
    setActiveTab("invoices");
    setTenantFilter(tenantId);
  };

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Facturación</h1>
        <p className="text-sm text-slate-500 mt-1">Gestiona facturas, suscripciones y pasarelas de pago</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "invoices" && (
        <InvoicesTab
          initialTenantFilter={tenantFilter}
          onViewTenantInvoices={handleViewTenantInvoices}
        />
      )}
      {activeTab === "subscriptions" && (
        <SubscriptionsTab onFilterInvoicesByTenant={handleViewTenantInvoices} />
      )}
      {activeTab === "gateways" && <GatewaysTab />}
    </div>
  );
}
