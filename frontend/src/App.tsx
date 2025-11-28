import React, { useState, useRef } from "react";
import axios from "axios";
import "./App.css";
import Login from "./components/Login";

type TransformMode =
  | "normal"
  | "oil"
  | "neon"
  | "inverse"
  | "anime"
  | "cartoon"
  | "comic";

interface TransformModeOption {
  key: TransformMode;
  label: string;
  description: string;
  emoji: string;
}

const MODE_OPTIONS: TransformModeOption[] = [
  {
    key: "normal",
    label: "Gerçekçi",
    description: "Doğal renkler ve dengeli ışık.",
    emoji: "🌟",
  },
  {
    key: "oil",
    label: "Yağlı Boya",
    description: "Zengin fırça dokuları ve sıcak ışık.",
    emoji: "🖌️",
  },
  {
    key: "neon",
    label: "Neon Işık",
    description: "Parlak neon renklerle ışıldasın.",
    emoji: "💡",
  },
  {
    key: "inverse",
    label: "Negatif",
    description: "Renkleri tersine çeviren efekt.",
    emoji: "🔁",
  },
  {
    key: "anime",
    label: "Anime",
    description: "Yumuşak gölgeler ve canlı renkler.",
    emoji: "🌸",
  },
  {
    key: "cartoon",
    label: "Çizgi Film",
    description: "Düzgün hatlar ve temiz renkler.",
    emoji: "🎯",
  },
  {
    key: "comic",
    label: "Çizgi Roman",
    description: "Klasik halftone doku hissi.",
    emoji: "📰",
  },
];

const MODE_LOOKUP: Record<TransformMode, TransformModeOption> = MODE_OPTIONS.reduce(
  (acc, option) => {
    acc[option.key] = option;
    return acc;
  },
  {} as Record<TransformMode, TransformModeOption>
);

interface UploadResponse {
  message: string;
  filename: string;
  improved_filename: string;
  original_filename: string;
  original_url: string;
  improved_url: string;
  mode: TransformMode;
  user_id: number;
}

interface Comment {
  id: string;
  user_id: number;
  username: string;
  displayName: string;
  avatar_name?: string | null;
  comment_text: string;
  timestamp: number;
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
  likeCount: number;
  isLiked: boolean;
  mode?: TransformMode;
  commentCount: number;
  comments: Comment[];
}

interface UserProfile {
  id: number;
  username: string;
  displayName: string;
  bio: string;
  interests: string[];
  avatar_name?: string | null;
  posts?: Array<{ 
    original: string; 
    improved: string; 
    like_count: number; 
    liked_by: number[];
    mode?: TransformMode;
    original_filename?: string;
    comment_count: number;
    comments: Comment[];
  }>;
}

interface AvatarInfo {
  name: string;
  url: string;
}

