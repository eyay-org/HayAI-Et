import React, { useState } from "react";
import axios from "axios";

// API URL - uses environment variable in production, localhost in development
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

interface RegisterProps {
  onSuccess: (username: string) => void;
  onBackToLogin: () => void;
}

const BEYANNAME_TEXT = `1. Yaş Doğrulaması ve Kullanım Sorumluluğu

1.1. Üye, uygulamaya kayıt olurken 18 yaşından büyük olduğunu, fiil ehliyetine sahip bulunduğunu ve bu sözleşmeyi kendi adına geçerli şekilde kabul edebildiğini beyan eder.

1.2. Üye, reşit olmayan bir kişinin (18 yaş altı) uygulamayı kullanmasına izin veriyorsa, bu kullanımın tamamından sorumlu olduğunu, çocuk veya veli olduğu kişilerin uygulamadaki tüm eylemlerinin hukuki sonuçlarının kendi sorumluluğunda olduğunu kabul eder.

1.3. Reşit olmayan kullanıcıların uygulamaya erişimi, yalnızca ebeveyn veya yasal vasi gözetiminde mümkündür.

2. Fotoğraf Yükleme, Saklama ve Görünürlük

2.1. Kullanıcı tarafından uygulamaya yüklenen fotoğraflar, hizmetin sunulması amacıyla sistemde güvenli bir şekilde saklanır.

2.2. Kullanıcı, yüklediği fotoğrafların, kendisi tarafından "herkese açık" olarak işaretlenmesi durumunda diğer kullanıcılar tarafından görüntülenebileceğini kabul eder.
"Gizli/özel" olarak işaretlenen içerikler hiçbir şekilde diğer kullanıcılara gösterilmez.

2.3. Fotoğraflar, kullanıcının rızası olmaksızın işlenmez, üçüncü kişilerle paylaşılmaz, kullanıcının aleyhine kullanılmaz; yalnızca hizmetin sağlanması ve iyileştirilmesi amacıyla saklanır.

3. İçerik Paylaşım Kuralları

3.1. Kullanıcı; yüklediği fotoğrafların aşağıdaki içerikleri kesinlikle içermeyeceğini kabul eder:

• Cinsel içerik veya müstehcenlik,
• Şiddet veya şiddet içerikli eylemler,
• Uyuşturucu, uyarıcı veya yasa dışı madde kullanımı,
• Kötü alışkanlıkları teşvik eden içerikler,
• Tehlikeli davranış içeren görüntüler,
• Başkalarına ait kişisel verileri, rızası olmaksızın içeren materyaller.

3.2. Kullanıcı, yüklediği tüm içeriklerin hukuki sorumluluğunun tamamen kendisine ait olduğunu, ilgili mevzuata aykırı içerik paylaşımı halinde doğacak tüm hukuki, idari ve cezai yaptırımlardan yalnızca kendisinin sorumlu olduğunu kabul eder.

3.3. Uygulama, kurallara aykırı içerikleri tespit etmesi halinde içeriği kaldırma, hesabı askıya alma veya üyeliği sonlandırma hakkına sahiptir.

4. Fotoğraf Paylaşım Sisteminin Kötüye Kullanılamaması

4.1. Fotoğraf yükleme ve paylaşım sistemi hiçbir surette kötü niyetle, tehdit, taciz, hak ihlali, manipülasyon veya yasa dışı bir amaçla kullanılamaz.

4.2. Kullanıcı, başkalarının kişilik haklarını, özel hayatını ve hukuki güvenliğini ihlal edici hiçbir eylemde bulunmayacağını kabul eder.

5. KVKK Kapsamında Aydınlatma

5.1. Üyelik sırasında işlenen kişisel veriler (ad, e-posta, yaş doğrulaması, yüklenen fotoğraflar, kullanım bilgileri vb.) KVKK m.5 ve m.6 kapsamında:

• Üyelik işlemlerinin yürütülmesi,
• Hizmetin sunulması,
• Güvenliğin sağlanması,
• Uygulama içi davranışların düzenlenmesi
amaçlarıyla işlenmektedir.

5.2. Kişisel veriler, yasal zorunluluklar haricinde üçüncü kişilerle paylaşılmaz.

5.3. Kullanıcı, KVKK'nın 11. maddesi kapsamında erişim, düzeltme, silme, itiraz etme gibi haklara sahiptir ve bu hakları uygulama üzerinden veya destek adresi aracılığıyla kullanabilir.

6. Açık Rıza Beyanı

Kullanıcı; uygulamaya yüklediği fotoğrafların yukarıda belirtilen amaçlarla işlenmesine, saklanmasına ve kendi isteğiyle "herkese açık" olarak işaretlemesi durumunda diğer kullanıcılar tarafından görüntülenmesine açıkça rıza gösterdiğini kabul eder.

7. Sözleşmenin Onaylanması

Üyelik işlemini tamamlayarak bu metinde yer alan tüm hükümleri okuduğunuzu, anladığınızı ve özgür iradenizle kabul ettiğinizi, yüklediğiniz içeriklerden doğacak tüm sorumlulukları üstlendiğinizi beyan etmiş olursunuz.`;

