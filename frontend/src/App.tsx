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
  originalFilename: string; // Store the backend filename for deletion
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
        const parsedGallery = JSON.parse(savedGallery);
        // Migrate old gallery items that don't have originalFilename
        const migratedGallery = parsedGallery.map((item: any) => ({
          ...item,
          originalFilename: item.originalFilename || null, // Add null for old items
        }));
        setGallery(migratedGallery);
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
        originalFilename: response.data.filename, // Store backend filename for deletion
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

  const removeFromGallery = async (id: string) => {
    const item = gallery.find(item => item.id === id);
    if (!item) return;

    try {
      // Only call backend if we have the originalFilename
      if (item.originalFilename) {
        await axios.delete(`http://localhost:8000/delete/${item.originalFilename}`);
      }
      
      // Remove from gallery (always remove from frontend)
      setGallery(prev => prev.filter(item => item.id !== id));
      
      setMessage({
        type: "success",
        text: `✅ "${item.filename}" galeriden silindi.${item.originalFilename ? ' Sunucudan da silindi.' : ''}`,
      });
    } catch (error: any) {
      console.error('Delete error:', error);
      // Still remove from gallery even if backend deletion fails
      setGallery(prev => prev.filter(item => item.id !== id));
      setMessage({
        type: "error",
        text: `❌ Sunucudan silinemedi, ancak galeriden kaldırıldı: ${error.response?.data?.detail || error.message}`,
      });
    }
  };

  const clearGallery = async () => {
    if (gallery.length === 0) return;

    try {
      // Delete files from backend (only for items that have originalFilename)
      const itemsWithFilename = gallery.filter(item => item.originalFilename);
      const deletePromises = itemsWithFilename.map(item => 
        axios.delete(`http://localhost:8000/delete/${item.originalFilename}`)
      );
      
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }
      
      // Clear gallery (always clear frontend)
      setGallery([]);
      
      const deletedCount = itemsWithFilename.length;
      const totalCount = gallery.length;
      
      setMessage({
        type: "success",
        text: `✅ Tüm çizimler galeriden silindi.${deletedCount > 0 ? ` ${deletedCount}/${totalCount} sunucudan da silindi.` : ''}`,
      });
    } catch (error: any) {
      console.error('Clear gallery error:', error);
      // Still clear gallery even if some backend deletions fail
      setGallery([]);
      setMessage({
        type: "error",
        text: `❌ Bazı dosyalar sunucudan silinemedi, ancak galeri temizlendi: ${error.response?.data?.detail || error.message}`,
      });
    }
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
                <div className="photo-gallery">
                  {gallery.map((item) => (
                    <div key={item.id} className="photo-item">
                      <div className="photo-comparison">
                        <div className="photo-original" onClick={() => openMagnifiedView(item.original, `Orijinal: ${item.filename}`)}>
                          <img src={item.original} alt="Orijinal" className="photo-image" />
                          <div className="photo-overlay">
                            <span className="photo-label">Orijinal</span>
                            <span className="magnify-icon">🔍</span>
                          </div>
                        </div>
                        <div className="photo-improved" onClick={() => openMagnifiedView(item.improved, `AI Geliştirilmiş: ${item.filename}`)}>
                          <img src={item.improved} alt="AI Geliştirilmiş" className="photo-image" />
                          <div className="photo-overlay">
                            <span className="photo-label">AI Geliştirilmiş</span>
                            <span className="magnify-icon">🔍</span>
                          </div>
                        </div>
                      </div>
                      <div className="photo-actions">
                        <button 
                          className="remove-photo-button"
                          onClick={() => removeFromGallery(item.id)}
                          title="Galeriden kaldır"
                        >
                          🗑️
                        </button>
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