interface SearchApiResponse {
  query: string;
  count: number;
  results: Array<{
    id: number;
    username: string;
    display_name: string;
    bio: string;
    interests?: string[];
    avatar_name?: string | null;
  }>;
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedMode, setSelectedMode] = useState<TransformMode>(MODE_OPTIONS[0].key);
  const [preview, setPreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<{
    original: string;
    improved: string;
    filename: string;
    mode?: TransformMode;
  } | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [magnifiedImages, setMagnifiedImages] = useState<{
    original: string;
    improved: string;
    filename: string;
    title?: string;
    emoji?: string;
    mode?: TransformMode;
  } | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [currentView, setCurrentView] = useState<'upload' | 'profile'>('upload');
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editEmoji, setEditEmoji] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  // Profile state
  const [userBio] = useState<string>('Çocuklar için AI destekli sanat platformunda çizimlerimi paylaşıyorum! 🎨');
  const [userFollowers, setUserFollowers] = useState<number>(0);
  const [userFollowing, setUserFollowing] = useState<number>(0);
  const [userAvatar, setUserAvatar] = useState<string | null>(null); // Current user's avatar URL
  const [userAvatarName, setUserAvatarName] = useState<string | null>(null); // Current user's avatar filename
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [availableAvatars, setAvailableAvatars] = useState<AvatarInfo[]>([]);
  const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(null); // Başkasının profilini görüntüleme
  const [viewingProfileStats, setViewingProfileStats] = useState<{followers: number, following: number} | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [followersModal, setFollowersModal] = useState<{type: 'followers' | 'following', userId: number} | null>(null);
  const [followersList, setFollowersList] = useState<UserProfile[]>([]);
  const [followingList, setFollowingList] = useState<UserProfile[]>([]);
  const [activePage, setActivePage] = useState<'home' | 'search' | 'discover'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const searchAbortController = React.useRef<AbortController | null>(null);
  const searchDelayRef = React.useRef<number | undefined>(undefined);
  // Comment modal state
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [commentingItem, setCommentingItem] = useState<GalleryItem | null>(null);
  const [predefinedComments, setPredefinedComments] = useState<string[]>([]);
  const [viewingComments, setViewingComments] = useState<{item: GalleryItem, comments: Comment[]} | null>(null);

  const selectedModeMeta = MODE_LOOKUP[selectedMode] ?? MODE_OPTIONS[0];

  React.useEffect(() => {
    const storedAuth = localStorage.getItem('hayai-auth');
    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth);
        if (parsed?.username) {
          setIsAuthenticated(true);
          setCurrentUser(parsed.username);
          setActivePage('home');
        }
      } catch (error) {
        console.error('Error loading auth state:', error);
      }
    }
  }, []);

  // Update avatar when current user changes
  React.useEffect(() => {
    if (currentUser) {
      (async () => {
        const avatarUrl = await getCurrentUserAvatar();
        setUserAvatar(avatarUrl);
      })();
    }
  }, [currentUser]);

  // Get current user ID from username
  // hayai -> user ID 1, guest -> user ID 2 (now they are actual users in backend)
  const getCurrentUserId = (): number | null => {
    if (!currentUser) return null;
    const usernameLower = currentUser.toLowerCase();
    if (usernameLower === 'hayai') return 1;
    if (usernameLower === 'guest') return 2;
    return null;
  };

  // Get current user avatar URL - fetch from backend
  const getCurrentUserAvatar = async (): Promise<string | null> => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return null;
    try {
      // Fetch user profile to get avatar name
      const response = await axios.get(`http://localhost:8000/users/${currentUserId}`);
      const avatarName = response.data.avatar_name;
      if (avatarName) {
        setUserAvatarName(avatarName);
        return `http://localhost:8000/avatars/${avatarName}`;
      }
      setUserAvatarName(null);
      return null;
    } catch (error) {
      console.error('Error fetching user avatar:', error);
      return null;
    }
  };

  // Load available avatars
  React.useEffect(() => {
    const loadAvatars = async () => {
      try {
        const response = await axios.get<AvatarInfo[]>('http://localhost:8000/avatars');
        setAvailableAvatars(response.data);
      } catch (error) {
        console.error('Error loading avatars:', error);
      }
    };
    loadAvatars();
  }, []);

  // Open avatar selection modal
  const handleOpenAvatarModal = () => {
    setAvatarModalOpen(true);
  };

  // Close avatar selection modal
  const handleCloseAvatarModal = () => {
    setAvatarModalOpen(false);
  };

  // Select an avatar
  const handleSelectAvatar = async (avatarName: string) => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
      setMessage({
        type: "error",
        text: "❌ Kullanıcı kimliği bulunamadı.",
      });
      return;
    }

    try {
      await axios.put(`http://localhost:8000/users/${currentUserId}/avatar`, null, {
        params: { avatar_name: avatarName }
      });
      setUserAvatarName(avatarName);
      setUserAvatar(`http://localhost:8000/avatars/${avatarName}`);
      setAvatarModalOpen(false);
      setMessage({
        type: "success",
        text: "✅ Avatar başarıyla güncellendi!",
      });
    } catch (error: any) {
      console.error('Error setting avatar:', error);
      setMessage({
        type: "error",
        text: `❌ Avatar güncellenirken hata oluştu: ${error.response?.data?.detail || error.message}`,
      });
    }
  };

  // Fetch follow stats for viewing profile
  React.useEffect(() => {
    if (viewingProfile) {
      // Fetch follow stats
      axios.get(`http://localhost:8000/users/${viewingProfile.id}/follow-stats`)
        .then(response => {
          setViewingProfileStats(response.data);
        })
        .catch(error => {
          console.error('Error fetching follow stats:', error);
          setViewingProfileStats({followers: 0, following: 0});
        });

      // Check if current user is following this profile
      const currentUserId = getCurrentUserId();
      if (currentUserId) {
        axios.get(`http://localhost:8000/users/${currentUserId}/is-following/${viewingProfile.id}`)
          .then(response => {
            setIsFollowing(response.data.is_following);
          })
          .catch(error => {
            console.error('Error checking follow status:', error);
            setIsFollowing(false);
          });
      }
    } else {
      setViewingProfileStats(null);
      setIsFollowing(false);
    }
  }, [viewingProfile, currentUser]);

  // Fetch own follow stats
  React.useEffect(() => {
    if (!viewingProfile && currentUser) {
      const currentUserId = getCurrentUserId();
      if (currentUserId) {
        axios.get(`http://localhost:8000/users/${currentUserId}/follow-stats`)
          .then(response => {
            setUserFollowers(response.data.followers);
            setUserFollowing(response.data.following);
          })
          .catch(error => {
            console.error('Error fetching own follow stats:', error);
            setUserFollowers(0);
            setUserFollowing(0);
          });
      }
    }
  }, [viewingProfile, currentUser]);

  // Load gallery from localStorage on component mount
