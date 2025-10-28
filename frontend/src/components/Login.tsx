import React, { useState } from "react";

interface LoginProps {
  onSuccess: (username: string) => void;
}

// Static credential store for the prototype login screen.
// Update or replace with a backend request when real authentication is ready.
const allowedUsers = [
  { username: "hayai", password: "artmagic" },
  { username: "guest", password: "draw2025" },
];

const Login: React.FC<LoginProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedUsername = username.trim();

    const matchingUser = allowedUsers.find(
      (user) =>
        user.username.toLowerCase() === trimmedUsername.toLowerCase() &&
        user.password === password
    );

    if (!matchingUser) {
      setError("Kullanıcı adı veya şifre hatalı. Lütfen tekrar deneyin.");
      return;
    }

    setError(null);
    onSuccess(matchingUser.username);
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

          <button type="submit" className="login-button">
            Stüdyoya Gir
          </button>
        </form>

        <div className="login-hint">
          <p>Giriş bilgilerini daha sonra değiştirebilirsiniz.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
