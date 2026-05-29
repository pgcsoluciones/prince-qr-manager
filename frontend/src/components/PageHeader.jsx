/**
 * PageHeader — consistent header for every dashboard page.
 * Props:
 *   title: string (required)
 *   description: string (optional)
 *   badge: { label, color } (optional) — e.g. { label: "Pro", color: "bg-purple-100 text-purple-700" }
 *   actions: JSX (optional) — buttons / controls to render on the right
 */
export default function PageHeader({ title, description, badge, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {badge && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${badge.color}`}>
              {badge.label}
            </span>
          )}
          <h1 className="section-title">{title}</h1>
        </div>
        {description && (
          <p className="section-sub mt-0.5">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
