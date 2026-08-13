import { useEffect, useState } from "react";
import TraceTeamFocused from "./TraceTeamFocused.jsx";

const BASE =
  import.meta.env.VITE_API_URL ||
  "https://api.code.intaprd.com";

function headers() {
  const token = localStorage.getItem("qr_token") || "";

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function TraceTeamDirectory() {
  const [data, setData] = useState({
    people: [],
    departments: [],
    projects: [],
  });

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
          people: [],
          departments: [],
          projects: [],
        }
      );
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function post(path, body) {
    setError("");

    try {
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
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  return (
    <div>
      {error && (
        <div className="mx-auto mb-4 max-w-[1500px] rounded-xl bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      <TraceTeamFocused
        people={data.people || []}
        departments={data.departments || []}
        projects={data.projects || []}
        onAddDepartment={(body) =>
          post(
            "/api/trace/v1/admin/workspace/departments",
            body
          )
        }
        onInvite={(body) =>
          post("/api/team/invite", body)
        }
        onAssign={(projectId, body) =>
          post(
            `/api/trace/v1/admin/workspace/projects/${encodeURIComponent(projectId)}/participants`,
            body
          )
        }
      />
    </div>
  );
}