// YENİ: Profil değiştiğinde veya ana sayfaya dönüldüğünde sunucudan resimleri çek
  React.useEffect(() => {
    const fetchBackendGallery = async () => {
      // Hangi kullanıcının galerisini göstereceğiz?
      // viewingProfile varsa (başkasının profili) onun ID'si, yoksa kendi ID'miz.
      let targetUserId: number | null = null;
      
      if (viewingProfile) {
        targetUserId = viewingProfile.id;
      } else {
        targetUserId = getCurrentUserId();
      }

      if (!targetUserId) return;

      try {
        // Kullanıcı bilgilerini (ve postlarını) çek
        const response = await axios.get<UserProfile>(`http://localhost:8000/users/${targetUserId}`);
        // Backend'den gelen veriyi işle
        const userPosts = response.data.posts || [];

        const currentUserId = getCurrentUserId(); // Bunu döngüden önce al

        const backendGallery: GalleryItem[] = userPosts.map((post, index) => ({
          id: `backend_${index}_${post.original}`,
          original: `http://localhost:8000/uploads/${post.original}`, 
          improved: `http://localhost:8000/uploads/${post.improved}`,
          filename: post.original_filename || "AI Çizimi",
          originalFilename: post.original,
          timestamp: Date.now(),
          title: "Çizim", 
          emoji: "🎨",
          likeCount: post.like_count || 0,
          isLiked: currentUserId ? (post.liked_by || []).includes(currentUserId) : false,
          mode: post.mode,
          commentCount: post.comment_count || 0,
          comments: post.comments || [],
        }));

        setGallery(backendGallery);
        
      } catch (error) {
        console.error("Galeri yüklenirken hata:", error);
      }
    };

    // Sadece "Profil" sayfasındaysak veya Ana sayfadaysak çalıştır
    // (Search sayfasında çalışıp durmasın)
    if (activePage === 'home' || currentView === 'profile') {
        fetchBackendGallery();
    }
    
  }, [viewingProfile, currentUser, currentView, activePage]);

  // Save gallery to localStorage whenever it changes
  React.useEffect(() => {
    localStorage.setItem('hayai-gallery', JSON.stringify(gallery));
  }, [gallery]);

  React.useEffect(() => {
    if (activePage !== 'search') {
      setSearchQuery('');
      setSelectedUser(null);
    }
  }, [activePage]);

  React.useEffect(() => {
    const trimmedQuery = searchQuery.trim();

    if (activePage !== 'search') {
      setSearchLoading(false);
      setSearchResults([]);
      setSearchError(null);
      if (searchAbortController.current) {
        searchAbortController.current.abort();
        searchAbortController.current = null;
      }
      if (searchDelayRef.current !== undefined) {
        window.clearTimeout(searchDelayRef.current);
        searchDelayRef.current = undefined;
      }
      return;
    }

    if (searchDelayRef.current !== undefined) {
      window.clearTimeout(searchDelayRef.current);
      searchDelayRef.current = undefined;
    }

    // Allow empty query to show initial results (first 5 users)
    // Only require 2 characters for actual search filtering
    if (trimmedQuery.length > 0 && trimmedQuery.length < 2) {
      if (searchAbortController.current) {
        searchAbortController.current.abort();
        searchAbortController.current = null;
      }

      setSearchLoading(false);
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);

    const controller = new AbortController();
    searchAbortController.current = controller;

    searchDelayRef.current = window.setTimeout(async () => {
      try {
        const response = await axios.get<SearchApiResponse>(
          "http://localhost:8000/users/search",
          {
            params: { q: trimmedQuery },
            signal: controller.signal,
          }
        );

        const mappedResults = response.data.results.map((user) => ({
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          bio: user.bio,
          interests: user.interests ?? [],
          avatar_name: user.avatar_name ?? null,
        }));

        setSearchResults(mappedResults);
        setSearchError(
          response.data.count === 0
            ? "Arama kriterinize uygun kullanıcı bulunamadı."
            : null
        );
      } catch (error: any) {
        if (!axios.isCancel(error)) {
          console.error('User search error:', error);
          setSearchError('Kullanıcı araması yapılırken bir hata oluştu.');
        }
      } finally {
        setSearchLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      if (searchAbortController.current === controller) {
        searchAbortController.current = null;
      }
      if (searchDelayRef.current !== undefined) {
        window.clearTimeout(searchDelayRef.current);
        searchDelayRef.current = undefined;
      }
    };
  }, [searchQuery, activePage]);

  const handleLoginSuccess = (username: string) => {
    setIsAuthenticated(true);
    setCurrentUser(username);
    setSelectedUser(null);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
    setActivePage('home');
    localStorage.setItem('hayai-auth', JSON.stringify({ username, timestamp: Date.now() }));
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setSelectedUser(null);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
    setActivePage('home');
    localStorage.removeItem('hayai-auth');
  };

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

  // App.tsx içine ekle:

  const handleToggleLike = async (item: GalleryItem) => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
      setMessage({ type: "error", text: "Beğenmek için giriş yapmalısınız!" });
      return;
    }

    // 1. Optimistic Update (Sonucu beklemeden ekranı güncelle - daha hızlı hissettirir)
    const oldGallery = [...gallery];
    setGallery(prev => prev.map(gItem => {
      if (gItem.id === item.id) {
        return {
          ...gItem,
          isLiked: !gItem.isLiked,
          likeCount: gItem.isLiked ? gItem.likeCount - 1 : gItem.likeCount + 1
        };
      }
      return gItem;
    }));

    try {
      // 2. Backend'e isteği gönder
      await axios.post("http://localhost:8000/posts/like", {
        filename: item.originalFilename, // ID olarak orijinal dosya adını kullanıyoruz
        user_id: currentUserId
      });
      
      // Backend zaten başarılı dönerse bir şey yapmaya gerek yok,
      // Optimistic update zaten işi halletti.
    } catch (error) {
      // Hata olursa eski haline geri döndür (Rollback)
      console.error("Like hatası:", error);
      setGallery(oldGallery);
      setMessage({ type: "error", text: "Beğeni işlemi başarısız oldu." });
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
    formData.append("mode", selectedMode);
    
    // YENİ: Kullanıcı ID'sini ekle
    const currentUserId = getCurrentUserId();
    if (currentUserId) {
      formData.append("user_id", currentUserId.toString());
    }

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
        text: `✅ Başarılı! "${response.data.original_filename}" dosyası ${MODE_LOOKUP[response.data.mode]?.label ?? response.data.mode} modunda işlendi ve galeriye eklendi!`,
      });

      // Set uploaded images for display
      const newImages = {
        original: `http://localhost:8000${response.data.original_url}`,
        improved: `http://localhost:8000${response.data.improved_url}`,
        filename: response.data.original_filename,
        mode: response.data.mode,
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
        
        // EKSİK OLAN PARAMETRELER EKLENDİ:
        likeCount: 0,     // Yeni resmin beğenisi 0 başlar
        isLiked: false,   // Henüz kimse beğenmediği için false
        mode: response.data.mode,
        commentCount: 0,  // Yeni resmin yorumu 0 başlar
        comments: [],     // Henüz yorum yok
        
        // (Opsiyonel) Başlık ve emoji varsayılanları da eklenebilir:
        title: "Çizim",
        emoji: selectedModeMeta?.emoji ?? "🎨"
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

  const openMagnifiedView = (
    original: string,
    improved: string,
    filename: string,
    title?: string,
    emoji?: string,
    mode?: TransformMode
  ) => {
    setMagnifiedImages({ original, improved, filename, title, emoji, mode });
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

  // Load predefined comments on mount
  React.useEffect(() => {
    const loadPredefinedComments = async () => {
      try {
        const response = await axios.get<{ comments: string[] }>('http://localhost:8000/comments/predefined');
        setPredefinedComments(response.data.comments);
      } catch (error) {
        console.error('Error loading predefined comments:', error);
        // Fallback to default comments
        setPredefinedComments([
          "Harika görünüyor! 🌟",
          "Çok yeteneklisin! 👏",
          "Bayıldım! 😍",
          "Kullandığın renkler müthiş! 🎨",
          "Çizimlerin çok gerçekçi! ✨"
        ]);
      }
    };
    loadPredefinedComments();
  }, []);

  const openCommentModal = (item: GalleryItem) => {
    setCommentingItem(item);
    setCommentModalOpen(true);
  };

  const closeCommentModal = () => {
    setCommentModalOpen(false);
    setCommentingItem(null);
  };

  const handleAddComment = async (commentText: string) => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || !commentingItem) {
      setMessage({ type: "error", text: "Yorum yapmak için giriş yapmalısınız!" });
      return;
    }

    try {
      const response = await axios.post<Comment>('http://localhost:8000/posts/comment', {
        filename: commentingItem.originalFilename,
        user_id: currentUserId,
        comment_text: commentText
      });

      // Update gallery with new comment
      setGallery(prev => prev.map(item => {
        if (item.id === commentingItem.id) {
          return {
            ...item,
            commentCount: item.commentCount + 1,
            comments: [...item.comments, response.data]
          };
        }
        return item;
      }));

      closeCommentModal();
      setMessage({
        type: "success",
        text: "✅ Yorumunuz eklendi!",
      });
    } catch (error: any) {
      console.error('Comment error:', error);
      setMessage({
        type: "error",
        text: `❌ Yorum eklenirken hata oluştu: ${error.response?.data?.detail || error.message}`,
      });
    }
  };

  const openViewComments = (item: GalleryItem) => {
    setViewingComments({ item, comments: item.comments });
  };

  const closeViewComments = () => {
    setViewingComments(null);
  };

  const handleSearchInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const handleSelectUser = (user: UserProfile) => {
    setSelectedUser(user);
  };

