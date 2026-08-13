import { useEffect, useState } from "react";
import TraceProjectsCanvas from "./TraceProjectsCanvas.jsx";
import TraceProjectDetail from "./TraceProjectDetail.jsx";

const BASE =
  import.meta.env.VITE_API_URL ||
  "https://api.code.intaprd.com";

function headers(extra = {}) {
  const token = localStorage.getItem("qr_token") || "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export default function TraceDashboardHome({ onOpenOperation }) {
  const [data, setData] = useState({
    projects: [],
    people: [],
    departments: [],
  });

  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await fetch(
        `${BASE}/api/trace/v1/admin/workspace`,
        { headers: headers() }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.message || json.error);
      }

      setData(
        json.data || {
          projects: [],
          people: [],
          departments: [],
        }
      );
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function openProject(id) {
    try {
      setError("");

      const response = await fetch(
        `${BASE}/api/trace/v1/admin/workspace/projects/${encodeURIComponent(id)}`,
        { headers: headers() }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.message || json.error);
      }

      setDetail(json.data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function post(path, body) {
    const response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });

    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.message || json.error);
    }

    await load();
    return json;
  }

  async function createProject(body) {
    try {
      setError("");

      const result = await post(
        "/api/trace/v1/admin/workspace/projects",
        body
      );

      await openProject(result.data.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function assignProject(projectId, body) {
    try {
      setError("");

      await post(
        `/api/trace/v1/admin/workspace/projects/${encodeURIComponent(projectId)}/participants`,
        body
      );

      await openProject(projectId);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      {error && (
        <div className="mx-auto mb-4 max-w-[1480px] rounded-xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {detail ? (
        <TraceProjectDetail
          data={detail}
          people={data.people || []}
          departments={data.departments || []}
          onBack={() => setDetail(null)}
          onOpenOperation={onOpenOperation}
          onAssign={assignProject}
        />
      ) : (
        <TraceProjectsCanvas
          projects={data.projects || []}
          onCreate={createProject}
          onOpen={openProject}
        />
      )}
    </div>
  );
}
