import React, { useState, useRef } from "react";
import axios from "axios";
import "./App.css";

interface UploadResponse {
  message: string;
  filename: string;
  improved_filename: string;
  original_filename: string;
  original_url: string;
  improved_url: string;
}

interface GalleryItem {
  id: string;
  original: string;
  improved: string;
  filename: string;
  timestamp: number;
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<{
    original: string;
    improved: string;
    filename: string;
  } | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [magnifiedImage, setMagnifiedImage] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [currentView, setCurrentView] = useState<'upload' | 'gallery'>('upload');

  // Load gallery from localStorage on component mount
  React.useEffect(() => {
    const savedGallery = localStorage.getItem('hayai-gallery');
    if (savedGallery) {
      try {
        setGallery(JSON.parse(savedGallery));
      } catch (error) {
        console.error('Error loading gallery from localStorage:', error);
      }
    }
  }, []);

  // Save gallery to localStorage whenever it changes
  React.useEffect(() => {
    localStorage.setItem('hayai-gallery', JSON.stringify(gallery));
  }, [gallery]);

  const handleFileSelect = (file: File) => {
    if (file && file.type.startsWith("image/")) {
      setSelectedFile(file);

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);

      setMessage(null);
    } else {
      setMessage({ type: "error", text: "Lütfen bir resim dosyası seçin!" });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage({ type: "error", text: "Lütfen önce bir dosya seçin!" });
      return;
    }

