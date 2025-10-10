## HayAI-Et — Kurulum ve Çalıştırma Rehberi (Windows / PowerShell)

Bu proje iki parçadan oluşur:

- Backend: FastAPI (Python)
- Frontend: React (Create React App)

Aşağıdaki adımlar repoyu yeni çeken birinin hızlıca ayağa kaldırabilmesi için hazırlanmıştır.

### Gereksinimler

- Python 3.11+
- Node.js 16–18 LTS (önerilen) ve npm
- Windows PowerShell

### Hızlı Başlangıç

1. Sanal ortam oluştur ve etkinleştir

```powershell
python -m venv .venv
.venv\Scripts\activate
```

2. Backend bağımlılıklarını yükle

```powershell
pip install -r requirements.txt
```

3. Frontend bağımlılıklarını yükle

```powershell
cd frontend
npm install
cd ..
```

4. Uygulamaları başlat

```powershell
# PowerShell kök dizinde
.venv\Scripts\activate
python .\start_backend.py   # Backend: http://localhost:8000
python .\start_frontend.py  # Frontend: http://localhost:3000
```

Not: `start_frontend.py` çalışmadan önce `frontend/node_modules` mevcut değilse önce `npm install` yapın.

### Alternatif Çalıştırma

- Backend (doğrudan):

```powershell
.venv\Scripts\activate
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- Frontend (doğrudan):

```powershell
cd frontend
npm start
```

### Faydalı Adresler

- Frontend: `http://localhost:3000`
- Backend Root: `http://localhost:8000/`
- Health Check: `http://localhost:8000/health`
- OpenAPI Docs: `http://localhost:8000/docs`

### Backend Hakkında

- Uygulama `backend/main.py` içinde başlar.
- CORS şu an tüm origin'lere açık (geliştirme için). Üretimde belirli origin tanımlayın.
- Yükleme klasörü `backend/uploads` altında otomatik oluşturulur.

#### Örnek API

- GET `/` → Basit karşılama ve sürüm bilgisi
- GET `/health` → Servis durumu
- POST `/upload/` → Resim yükleme (max 10MB, yalnızca `image/*` MIME)

Örnek `curl` (PowerShell):

```powershell
curl -Method Post -Uri http://localhost:8000/upload/ -InFile .\path\to\image.jpg -ContentType 'image/jpeg'
```

Başarılı yanıtta dosya `backend/uploads` altına benzersiz isimle kaydedilir.

### Sorun Giderme

- Bağımlılıklar: Her Python/pip komutundan önce sanal ortamı etkinleştirin:

```powershell
.venv\Scripts\activate
```

- Node sürümü: `react-scripts` için Node 16–18 LTS önerilir. Sürüm uyuşmazlığında uygun LTS sürümünü kullanın.
- Port çakışması: 3000 (frontend) veya 8000 (backend) doluysa boş bir porta yönlendirin (`--port` ile) veya kullanan süreci sonlandırın.

### Geliştirici Notları

- Python bağımlılıkları: `requirements.txt`
- Proje meta: `pyproject.toml` (Python 3.11+ gerektirir)
- NPM script'leri: `frontend/package.json`
