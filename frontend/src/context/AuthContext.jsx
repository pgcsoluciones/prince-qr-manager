import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem("qr_token");
    if (!token) { setUser(null); setLoading(false); return null; }
    try {
      const data = await api.get("/api/auth/me");
      setUser(data.user);
      return data.user;
    } catch {
      localStorage.removeItem("qr_token");
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (email, password) => {
    const data = await api.post("/api/auth/login", { email, password });
    localStorage.setItem("qr_token", data.token);
    // El login devuelve un usuario reducido. La fuente persistente de settings,
    // empresa/rubro y demás estado de onboarding es /api/auth/me.
    const hydrated = await loadUser();
    return hydrated || data.user;
  };

  const register = async (email, password) => {
    const data = await api.post("/api/auth/register", { email, password, role: "tenant" });
    localStorage.setItem("qr_token", data.token);
    const hydrated = await loadUser();
    return hydrated || data.user;
  };

  const logout = () => {
    localStorage.removeItem("qr_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
