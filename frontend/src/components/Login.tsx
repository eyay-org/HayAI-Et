import React, { useState } from "react";
import axios from "axios";

// API URL - uses environment variable in production, localhost in development
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

interface LoginProps {
  onSuccess: (username: string) => void;
  onRegisterClick: () => void;
}

const Login: React.FC<LoginProps> = ({ onSuccess, onRegisterClick }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/login`, {
        username: username.trim(),
        password: password,
      });

      if (response.data.success) {
        // Store user_id in localStorage for upload operations
        localStorage.setItem("userId", response.data.user_id.toString());
        onSuccess(response.data.username);
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.response?.data?.detail || "Giriş yapılırken bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card" role="dialog" aria-labelledby="login-heading">
        <h1 id="login-heading">🎨 HayAI Sanat Platformu</h1>
        <p className="login-subtitle">Çizimlerinizi yapay zeka ile dönüştürmek için giriş yapın.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-label" htmlFor="username">
            Kullanıcı Adı
          </label>
          <input
            id="username"
            className="login-input"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Kullanıcı adınızı girin"
            autoComplete="username"
            required
          />

          <label className="login-label" htmlFor="password">
            Şifre
          </label>
          <input
            id="password"
            className="login-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Şifrenizi girin"
            autoComplete="current-password"
            required
          />

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? "Giriş Yapılıyor..." : "Stüdyoya Gir"}
          </button>
        </form>

        <div className="login-divider">
          <span>veya</span>
        </div>

        <button className="register-button" onClick={onRegisterClick}>
          🎨 Yeni Hesap Oluştur
        </button>

        <div className="login-hint">
          <p>Demo için: hayai / hayai123 veya guest / guest123</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
