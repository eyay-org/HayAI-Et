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

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<{
    original: string;
    improved: string;
    filename: string;
  } | null>(null);
  const [magnifiedImage, setMagnifiedImage] = useState<{
    src: string;
    alt: string;
  } | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        text: `✅ Başarılı! "${response.data.original_filename}" dosyası yüklendi ve dönüştürüldü.`,
      });

      // Set uploaded images for display
      setUploadedImages({
        original: `http://localhost:8000${response.data.original_url}`,
        improved: `http://localhost:8000${response.data.improved_url}`,
        filename: response.data.original_filename,
      });

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

  return (
    <div className="App">
      <div className="container">
        <header className="header">
          <h1>🎨 HayAI Art Platform</h1>
          <p>Çiziminizi yükleyin ve AI ile dönüştürün!</p>
        </header>

        <main className="main">
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
