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
  title?: string; // Custom title for the image
  emoji?: string; // Custom emoji for the image
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
  const [magnifiedImages, setMagnifiedImages] = useState<{
    original: string;
    improved: string;
    filename: string;
    title?: string;
    emoji?: string;
  } | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [currentView, setCurrentView] = useState<'upload' | 'gallery'>('upload');
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editEmoji, setEditEmoji] = useState<string>('');

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

  const openMagnifiedView = (original: string, improved: string, filename: string, title?: string, emoji?: string) => {
    setMagnifiedImages({ original, improved, filename, title, emoji });
  };

  const closeMagnifiedView = () => {
    setMagnifiedImages(null);
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

  const openEditModal = (item: GalleryItem) => {
    setEditingItem(item);
    setEditTitle(item.title || '');
    setEditEmoji(item.emoji || '🎨');
  };

  const closeEditModal = () => {
    setEditingItem(null);
    setEditTitle('');
    setEditEmoji('');
  };

  const saveEdit = () => {
    if (!editingItem) return;

    setGallery(prev => prev.map(item => 
      item.id === editingItem.id 
        ? { ...item, title: editTitle.trim(), emoji: editEmoji }
        : item
    ));

    closeEditModal();
    setMessage({
      type: "success",
      text: `✅ "${editingItem.filename}" güncellendi!`,
    });
  };

  // Available emojis for selection - organized by popularity for children
  const availableEmojis = [
    // Most Popular - Animals (kids love animals!)
    '🐱', '🐶', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸',
    '🐵', '🐮', '🐷', '🐙', '🦑', '🐠', '🐟', '🐬', '🐳', '🦋',
    '🐛', '🐝', '🐞', '🦗', '🐢', '🐍', '🦎', '🦜', '🐦', '🐤',
    '🐥', '🐣', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🦌', '🐴',
    
    // Very Popular - Art & Creative (perfect for drawings!)
    '🎨', '🖼️', '✏️', '🖍️', '🖌️', '🎭', '🎪', '🖋️', '📝', '🌟',
    '💫', '🌈', '🦄', '✨', '🎆', '🎇', '💎', '🔮', '🎊', '🎉',
    '🎈', '🎁', '🎀', '🎂', '🍰', '🧁', '🍭', '🍬', '🍫', '🍪',
    
    // Very Popular - Nature & Weather
    '☀️', '🌙', '⭐', '🌠', '⛅', '🌈', '❄️', '💧', '🌊', '☁️',
    '🏠', '🌳', '🌺', '🌸', '🌻', '🌷', '🌹', '🌵', '🌲', '🌴',
    '🌱', '🌿', '🍀', '🌾', '🍄', '🌍', '🌎', '🌏', '🌕', '🌖',
    
    // Popular - Hearts & Colors (child-friendly)
    '❤️', '💙', '💚', '💛', '🧡', '💜', '🖤', '🤍', '💖', '💝',
    '💕', '💞', '💓', '💗', '💘', '💟', '❣️', '🌺', '🌸', '🌼',
    
    // Popular - Food & Treats
    '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑',
    '🍍', '🥝', '🍅', '🥕', '🌽', '🍞', '🧀', '🍕', '🌮', '🍔',
    '🍟', '🌭', '🥪', '🍗', '🍖', '🥓', '🍳', '🥞', '🧇', '🍯',
    
    // Fun - Sports & Activities
    '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸',
    '🏒', '🏑', '🎯', '🏹', '🎣', '🏊', '🏄', '🏇', '🚴', '🏃',
    '🤸', '🤾', '🏋️', '🤽', '🥇', '🥈', '🥉', '🏅', '🏆', '🎖️',
    
    // Fun - Music & Entertainment (no gambling)
    '🎵', '🎶', '🎤', '🎧', '🎸', '🎹', '🥁', '🎺', '🎷', '🎻',
    '🎬', '🎭', '🎪', '🎯', '🎲', '🃏', '🎴', '🀄', '🧸', '🎮',
    '🕹️', '📚', '📖', '📝', '✏️', '🖍️', '🖊️', '📐', '📏', '📌',
    
    // Fun - Transportation & Objects
    '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
    '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🛹', '🛼',
    '✈️', '🛩️', '🛫', '🛬', '🪂', '💺', '🚀', '🛸', '🚁', '🛶',
    
    // Fun - Fantasy & Magic (friendly characters only)
    '🧚', '🧜', '🧞', '🧝', '🧙', '👸', '🤴', '🦸', '🦹', '🧙‍♀️',
    '🧙‍♂️', '🧚‍♀️', '🧚‍♂️', '🧜‍♀️', '🧜‍♂️', '🧞‍♀️', '🧞‍♂️', '🧝‍♀️', '🧝‍♂️', '🦸‍♀️',
    '🦸‍♂️', '🦹‍♀️', '🦹‍♂️', '👼', '🎅', '🤶', '🧑‍🎄', '🎄', '⛄', '🎃',
    
    // Fun - Toys & Games (no gambling)
    '🧸', '🎯', '🎲', '🃏', '🎴', '🀄', '🪀', '🎮', '🕹️', '🪁',
    '🎏', '🎐', '🧩', '🪆', '🎎', '🎑', '🎍', '🎋', '🎊', '🎉',
    '🎈', '🎁', '🎀', '🎂', '🍰', '🧁', '🍭', '🍬', '🍫', '🍪'
  ];

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
                      <div className="image-wrapper" onClick={() => openMagnifiedView(uploadedImages.original, uploadedImages.improved, uploadedImages.filename)}>
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
                      <div className="image-wrapper" onClick={() => openMagnifiedView(uploadedImages.original, uploadedImages.improved, uploadedImages.filename)}>
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
                      <div className="photo-header">
                        <div className="photo-title">
                          <span className="photo-emoji">{item.emoji || '🎨'}</span>
                          <span className="photo-title-text">
                            {item.title || item.filename}
                          </span>
                        </div>
                        <div className="photo-actions">
                          <button 
                            className="edit-photo-button"
                            onClick={() => openEditModal(item)}
                            title="Başlık ve emoji düzenle"
                          >
                            ✏️
                          </button>
                          <button 
                            className="remove-photo-button"
                            onClick={() => removeFromGallery(item.id)}
                            title="Galeriden kaldır"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      <div className="photo-comparison" onClick={() => openMagnifiedView(item.original, item.improved, item.filename, item.title, item.emoji)}>
                        <div className="photo-original">
                          <img src={item.original} alt="Orijinal" className="photo-image" />
                          <span className="photo-label">Orijinal</span>
                        </div>
                        <div className="photo-improved">
                          <img src={item.improved} alt="AI Geliştirilmiş" className="photo-image" />
                          <span className="photo-label">AI Geliştirilmiş</span>
                        </div>
                        <div className="photo-overlay">
                          <span className="magnify-icon">🔍</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Magnified Images Modal */}
        {magnifiedImages && (
          <div className="modal-overlay" onClick={closeMagnifiedView}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={closeMagnifiedView}>
                ✕
              </button>
              <div className="modal-comparison">
                <div className="modal-original">
                  <img
                    src={magnifiedImages.original}
                    alt="Orijinal"
                    className="magnified-image"
                  />
                  <p className="modal-caption">Orijinal Çizim</p>
                </div>
                <div className="modal-improved">
                  <img
                    src={magnifiedImages.improved}
                    alt="AI Geliştirilmiş"
                    className="magnified-image"
                  />
                  <p className="modal-caption">AI ile Geliştirilmiş</p>
                </div>
              </div>
              <div className="modal-title">
                <span className="modal-emoji">{magnifiedImages.emoji || '🎨'}</span>
                <span className="modal-title-text">
                  {magnifiedImages.title || magnifiedImages.filename}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingItem && (
          <div className="modal-overlay" onClick={closeEditModal}>
            <div className="edit-modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={closeEditModal}>
                ✕
              </button>
              <h3>Çizimi Düzenle</h3>
              <div className="edit-form">
                <div className="edit-field">
                  <label>Başlık:</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Çiziminiz için bir başlık yazın..."
                    maxLength={30}
                    className="edit-input"
                  />
                </div>
                <div className="edit-field">
                  <label>Emoji Seçin:</label>
                  <div className="emoji-picker">
                    {availableEmojis.map((emoji) => (
                      <button
                        key={emoji}
                        className={`emoji-option ${editEmoji === emoji ? 'selected' : ''}`}
                        onClick={() => setEditEmoji(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="edit-actions">
                  <button className="cancel-button" onClick={closeEditModal}>
                    İptal
                  </button>
                  <button className="save-button" onClick={saveEdit}>
                    Kaydet
                  </button>
                </div>
              </div>
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