const Register: React.FC<RegisterProps> = ({ onSuccess, onBackToLogin }) => {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    displayName: "",
    bioPresetId: 1,
  });
  const [ageVerified, setAgeVerified] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showBeyanname, setShowBeyanname] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [predefinedBios, setPredefinedBios] = useState<{ id: number; text: string }[]>([]);

  React.useEffect(() => {
    // Load predefined bios
    const loadPredefinedBios = async () => {
      try {
        const response = await axios.get<{ bios: { id: number; text: string }[] }>(`${API_URL}/api/presets/bios`);
        setPredefinedBios(response.data.bios);
      } catch (error) {
        console.error('Error loading predefined bios:', error);
        // Fallback
        setPredefinedBios([
          { id: 1, text: "Resim yapmayı seviyorum! 🎨" },
          { id: 2, text: "Geleceğin Sanatçısı ✨" },
          { id: 3, text: "Uzay Kaşifi 🚀" },
          { id: 4, text: "Doğa Dostu 🌿" },
          { id: 5, text: "Dinozor Hayranı 🦖" }
        ]);
      }
    };
    loadPredefinedBios();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!ageVerified) {
      setError("Yaş doğrulamasını onaylamalısınız");
      return;
    }

    if (!termsAccepted) {
      setError("Kullanım koşullarını okumalı ve kabul etmelisiniz");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Şifreler eşleşmiyor");
      return;
    }

    if (formData.password.length < 8) {
      setError("Şifre en az 8 karakter olmalıdır");
      return;
    }

    if (!/[a-zA-Z]/.test(formData.password) || !/[0-9]/.test(formData.password)) {
      setError("Şifre hem harf hem de rakam içermelidir");
      return;
    }

    if (formData.username.length < 3 || formData.username.length > 20) {
      setError("Kullanıcı adı 3-20 karakter arasında olmalıdır");
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      setError("Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir");
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/api/auth/register`, {
        username: formData.username,
        email: formData.email,
        password: formData.password,
        display_name: formData.displayName || formData.username,
        bio_preset_id: formData.bioPresetId,
        age_verified: ageVerified,
        terms_accepted: termsAccepted,
      });

      if (response.data.success) {
        // Store user_id and token in localStorage
        localStorage.setItem("userId", response.data.user_id.toString());
        localStorage.setItem("userId", response.data.user_id.toString());
        localStorage.setItem("hayai-token", response.data.access_token);
        localStorage.setItem("hayai-refresh-token", response.data.refresh_token);
        onSuccess(response.data.username);
      }
    } catch (err: any) {
      console.error("Registration error:", err);
      setError(err.response?.data?.detail || "Kayıt sırasında bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="register-card">
        <h1>🎨 Kayıt Ol</h1>
        <p className="login-subtitle">HayAI Art Platform'una hoş geldiniz!</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-label" htmlFor="username">
            Kullanıcı Adı *
          </label>
          <input
            id="username"
            name="username"
            className="login-input"
            type="text"
            value={formData.username}
            onChange={handleInputChange}
            placeholder="kullanici_adi"
            required
            minLength={3}
            maxLength={20}
          />

          <label className="login-label" htmlFor="displayName">
            Görünen İsim
          </label>
          <input
            id="displayName"
            name="displayName"
            className="login-input"
            type="text"
            value={formData.displayName}
            onChange={handleInputChange}
            placeholder="İsminiz (opsiyonel)"
          />

          <label className="login-label" htmlFor="email">
            E-posta *
          </label>
          <input
            id="email"
            name="email"
            className="login-input"
            type="email"
            value={formData.email}
            onChange={handleInputChange}
            placeholder="email@example.com"
            required
          />

          <label className="login-label" htmlFor="password">
            Şifre *
          </label>
          <input
            id="password"
            name="password"
            className="login-input"
            type="password"
            value={formData.password}
            onChange={handleInputChange}
            placeholder="En az 8 karakter, harf ve rakam"
            required
            minLength={8}
          />

          <label className="login-label" htmlFor="confirmPassword">
            Şifre Tekrar *
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            className="login-input"
            type="password"
            value={formData.confirmPassword}
            onChange={handleInputChange}
            placeholder="Şifrenizi tekrar girin"
            required
          />

          <label className="login-label">
            Biyografi Seçin
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {predefinedBios.map((bio) => (
              <label key={bio.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="bioPresetId"
                  value={bio.id}
                  checked={formData.bioPresetId === bio.id}
                  onChange={(e) => setFormData(prev => ({ ...prev, bioPresetId: parseInt(e.target.value) }))}
                  style={{ cursor: 'pointer' }}
                />
                <span>{bio.text}</span>
              </label>
            ))}
          </div>

          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={ageVerified}
                onChange={(e) => setAgeVerified(e.target.checked)}
                className="checkbox-input"
              />
              <span>18 yaşından büyüğüm ve fiil ehliyetine sahibim</span>
            </label>
          </div>

          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="checkbox-input"
              />
              <span>
                <button
                  type="button"
                  className="terms-link"
                  onClick={() => setShowBeyanname(true)}
                >
                  Kullanım koşullarını
                </button>
                {" "}okudum, anladım ve kabul ediyorum
              </span>
            </label>
          </div>

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? "Kayıt Yapılıyor..." : "Kayıt Ol"}
          </button>
        </form>

        <div className="login-hint">
          <p>
            Zaten hesabınız var mı?{" "}
            <button className="back-to-login-button" onClick={onBackToLogin}>
              Giriş Yap
            </button>
          </p>
        </div>
      </div>

      {/* Beyanname Modal */}
      {showBeyanname && (
        <div className="modal-overlay" onClick={() => setShowBeyanname(false)}>
          <div className="beyanname-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowBeyanname(false)}>
              ✕
            </button>
            <h2>Kullanım Koşulları ve KVKK Aydınlatma Metni</h2>
            <div className="beyanname-text">
              {BEYANNAME_TEXT.split('\n').map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
            <div className="beyanname-actions">
              <button
                className="beyanname-accept-button"
                onClick={() => {
                  setTermsAccepted(true);
                  setShowBeyanname(false);
                }}
              >
                ✓ Okudum, Anladım ve Kabul Ediyorum
              </button>
              <button
                className="beyanname-close-button"
                onClick={() => setShowBeyanname(false)}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Register;