    setUploading(true);
    setMessage({ type: "info", text: "Resminiz yükleniyor..." });

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await axios.post<UploadResponse>(
        "http://localhost:8000/upload/",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setMessage({
        type: "success",
        text: `✅ Başarılı! "${response.data.original_filename}" dosyası yüklendi, dönüştürüldü ve galeriye eklendi!`,
      });

      // Set uploaded images for display
      const newImages = {
        original: `http://localhost:8000${response.data.original_url}`,
        improved: `http://localhost:8000${response.data.improved_url}`,
        filename: response.data.original_filename,
      };
      setUploadedImages(newImages);

      // Add to gallery
      const newGalleryItem: GalleryItem = {
        id: Date.now().toString(),
        original: newImages.original,
        improved: newImages.improved,
        filename: newImages.filename,
        timestamp: Date.now(),
      };
      setGallery(prev => [newGalleryItem, ...prev]);

      // Reset form
      setSelectedFile(null);
      setPreview("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error: any) {
      setMessage({
        type: "error",
        text: `❌ Hata: ${error.response?.data?.detail || error.message}`,
      });
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setPreview("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setMessage(null);
  };

  const clearResults = () => {
    setUploadedImages(null);
    setMessage(null);
  };

  const openMagnifiedView = (src: string, alt: string) => {
    setMagnifiedImage({ src, alt });
  };

  const closeMagnifiedView = () => {
    setMagnifiedImage(null);
  };

  const removeFromGallery = (id: string) => {
    setGallery(prev => prev.filter(item => item.id !== id));
  };

  const clearGallery = () => {
    setGallery([]);
  };

  return (
    <div className="App">
      <div className="container">
        <header className="header">
          <h1>🎨 HayAI Art Platform</h1>
          <p>Çiziminizi yükleyin ve AI ile dönüştürün!</p>
          <nav className="navigation">
            <button 
              className={`nav-button ${currentView === 'upload' ? 'active' : ''}`}
              onClick={() => setCurrentView('upload')}
            >
              📤 Yükle
            </button>
            <button 
              className={`nav-button ${currentView === 'gallery' ? 'active' : ''}`}
              onClick={() => setCurrentView('gallery')}
            >
              🖼️ Galeri ({gallery.length})
            </button>
          </nav>
        </header>

        <main className="main">
          {currentView === 'upload' ? (
            <div className="content-wrapper">
              <div className="upload-section">
                <div
                  className="upload-area"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{ display: "none" }}
                  />

                  {!preview ? (
                    <div className="upload-content">
                      <div className="upload-icon">📁</div>
                      <h3>Çiziminizi Seçin</h3>
                      <p>Tıklayın veya sürükleyip bırakın</p>
                      <button className="select-button">Dosya Seç</button>
                    </div>
                  ) : (
                    <div className="preview-content">
                      <img src={preview} alt="Preview" className="preview-image" />
                      <div className="file-info">
                        <p>
                          <strong>Dosya:</strong> {selectedFile?.name}
                        </p>
                        <p>
                          <strong>Boyut:</strong>{" "}
                          {(selectedFile?.size! / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <button className="clear-button" onClick={clearFile}>
                        ✕ Temizle
                      </button>
                    </div>
                  )}
                </div>

                {message && (
                  <div className={`message ${message.type}`}>{message.text}</div>
                )}

                <button
                  className="upload-button"
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                >
                  {uploading ? "⏳ Yükleniyor..." : "🚀 Yükle ve Dönüştür"}
                </button>
              </div>

              {/* Results Section */}
              {uploadedImages && (
                <div className="results-section">
                  <h2>🎨 Sonuçlar</h2>
                  <div className="image-comparison">
                    <div className="image-container">
                      <h3>Orijinal Çizim</h3>
                      <div className="image-wrapper" onClick={() => openMagnifiedView(uploadedImages.original, "Orijinal çizim")}>
                        <img
                          src={uploadedImages.original}
                          alt="Orijinal çizim"
                          className="result-image"
                        />
                        <div className="magnify-overlay">
                          <span className="magnify-icon">🔍</span>
                        </div>
                      </div>
                    </div>
                    <div className="vs-divider">
                      <span>VS</span>
                    </div>
                    <div className="image-container">
                      <h3>AI ile Geliştirilmiş</h3>
                      <div className="image-wrapper" onClick={() => openMagnifiedView(uploadedImages.improved, "AI ile Geliştirilmiş çizim")}>
                        <img
                          src={uploadedImages.improved}
                          alt="Geliştirilmiş çizim"
                          className="result-image"
                        />
                        <div className="magnify-overlay">
                          <span className="magnify-icon">🔍</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button className="clear-results-button" onClick={clearResults}>
                    ✕ Sonuçları Temizle
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="gallery-section">
              <div className="gallery-header">
                <h2>🖼️ Sanat Galerim</h2>
                <p>AI ile geliştirilmiş çizimlerinizin koleksiyonu</p>
                {gallery.length > 0 && (
                  <button className="clear-gallery-button" onClick={clearGallery}>
                    🗑️ Galeriyi Temizle
                  </button>
                )}
              </div>
              
              {gallery.length === 0 ? (
                <div className="empty-gallery">
                  <div className="empty-icon">🎨</div>
                  <h3>Henüz çizim yok!</h3>
                  <p>İlk çiziminizi yükleyip AI ile geliştirin</p>
                  <button className="upload-first-button" onClick={() => setCurrentView('upload')}>
                    📤 İlk Çizimi Yükle
                  </button>
                </div>
              ) : (
                <div className="gallery-grid">
                  {gallery.map((item) => (
                    <div key={item.id} className="gallery-item">
                      <div className="gallery-item-header">
                        <h4>{item.filename}</h4>
                        <button 
                          className="remove-item-button"
                          onClick={() => removeFromGallery(item.id)}
                          title="Galeriden kaldır"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="gallery-comparison">
                        <div className="gallery-original">
                          <span className="gallery-label">Orijinal</span>
                          <div className="gallery-image-wrapper" onClick={() => openMagnifiedView(item.original, `Orijinal: ${item.filename}`)}>
                            <img src={item.original} alt="Orijinal" className="gallery-image" />
                            <div className="magnify-overlay">
                              <span className="magnify-icon">🔍</span>
                            </div>
                          </div>
                        </div>
                        <div className="gallery-improved">
                          <span className="gallery-label">AI Geliştirilmiş</span>
                          <div className="gallery-image-wrapper" onClick={() => openMagnifiedView(item.improved, `AI Geliştirilmiş: ${item.filename}`)}>
                            <img src={item.improved} alt="AI Geliştirilmiş" className="gallery-image" />
                            <div className="magnify-overlay">
                              <span className="magnify-icon">🔍</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="gallery-timestamp">
                        {new Date(item.timestamp).toLocaleDateString('tr-TR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Magnified Image Modal */}
        {magnifiedImage && (
          <div className="modal-overlay" onClick={closeMagnifiedView}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={closeMagnifiedView}>
                ✕
              </button>
              <img
                src={magnifiedImage.src}
                alt={magnifiedImage.alt}
                className="magnified-image"
              />
              <p className="modal-caption">{magnifiedImage.alt}</p>
            </div>
          </div>
        )}

        <footer className="footer">
          <p>HayAI Art Platform - Çocuklar için AI destekli sanat platformu</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
