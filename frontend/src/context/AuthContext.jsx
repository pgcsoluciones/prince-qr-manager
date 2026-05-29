import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../utils/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem("qr_token");
    if (!token) { setLoading(false); return; }
    try {
      const data = await api.get("/api/auth/me");
      setUser(data.user);
    } catch {
      localStorage.removeItem("qr_token");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (email, password) => {
    const data = await api.post("/api/auth/login", { email, password });
    localStorage.setItem("qr_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (email, password) => {
    const data = await api.post("/api/auth/register", { email, password, role: "tenant" });
    localStorage.setItem("qr_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("qr_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