const handleViewProfile = (user: UserProfile) => {
    const currentUserId = getCurrentUserId();
    if (user.id === currentUserId) {
      setViewingProfile(null);
      setViewingProfileStats(null);
      setIsFollowing(false);
    } else {
      setViewingProfile(user);
    }

    // Ortak işlemler
    setActivePage('home');
    setCurrentView('profile');
    setSelectedUser(null);
  };

  const handleBackToMyProfile = () => {
    setViewingProfile(null);
    setViewingProfileStats(null);
    setIsFollowing(false);
  };

  const handleFollow = async (targetUserId: number) => {
    try {
      const currentUserId = getCurrentUserId();
      if (!currentUserId) {
        setMessage({
          type: "error",
          text: "❌ Kullanıcı kimliği bulunamadı. Lütfen tekrar giriş yapın.",
        });
        return;
      }
      
      await axios.post(`http://localhost:8000/users/${targetUserId}/follow`, null, {
        params: { current_user_id: currentUserId }
      });
      setIsFollowing(true);
      setMessage({
        type: "success",
        text: "✅ Kullanıcı takip edildi!",
      });
      // Refresh stats
      if (viewingProfile) {
        const response = await axios.get(`http://localhost:8000/users/${viewingProfile.id}/follow-stats`);
        setViewingProfileStats(response.data);
      }
    } catch (error: any) {
      console.error('Error following user:', error);
      setMessage({
        type: "error",
        text: `❌ Takip edilirken hata oluştu: ${error.response?.data?.detail || error.message}`,
      });
    }
  };

  const handleUnfollow = async (targetUserId: number) => {
    try {
      const currentUserId = getCurrentUserId();
      if (!currentUserId) {
        setMessage({
          type: "error",
          text: "❌ Kullanıcı kimliği bulunamadı. Lütfen tekrar giriş yapın.",
        });
        return;
      }
      
      await axios.delete(`http://localhost:8000/users/${targetUserId}/follow`, {
        params: { current_user_id: currentUserId }
      });
      setIsFollowing(false);
      setMessage({
        type: "success",
        text: "✅ Takipten çıkıldı.",
      });
      // Refresh stats
      if (viewingProfile) {
        const response = await axios.get(`http://localhost:8000/users/${viewingProfile.id}/follow-stats`);
        setViewingProfileStats(response.data);
      }
    } catch (error: any) {
      console.error('Error unfollowing user:', error);
      setMessage({
        type: "error",
        text: `❌ Takipten çıkılırken hata oluştu: ${error.response?.data?.detail || error.message}`,
      });
    }
  };

  const handleOpenFollowersModal = async (userId: number, type: 'followers' | 'following') => {
    setFollowersModal({type, userId});
    try {
      if (type === 'followers') {
        const response = await axios.get(`http://localhost:8000/users/${userId}/followers`);
        setFollowersList(response.data.followers);
      } else {
        const response = await axios.get(`http://localhost:8000/users/${userId}/following`);
        setFollowingList(response.data.following);
      }
    } catch (error: any) {
      console.error('Error fetching followers/following:', error);
      setMessage({
        type: "error",
        text: `❌ Liste yüklenirken hata oluştu: ${error.response?.data?.detail || error.message}`,
      });
    }
  };

  const handleCloseFollowersModal = () => {
    setFollowersModal(null);
    setFollowersList([]);
    setFollowingList([]);
  };

  const clearSelectedUser = () => {
    setSelectedUser(null);
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

  if (!isAuthenticated) {
    return (
      <div className="App">
        <Login onSuccess={handleLoginSuccess} />
      </div>
    );
  }

  return (
    <div className="App">
      <div className="container">
        <header className="header">
          <div className="header-top">
            {currentUser && (
              <div className="user-session">
                <span className="user-greeting">👋 {currentUser}</span>
                <button className="logout-button" onClick={handleLogout}>
                  Çıkış Yap
                </button>
              </div>
            )}
          </div>
          <div className="header-hero">
            <h1>🎨 HayAI Art Platform</h1>
            <p>Çocuklar için AI destekli sanat deneyimi.</p>
          </div>
          <nav className="primary-nav">
            <button
              type="button"
              className={`primary-nav-button ${activePage === 'home' ? 'active' : ''}`}
              onClick={() => setActivePage('home')}
            >
              🏠 Ana Sayfa
            </button>
            <button
              type="button"
              className={`primary-nav-button ${activePage === 'search' ? 'active' : ''}`}
              onClick={() => setActivePage('search')}
            >
              🔍 Arama
            </button>
            <button
              type="button"
              className="primary-nav-button disabled"
              disabled
            >
              ✨ Keşfet (yakında)
            </button>
          </nav>
        </header>

        <main className="main">
          {activePage === 'home' && (
            <section className="studio-section">
              <div className="studio-header">
                <div>
                  <h2>🎛️ Stüdyo</h2>
                  <p>Merhaba @{currentUser || 'misafir'}! Çizimini yükle ya da koleksiyonunu incele.</p>
                </div>
                {!viewingProfile && (
                  <nav className="navigation">
                    <button
                      className={`nav-button ${currentView === 'upload' ? 'active' : ''}`}
                      onClick={() => setCurrentView('upload')}
                    >
                      📤 Yükle
                    </button>
                    <button
                      className={`nav-button ${currentView === 'profile' ? 'active' : ''}`}
                      onClick={() => setCurrentView('profile')}
                    >
                      👤 Profil
                    </button>
                  </nav>
                )}
              </div>

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

                      <div className="mode-selector">
                        <div className="mode-selector-header">
                          <h3>AI Dönüşüm Modu</h3>
                          <p>Görselini hangi stilde görmek istersin?</p>
                        </div>
                        <div className="mode-options">
                          {MODE_OPTIONS.map((option) => {
                            const isActive = option.key === selectedMode;
                            return (
                              <button
                                key={option.key}
                                type="button"
                                className={`mode-option ${isActive ? 'active' : ''}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedMode(option.key);
                                }}
                                aria-pressed={isActive}
                                disabled={uploading}
                              >
                                <span className="mode-option-emoji">{option.emoji}</span>
                                <span className="mode-option-content">
                                  <span className="mode-option-title">{option.label}</span>
                                  <span className="mode-option-description">{option.description}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {message && (
                        <div className={`message ${message.type}`}>{message.text}</div>
                      )}

                      <button
                        className="upload-button"
                        onClick={handleUpload}
                        disabled={!selectedFile || uploading}
                      >
                        {uploading
                          ? `⏳ ${selectedModeMeta?.label ?? 'AI'} modu çalışıyor...`
                          : `🚀 ${selectedModeMeta?.label ?? 'AI'} Modu ile Dönüştür`}
                      </button>
                    </div>

                    {/* Results Section */}
                    {uploadedImages && (
                      <div className="results-section">
                        <h2>🎨 Sonuçlar</h2>
                        {uploadedImages.mode && (
                          <div className="selected-mode-pill">
                            <span className="selected-mode-emoji">
                              {MODE_LOOKUP[uploadedImages.mode]?.emoji || '✨'}
                            </span>
                            <span className="selected-mode-label">
                              {(MODE_LOOKUP[uploadedImages.mode]?.label || uploadedImages.mode) + ' modu'}
                            </span>
                          </div>
                        )}
                        <div className="image-comparison">
                          <div className="image-container">
                            <h3>Orijinal Çizim</h3>
                            <div className="image-wrapper" onClick={() => openMagnifiedView(uploadedImages.original, uploadedImages.improved, uploadedImages.filename, uploadedImages.filename, undefined, uploadedImages.mode)}>
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
                            <div className="image-wrapper" onClick={() => openMagnifiedView(uploadedImages.original, uploadedImages.improved, uploadedImages.filename, uploadedImages.filename, undefined, uploadedImages.mode)}>
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
                  <div className="profile-section">
                    {/* Back to my profile button if viewing someone else's profile */}
                    {viewingProfile && (
                      <div className="profile-back-section">
                        <button className="back-to-profile-button" onClick={handleBackToMyProfile}>
                          ← Kendi Profilime Dön
                        </button>
                      </div>
                    )}
                    
                    {/* Profile Header */}
                    <div className="profile-header-section">
                      <div className="profile-avatar-container">
                        {viewingProfile ? (
                          // Başkasının profili - avatar gösterimi
                          <>
                            {viewingProfile.avatar_name ? (
                              <img 
                                src={`http://localhost:8000/avatars/${viewingProfile.avatar_name}`} 
                                alt={`${viewingProfile.displayName} Avatarı`} 
                                className="profile-avatar" 
                                onError={(e) => {
                                  // If image fails to load, hide image and show placeholder
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                            ) : null}
                            {!viewingProfile.avatar_name && (
                              <div className="profile-avatar-placeholder">
                                <span className="avatar-emoji">👤</span>
                              </div>
                            )}
                          </>
                        ) : (
                          // Kendi profili
                          <>
                            {userAvatar ? (
                              <img 
                                src={userAvatar} 
                                alt="Profil Avatarı" 
                                className="profile-avatar"
                                onError={(e) => {
                                  // If image fails to load, hide image and show placeholder
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  setUserAvatar(null);
                                }}
                              />
                            ) : null}
                            {!userAvatar && (
                              <div className="profile-avatar-placeholder">
                                <span className="avatar-emoji">👤</span>
                              </div>
                            )}
                            {/* Avatar selection button */}
                            <button 
                              className="avatar-upload-button" 
                              title="Avatar seç"
                              onClick={handleOpenAvatarModal}
                            >
                              📷
                            </button>
                          </>
                        )}
                      </div>
                      <div className="profile-info">
                        <h2 className="profile-name">
                          @{viewingProfile ? viewingProfile.username : (currentUser || 'misafir')}
                        </h2>
                        {viewingProfile && (
                          <p className="profile-display-name">{viewingProfile.displayName}</p>
                        )}
                        <div className="profile-stats">
                          <div className="profile-stat">
                            <span className="stat-number">{gallery.length}</span>
                            <span className="stat-label">Çizim</span>
                          </div>
                          <div 
                            className="profile-stat clickable-stat"
                            onClick={() => {
                              const userId = viewingProfile ? viewingProfile.id : getCurrentUserId();
                              if (userId) {
                                handleOpenFollowersModal(userId, 'followers');
                              }
                            }}
                            title="Takipçileri görüntüle"
                          >
                            <span className="stat-number">
                              {viewingProfile ? (viewingProfileStats?.followers || 0) : userFollowers}
                            </span>
                            <span className="stat-label">Takipçi</span>
                          </div>
                          <div 
                            className="profile-stat clickable-stat"
                            onClick={() => {
                              const userId = viewingProfile ? viewingProfile.id : getCurrentUserId();
                              if (userId) {
                                handleOpenFollowersModal(userId, 'following');
                              }
                            }}
                            title="Takip edilenleri görüntüle"
                          >
                            <span className="stat-number">
                              {viewingProfile ? (viewingProfileStats?.following || 0) : userFollowing}
                            </span>
                            <span className="stat-label">Takip Edilen</span>
                          </div>
                        </div>
                        <div className="profile-bio">
                          <p>{viewingProfile ? viewingProfile.bio : userBio}</p>
                          {!viewingProfile && (
                            <button className="edit-bio-button" title="Biyografi düzenle (yakında)">
                              ✏️
                            </button>
                          )}
                        </div>
                        {viewingProfile && (
                          <div className="profile-follow-section">
                            {isFollowing ? (
                              <button 
                                className="unfollow-button"
                                onClick={() => handleUnfollow(viewingProfile.id)}
                              >
                                ✓ Takip Ediliyor
                              </button>
                            ) : (
                              <button 
                                className="follow-button"
                                onClick={() => handleFollow(viewingProfile.id)}
                              >
                                + Takip Et
                              </button>
                            )}
                          </div>
                        )}
                        {viewingProfile && viewingProfile.interests && viewingProfile.interests.length > 0 && (
                          <div className="profile-interests">
                            <h4>İlgi Alanları:</h4>
                            <div className="profile-tags">
                              {viewingProfile.interests.map((interest) => (
                                <span key={interest} className="profile-tag">
                                  #{interest}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>


                    {/* Gallery Section */}
                    <div className="profile-gallery-section">
                      <div className="profile-gallery-header">
                        <h2>🖼️ {viewingProfile ? `${viewingProfile.displayName}'nin Galerisi` : 'Sanat Galerim'}</h2>
                        <p>AI ile geliştirilmiş çizimlerin koleksiyonu</p>
                        {!viewingProfile && gallery.length > 0 && (
                          <button className="clear-gallery-button" onClick={clearGallery}>
                            🗑️ Galeriyi Temizle
                          </button>
                        )}
                      </div>
                      {gallery.length === 0 ? (
                        <div className="empty-gallery">
                          <div className="empty-icon">🎨</div>
                          <h3>{viewingProfile ? 'Henüz çizim yok!' : 'Henüz çizim yok!'}</h3>
                          <p>{viewingProfile ? 'Bu kullanıcı henüz çizim paylaşmamış.' : 'İlk çiziminizi yükleyip AI ile geliştirin'}</p>
                          {!viewingProfile && (
                            <button className="upload-first-button" onClick={() => setCurrentView('upload')}>
                              📤 İlk Çizimi Yükle
                            </button>
                          )}
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
                                  {item.mode && (
                                    <span className="mode-badge">
                                      <span className="mode-badge-emoji">{MODE_LOOKUP[item.mode]?.emoji || '✨'}</span>
                                      <span className="mode-badge-label">{MODE_LOOKUP[item.mode]?.label || item.mode}</span>
                                    </span>
                                  )}
                                </div>
                                <button 
                                className={`like-button ${item.isLiked ? 'liked' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation(); // Resmin büyümesini engelle
                                  handleToggleLike(item);
                                }}
                                title={item.isLiked ? "Beğenmekten vazgeç" : "Beğen"}
                               >
                                <span className="like-icon">{item.isLiked ? '❤️' : '🤍'}</span>
                                <span className="like-count">{item.likeCount}</span>
                               </button>
                               <button 
                                className="comment-button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCommentModal(item);
                                }}
                                title="Yorum yap"
                               >
                                <span className="comment-icon">💬</span>
                                <span className="comment-count">{item.commentCount}</span>
                               </button>
                               {item.commentCount > 0 && (
                                 <button 
                                   className="view-comments-button"
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     openViewComments(item);
                                   }}
                                   title="Yorumları gör"
                                 >
                                   👁️
                                 </button>
                               )}
                                {!viewingProfile && (
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
                                )}
                              </div>
                              <div className="photo-comparison" onClick={() => openMagnifiedView(item.original, item.improved, item.filename, item.title, item.emoji, item.mode)}>
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
                  </div>
                )}
            </section>
          )}

          {activePage === 'search' && (
            <section className="search-page">
              <div className="search-hero">
                <h2>Arkadaşlarını Bul</h2>
                <p>İsimleri yazarak diğer sanatçıları keşfedin ve arkadaş listenize ekleyin.</p>
              </div>
              <div className="search-form">
                <label htmlFor="search-page-input" className="visually-hidden">Kullanıcı ara</label>
                <div className="search-form-field">
                  <input
                    id="search-page-input"
                    type="search"
                    ref={searchInputRef}
                    className="search-page-input"
                    value={searchQuery}
                    onChange={handleSearchInput}
                    placeholder="Kullanıcı adı veya isim yazın..."
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="search-page-button"
                    onClick={() => searchInputRef.current?.focus()}
                  >
                    Ara
                  </button>
                </div>
              </div>

              <div className="search-layout">
                <div className="search-results-panel">
                  {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 && (
                    <p className="search-info">Arama yapmak için en az iki karakter yazın.</p>
                  )}
                  {searchQuery.trim().length === 0 && searchLoading && (
                    <p className="search-info">Yükleniyor...</p>
                  )}
                  {searchQuery.trim().length >= 2 && searchLoading && (
                    <p className="search-info">Arama yapılıyor...</p>
                  )}
                  {!searchLoading && searchError && (
                    <p className="search-info error">{searchError}</p>
                  )}
                  {!searchLoading && !searchError && searchResults.length === 0 && searchQuery.trim().length >= 2 && (
                    <p className="search-info">Sonuç bulunamadı.</p>
                  )}
                  {!searchLoading && !searchError && searchResults.length > 0 && (
                    <ul className="search-results-list">
                      {searchResults.map((user) => (
                        <li key={user.id}>
                          <button type="button" className={`search-result-item ${selectedUser?.id === user.id ? 'active' : ''}`} onClick={() => handleSelectUser(user)}>
                            <span className="search-result-name">{user.displayName}</span>
                            <span className="search-result-username">@{user.username}</span>
                            <span className="search-result-bio">{user.bio}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {searchQuery.trim().length === 0 && !searchLoading && !searchError && searchResults.length === 0 && (
                    <p className="search-info">Arama yapmak için kullanıcı adı veya isim yazın. Boş bırakırsanız ilk kullanıcılar gösterilir.</p>
                  )}
                </div>
                <aside className="search-profile-panel">
                  {selectedUser ? (
                    <div className="profile-preview">
                      <div className="profile-header">
                        <div>
                          <h3>{selectedUser.displayName}</h3>
                          <p className="profile-username">@{selectedUser.username}</p>
                        </div>
                        <button type="button" className="profile-close" onClick={clearSelectedUser}>
                          Kapat
                        </button>
                      </div>
                      <p className="profile-bio">{selectedUser.bio}</p>
                      {selectedUser.interests.length > 0 && (
                        <div className="profile-tags">
                          {selectedUser.interests.map((interest) => (
                            <span key={interest} className="profile-tag">
                              #{interest}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="profile-actions">
                        <button 
                          type="button" 
                          className="add-friend-button"
                          onClick={() => handleViewProfile(selectedUser)}
                        >
                          👤 Profili Görüntüle
                        </button>
                        <button type="button" className="add-friend-button">
                          🤝 Arkadaş Olarak Ekle
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="search-empty-state">
                      <span className="search-empty-icon">🔍</span>
                      <p>Bir kullanıcı seçtiğinizde profil önizlemesi burada görünecek.</p>
                    </div>
                  )}
                </aside>
              </div>
            </section>
          )}

          {activePage === 'discover' && (
            <section className="discover-placeholder">
              <h2>✨ Keşfet</h2>
              <p>Topluluk gönderilerini burada göstereceğiz. Çok yakında!</p>
            </section>
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
                  <p className="modal-caption">
                    AI ile Geliştirilmiş
                    {magnifiedImages.mode && (
                      <>
                        {' '}
                      <span className="modal-mode-pill">
                        {MODE_LOOKUP[magnifiedImages.mode]?.emoji || "✨"}
                        {MODE_LOOKUP[magnifiedImages.mode]?.label || magnifiedImages.mode}
                      </span>
                      </>
                    )}
                  </p>
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

        {/* Followers/Following Modal */}
        {followersModal && (
          <div className="modal-overlay" onClick={handleCloseFollowersModal}>
            <div className="followers-modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={handleCloseFollowersModal}>
                ✕
              </button>
              <h3>{followersModal.type === 'followers' ? '👥 Takipçiler' : '✨ Takip Edilenler'}</h3>
              <div className="followers-list">
                {followersModal.type === 'followers' ? (
                  followersList.length === 0 ? (
                    <p className="followers-empty">Henüz takipçi yok.</p>
                  ) : (
                    followersList.map((user) => (
                      <div key={user.id} className="follower-item">
                        <div className="follower-info">
                          <span className="follower-name">{user.displayName}</span>
                          <span className="follower-username">@{user.username}</span>
                        </div>
                        <button
                          className="follower-view-button"
                          onClick={() => {
                            handleViewProfile(user);
                            handleCloseFollowersModal();
                          }}
                        >
                          Profili Gör
                        </button>
                      </div>
                    ))
                  )
                ) : (
                  followingList.length === 0 ? (
                    <p className="followers-empty">Henüz kimseyi takip etmiyor.</p>
                  ) : (
                    followingList.map((user) => (
                      <div key={user.id} className="follower-item">
                        <div className="follower-info">
                          <span className="follower-name">{user.displayName}</span>
                          <span className="follower-username">@{user.username}</span>
                        </div>
                        <button
                          className="follower-view-button"
                          onClick={() => {
                            handleViewProfile(user);
                            handleCloseFollowersModal();
                          }}
                        >
                          Profili Gör
                        </button>
                      </div>
                    ))
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* Avatar Selection Modal */}
        {avatarModalOpen && (
          <div className="modal-overlay" onClick={handleCloseAvatarModal}>
            <div className="edit-modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={handleCloseAvatarModal}>
                ✕
              </button>
              <h3>Avatar Seç</h3>
              <div className="avatar-selection-grid">
                {availableAvatars.length === 0 ? (
                  <p className="avatar-empty-message">
                    Henüz avatar görseli yok. <br />
                    <small>Avatar görsellerini <code>backend/avatars/</code> klasörüne ekleyin.</small>
                  </p>
                ) : (
                  availableAvatars.map((avatar) => (
                    <button
                      key={avatar.name}
                      className={`avatar-option ${userAvatarName === avatar.name ? 'selected' : ''}`}
                      onClick={() => handleSelectAvatar(avatar.name)}
                      title={avatar.name}
                    >
                      <img 
                        src={`http://localhost:8000${avatar.url}`} 
                        alt={avatar.name}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                      {userAvatarName === avatar.name && (
                        <span className="avatar-selected-badge">✓</span>
                      )}
                    </button>
                  ))
                )}
              </div>
              <div className="edit-actions">
                <button className="cancel-button" onClick={handleCloseAvatarModal}>
                  Kapat
                </button>
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

        {/* Comment Selection Modal */}
        {commentModalOpen && commentingItem && (
          <div className="modal-overlay" onClick={closeCommentModal}>
            <div className="comment-modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={closeCommentModal}>
                ✕
              </button>
              <h3>Yorum Yap</h3>
              <p className="comment-modal-subtitle">Aşağıdaki yorumlardan birini seçin:</p>
              <div className="predefined-comments">
                {predefinedComments.map((comment, index) => (
                  <button
                    key={index}
                    className="comment-option"
                    onClick={() => handleAddComment(comment)}
                  >
                    {comment}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* View Comments Modal */}
        {viewingComments && (
          <div className="modal-overlay" onClick={closeViewComments}>
            <div className="comments-view-modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={closeViewComments}>
                ✕
              </button>
              <h3>Yorumlar</h3>
              <p className="comments-view-subtitle">
                {viewingComments.item.filename} için {viewingComments.comments.length} yorum
              </p>
              <div className="comments-list">
                {viewingComments.comments.length === 0 ? (
                  <p className="no-comments">Henüz yorum yok.</p>
                ) : (
                  viewingComments.comments.map((comment) => (
                    <div key={comment.id} className="comment-item">
                      <div className="comment-header">
                        {comment.avatar_name ? (
                          <img 
                            src={`http://localhost:8000/avatars/${comment.avatar_name}`} 
                            alt={comment.displayName}
                            className="comment-avatar"
                          />
                        ) : (
                          <div className="comment-avatar-placeholder">
                            {comment.displayName && typeof comment.displayName === 'string' 
                              ? comment.displayName.charAt(0).toUpperCase() 
                              : '?'}
                          </div>
                        )}
                        <div className="comment-user-info">
                          <span className="comment-display-name">{comment.displayName}</span>
                          <span className="comment-username">@{comment.username}</span>
                        </div>
                      </div>
                      <p className="comment-text">{comment.comment_text}</p>
                      <span className="comment-time">
                        {new Date(comment.timestamp * 1000).toLocaleDateString('tr-TR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  ))
                )}
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
