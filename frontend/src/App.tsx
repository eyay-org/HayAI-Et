import React, { useState, useRef } from "react";
import axios from "axios";
import api from "./api";
import "./App.css";
import Login from "./components/Login";
import Register from "./components/Register";

// API URL - uses environment variable in production, localhost in development
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

type TransformMode =
  | "normal"
  | "oil"
  | "neon"
  | "inverse"
  | "anime"
  | "cartoon"
  | "comic"
  | "space";

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
  {
    key: "space",
    label: "🚀 Space Adventure",
    description: "Uzay temalı bir macera.",
    emoji: "🪐",
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
  visibility: 'public' | 'private';
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
    visibility?: 'public' | 'private';
    title?: string;
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
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [titlePresetId, setTitlePresetId] = useState<number>(1);
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  // Profile state
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  // Profile state
  const [bioModalOpen, setBioModalOpen] = useState(false);
  const [predefinedBios, setPredefinedBios] = useState<{ id: number; text: string }[]>([]);
  const [selectedBioId, setSelectedBioId] = useState<number | null>(null);
  const [userFollowers, setUserFollowers] = useState<number>(0);
  const [userFollowing, setUserFollowing] = useState<number>(0);
  const [userAvatar, setUserAvatar] = useState<string | null>(null); // Current user's avatar URL
  const [userAvatarName, setUserAvatarName] = useState<string | null>(null); // Current user's avatar filename
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [availableAvatars, setAvailableAvatars] = useState<AvatarInfo[]>([]);
  const [viewingProfile, setViewingProfile] = useState<UserProfile | null>(null); // Başkasının profilini görüntüleme
  const [viewingProfileStats, setViewingProfileStats] = useState<{ followers: number, following: number } | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [followersModal, setFollowersModal] = useState<{ type: 'followers' | 'following', userId: number } | null>(null);
  const [followersList, setFollowersList] = useState<UserProfile[]>([]);
  const [followingList, setFollowingList] = useState<UserProfile[]>([]);
  const [activePage, setActivePage] = useState<'home' | 'search' | 'discover'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedUserIsFollowing, setSelectedUserIsFollowing] = useState<boolean>(false);
  const searchAbortController = React.useRef<AbortController | null>(null);
  const searchDelayRef = React.useRef<number | undefined>(undefined);
  // Comment modal state
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [commentingItem, setCommentingItem] = useState<GalleryItem | null>(null);
  const [predefinedComments, setPredefinedComments] = useState<{ id: number; text: string }[]>([]);
  const [predefinedTitles, setPredefinedTitles] = useState<{ id: number; text: string }[]>([]);
  const [viewingComments, setViewingComments] = useState<{ item: GalleryItem, comments: Comment[] } | null>(null);
  // Registration state
  const [showRegister, setShowRegister] = useState(false);

  const selectedModeMeta = MODE_LOOKUP[selectedMode] ?? MODE_OPTIONS[0];

  // Helper function to add Turkish possessive suffix
  const addTurkishPossessive = (name: string): string => {
    if (!name || name.length === 0) return name;

    // İsimden kesme işaretini ayır (Eğer varsa temizleyelim)
    const cleanName = name.replace(/'/g, "");

    // Son harfi al
    const lastChar = cleanName[cleanName.length - 1].toLowerCase();

    // Türkçe sesli harfler
    const vowels = ['a', 'e', 'ı', 'i', 'o', 'ö', 'u', 'ü'];

    // İsim içindeki son sesli harfi bulmamız gerekiyor (Ünlü uyumu için)
    // İsmi tersten tarayıp ilk karşılaştığımız sesli harfi alacağız
    let lastVowel = '';
    for (let i = cleanName.length - 1; i >= 0; i--) {
      const char = cleanName[i].toLowerCase();
      if (vowels.includes(char)) {
        lastVowel = char;
        break;
      }
    }

    // Eğer isimde hiç sesli harf yoksa (örn: "Sky") varsayılan olarak ince 'i' varmış gibi davranabiliriz 
    // ya da son harfin okunuşuna göre (Yabancı isimler) bir mantık kurmak gerekir. 
    // Şimdilik varsayılanı 'e/i' grubu kabul edelim.
    if (!lastVowel) lastVowel = 'e';

    // Ek belirleme mantığı (4'lü uyum kuralı: ı/i/u/ü)
    let suffixVowel = '';

    // Kalınlık-Incelik ve Düzlük-Yuvarlaklık kuralları
    if (['a', 'ı'].includes(lastVowel)) {
      suffixVowel = 'ı';
    } else if (['e', 'i'].includes(lastVowel)) {
      suffixVowel = 'i';
    } else if (['o', 'u'].includes(lastVowel)) {
      suffixVowel = 'u';
    } else if (['ö', 'ü'].includes(lastVowel)) {
      suffixVowel = 'ü';
    }

    // Son harf sesli mi? (Kaynaştırma harfi 'n' gerekir mi?)
    if (vowels.includes(lastChar)) {
      return `${name}'n${suffixVowel}n`; // Ali -> Ali'nin, Esra -> Esra'nın
    } else {
      return `${name}'${suffixVowel}n`;  // Ahmet -> Ahmet'in, Yusuf -> Yusuf'un
    }
  };

  React.useEffect(() => {
    const storedAuth = localStorage.getItem('hayai-auth');
    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth);
        if (parsed?.username) {
          setIsAuthenticated(true);
          setCurrentUser(parsed.username);
          setActivePage('home');

          // Fetch full profile
          const storedUserId = localStorage.getItem("userId");
          if (storedUserId) {
            api.get(`${API_URL}/users/${storedUserId}`)
              .then(res => setCurrentUserProfile(res.data))
              .catch(err => console.error("Error fetching current user profile:", err));
          }
        }
      } catch (error) {
        console.error('Error loading auth state:', error);
      }
    }
  }, []);

  // Load predefined bios
  React.useEffect(() => {
    const loadPredefinedBios = async () => {
      try {
        const response = await api.get<{ bios: { id: number; text: string }[] }>(`${API_URL}/api/presets/bios`);
        setPredefinedBios(response.data.bios);
      } catch (error) {
        console.error('Error loading predefined bios:', error);
      }
    };
    loadPredefinedBios();
  }, []);

  // Get current user ID from localStorage (set during login)
  const getCurrentUserId = React.useCallback((): number | null => {
    if (!currentUser) {
      console.log("getCurrentUserId: No currentUser");
      return null;
    }
    const storedUserId = localStorage.getItem("userId");
    console.log("getCurrentUserId: currentUser =", currentUser, ", storedUserId =", storedUserId);
    if (storedUserId) {
      return parseInt(storedUserId, 10);
    }
    return null;
  }, [currentUser]);

  // Get current user avatar URL - fetch from backend
  const getCurrentUserAvatar = React.useCallback(async (): Promise<string | null> => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return null;
    try {
      // Fetch user profile to get avatar name
      const response = await api.get(`${API_URL}/users/${currentUserId}`);
      const avatarName = response.data.avatar_name;
      if (avatarName) {
        setUserAvatarName(avatarName);
        return `${API_URL}/avatars/${avatarName}`;
      }
      setUserAvatarName(null);
      return null;
    } catch (error) {
      console.error('Error fetching user avatar:', error);
      return null;
    }
  }, [getCurrentUserId]);

  // Update avatar when current user changes
  React.useEffect(() => {
    if (currentUser) {
      (async () => {
        const avatarUrl = await getCurrentUserAvatar();
        setUserAvatar(avatarUrl);
      })();
    }
  }, [currentUser, getCurrentUserAvatar]);

  // Load available avatars
  React.useEffect(() => {
    const loadAvatars = async () => {
      try {
        const response = await api.get<AvatarInfo[]>(`${API_URL}/avatars`);
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
      await api.put(`${API_URL}/users/${currentUserId}/avatar`, null, {
        params: { avatar_name: avatarName }
      });
      setUserAvatarName(avatarName);
      setUserAvatar(`${API_URL}/avatars/${avatarName}`);
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
      api.get(`${API_URL}/users/${viewingProfile.id}/follow-stats`)
        .then(response => {
          setViewingProfileStats(response.data);
        })
        .catch(error => {
          console.error('Error fetching follow stats:', error);
          setViewingProfileStats({ followers: 0, following: 0 });
        });

      // Check if current user is following this profile
      const currentUserId = getCurrentUserId();
      if (currentUserId) {
        api.get(`${API_URL}/users/${currentUserId}/is-following/${viewingProfile.id}`)
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
  }, [viewingProfile, currentUser, getCurrentUserId]);

  // Fetch own follow stats
  React.useEffect(() => {
    if (!viewingProfile && currentUser) {
      const currentUserId = getCurrentUserId();
      if (currentUserId) {
        api.get(`${API_URL}/users/${currentUserId}/follow-stats`)
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
  }, [viewingProfile, currentUser, getCurrentUserId]);

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
        const response = await api.get<UserProfile>(`${API_URL}/users/${targetUserId}`);
        // Backend'den gelen veriyi işle
        const userPosts = response.data.posts || [];

        const currentUserId = getCurrentUserId(); // Bunu döngüden önce al

        const backendGallery: GalleryItem[] = userPosts.map((post, index) => ({
          id: `backend_${index}_${post.original_filename || index}`,
          original: post.original,  // Full Cloudinary URL from backend
          improved: post.improved,  // Full Cloudinary URL from backend
          filename: post.original_filename || "AI Çizimi",
          originalFilename: post.original_filename || `post_${index}`,
          timestamp: Date.now(),
          title: post.title || "Benim Eserim 🖼️",
          emoji: "🎨",
          likeCount: post.like_count || 0,
          isLiked: currentUserId ? (post.liked_by || []).includes(currentUserId) : false,
          mode: post.mode,
          commentCount: post.comment_count || 0,
          comments: post.comments || [],
          visibility: post.visibility || 'public',
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

  }, [viewingProfile, currentUser, currentView, activePage, getCurrentUserId]);

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
        const response = await api.get<SearchApiResponse>(
          `${API_URL}/users/search`,
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

  const handleUpdateBio = async () => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || !selectedBioId) return;

    try {
      const response = await api.put(`${API_URL}/users/${currentUserId}/bio`, null, {
        params: { bio_preset_id: selectedBioId }
      });

      // Update local profile state
      if (currentUserProfile) {
        setCurrentUserProfile({
          ...currentUserProfile,
          bio: response.data.bio
        });
      }

      setBioModalOpen(false);
      // Clear search results to force re-fetch if user goes back to search
      setSearchResults([]);
      setSearchQuery('');
      setMessage({
        type: "success",
        text: "✅ Biyografi güncellendi!",
      });
    } catch (error: any) {
      console.error('Error updating bio:', error);
      setMessage({
        type: "error",
        text: `❌ Biyografi güncellenemedi: ${error.response?.data?.detail || error.message}`,
      });
    }
  };

  const handleLoginSuccess = (username: string) => {
    setIsAuthenticated(true);
    setCurrentUser(username);
    setSelectedUser(null);
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
    setActivePage('home');
    localStorage.setItem('hayai-auth', JSON.stringify({ username, timestamp: Date.now() }));

    // Fetch full profile immediately after login
    const storedUserId = localStorage.getItem("userId");
    if (storedUserId) {
      api.get(`${API_URL}/users/${storedUserId}`)
        .then(res => setCurrentUserProfile(res.data))
        .catch(err => console.error("Error fetching current user profile:", err));
    }
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
    localStorage.removeItem('userId');
    setCurrentUserProfile(null);
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

    const isLiked = item.isLiked;

    // 1. Optimistic Update
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
      if (isLiked) {
        // Unlike
        await api.delete(`${API_URL}/api/posts/${item.originalFilename}/like`);
      } else {
        // Like
        await api.post(`${API_URL}/api/posts/${item.originalFilename}/like`, {});
      }

    } catch (error) {
      // Hata olursa eski haline geri döndür (Rollback)
      console.error("Like hatası:", error);
      setGallery(oldGallery);
      setMessage({ type: "error", text: "Beğeni işlemi başarısız oldu." });
    }
  };



  const handleToggleVisibility = async (item: GalleryItem) => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) return;

    const newVisibility = item.visibility === 'public' ? 'private' : 'public';

    // Optimistic Update
    const oldGallery = [...gallery];
    setGallery(prev => prev.map(gItem => {
      if (gItem.id === item.id) {
        return { ...gItem, visibility: newVisibility };
      }
      return gItem;
    }));

    try {
      await api.patch(`${API_URL}/api/posts/${item.originalFilename}/visibility`, {
        visibility: newVisibility
      });

      setMessage({
        type: "success",
        text: `✅ Görünürlük değiştirildi: ${newVisibility === 'public' ? 'Herkese Açık 🌍' : 'Gizli 🔒'}`
      });
    } catch (error: any) {
      console.error("Visibility update error:", error);
      setGallery(oldGallery); // Rollback
      setMessage({
        type: "error",
        text: `❌ Görünürlük değiştirilemedi: ${error.response?.data?.detail || error.message}`
      });
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
    // Note: user_id is extracted from JWT token by backend
    // Note: mode is sent in the second step

    try {
      // Step 1: Upload Original Image
      const uploadResponse = await api.post<{ image_id: string; url: string }>(
        `${API_URL}/api/uploads`,
        formData,
        {
          headers: {
            "Content-Type": undefined,
          },
        }
      );

      const imageId = uploadResponse.data.image_id;
      const originalUrl = uploadResponse.data.url;

      setMessage({ type: "info", text: "AI dönüşümü yapılıyor..." });

      // Step 2: Transform Image
      const transformResponse = await api.post<{ post_id: string; ai_image_url: string; status: string }>(
        `${API_URL}/api/ai/transform`,
        {
          image_id: imageId,
          theme: selectedMode,
          visibility: visibility,
          title_preset_id: titlePresetId,
        }
      );

      setMessage({
        type: "success",
        text: `✅ Başarılı! Dosya ${MODE_LOOKUP[selectedMode]?.label ?? selectedMode} modunda işlendi ve galeriye eklendi!`,
      });

      // Set uploaded images for display
      const newImages = {
        original: originalUrl,
        improved: transformResponse.data.ai_image_url,
        filename: selectedFile.name,
        mode: selectedMode,
      };
      setUploadedImages(newImages);

      // Get title text from preset
      const selectedTitle = predefinedTitles.find(t => t.id === titlePresetId)?.text || "Benim Eserim 🖼️";

      // Add to gallery
      const newGalleryItem: GalleryItem = {
        id: Date.now().toString(),
        original: newImages.original,
        improved: newImages.improved,
        filename: newImages.filename,
        originalFilename: imageId, // Store image_id for deletion
        timestamp: Date.now(),
        likeCount: 0,
        isLiked: false,
        mode: selectedMode,
        commentCount: 0,
        comments: [],
        title: selectedTitle,
        emoji: selectedModeMeta?.emoji ?? "🎨",
        visibility: visibility
      };
      setGallery(prev => [newGalleryItem, ...prev]);

      // Reset form
      setSelectedFile(null);
      setPreview("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error: any) {
      if (error.response?.status === 413) {
        setMessage({
          type: "error",
          text: "❌ Dosya boyutu 10MB limitini aşıyor.",
        });
      } else {
        setMessage({
          type: "error",
          text: `❌ Hata: ${typeof error.response?.data?.detail === "object"
            ? JSON.stringify(error.response?.data?.detail)
            : error.response?.data?.detail || error.message
            }`,
        });
      }
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
        await api.delete(`${API_URL}/delete/${item.originalFilename}`);
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
        api.delete(`${API_URL}/delete/${item.originalFilename}`)
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


  // Load predefined comments on mount
  React.useEffect(() => {
    const loadPredefinedComments = async () => {
      try {
        const response = await api.get<{ comments: { id: number; text: string }[] }>(`${API_URL}/api/presets`);
        setPredefinedComments(response.data.comments);
      } catch (error) {
        console.error('Error loading predefined comments:', error);
        // Fallback to default comments
        setPredefinedComments([
          { id: 1, text: "Harika görünüyor! 🌟" },
          { id: 2, text: "Çok yeteneklisin! 👏" },
          { id: 3, text: "Bayıldım! 😍" },
          { id: 4, text: "Kullandığın renkler müthiş! 🎨" },
          { id: 5, text: "Çizimlerin çok gerçekçi! ✨" }
        ]);
      }
    };
    loadPredefinedComments();
  }, []);

  // Load predefined titles on mount
  React.useEffect(() => {
    const loadPredefinedTitles = async () => {
      try {
        const response = await api.get<{ titles: { id: number; text: string }[] }>(`${API_URL}/api/presets/titles`);
        setPredefinedTitles(response.data.titles);
      } catch (error) {
        console.error('Error loading predefined titles:', error);
        // Fallback
        setPredefinedTitles([
          { id: 1, text: "Benim Eserim 🖼️" },
          { id: 2, text: "Buna Bakın! 👀" },
          { id: 3, text: "Komik Çizim 🤪" },
          { id: 4, text: "Uzay Macerası 🌌" },
          { id: 5, text: "Sürpriz! 🎁" }
        ]);
      }
    };
    loadPredefinedTitles();
  }, []);

  const openCommentModal = (item: GalleryItem) => {
    setCommentingItem(item);
    setCommentModalOpen(true);
  };

  const closeCommentModal = () => {
    setCommentModalOpen(false);
    setCommentingItem(null);
  };

  const handleAddComment = async (presetId: number) => {
    console.log('handleAddComment called with presetId:', presetId);
    const currentUserId = getCurrentUserId();
    if (!currentUserId || !commentingItem) {
      console.log('Missing currentUserId or commentingItem:', { currentUserId, commentingItem });
      setMessage({ type: "error", text: "Yorum yapmak için giriş yapmalısınız!" });
      return;
    }

    if (!commentingItem.originalFilename) {
      console.error('commentingItem.originalFilename is missing:', commentingItem);
      setMessage({ type: "error", text: "❌ Gönderi bilgisi bulunamadı!" });
      return;
    }

    try {
      console.log('Sending comment request:', {
        postId: commentingItem.originalFilename,
        presetId: presetId
      });

      const response = await api.post<Comment>(`${API_URL}/api/posts/${commentingItem.originalFilename}/comment`, {
        presetId: presetId
      });

      console.log('Comment response:', response.data);

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
      console.error('Error response:', error.response);
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
    // Check if current user is following this user
    const currentUserId = getCurrentUserId();
    if (currentUserId) {
      api.get(`${API_URL}/users/${currentUserId}/is-following/${user.id}`)
        .then(response => {
          setSelectedUserIsFollowing(response.data.is_following);
        })
        .catch(error => {
          console.error('Error checking follow status:', error);
          setSelectedUserIsFollowing(false);
        });
    } else {
      setSelectedUserIsFollowing(false);
    }
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
    setSelectedUserIsFollowing(false);
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

      await api.post(`${API_URL}/users/${targetUserId}/follow`, null, {
        params: { current_user_id: currentUserId }
      });
      setIsFollowing(true);
      setMessage({
        type: "success",
        text: "✅ Kullanıcı takip edildi!",
      });
      // Refresh stats
      if (viewingProfile) {
        const response = await api.get(`${API_URL}/users/${viewingProfile.id}/follow-stats`);
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

      await api.delete(`${API_URL}/users/${targetUserId}/follow`, {
        params: { current_user_id: currentUserId }
      });
      setIsFollowing(false);
      setMessage({
        type: "success",
        text: "✅ Takipten çıkıldı.",
      });
      // Refresh stats
      if (viewingProfile) {
        const response = await api.get(`${API_URL}/users/${viewingProfile.id}/follow-stats`);
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
    setFollowersModal({ type, userId });
    try {
      if (type === 'followers') {
        const response = await api.get(`${API_URL}/users/${userId}/followers`);
        setFollowersList(response.data.followers);
      } else {
        const response = await api.get(`${API_URL}/users/${userId}/following`);
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
    setSelectedUserIsFollowing(false);
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
    if (showRegister) {
      return (
        <div className="App">
          <Register
            onSuccess={handleLoginSuccess}
            onBackToLogin={() => setShowRegister(false)}
          />
        </div>
      );
    }

    return (
      <div className="App">
        <Login
          onSuccess={handleLoginSuccess}
          onRegisterClick={() => setShowRegister(true)}
        />
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

                    <div className="mode-selector">
                      <label>Görünürlük:</label>
                      <select
                        value={visibility}
                        onChange={(e) => setVisibility(e.target.value as "public" | "private")}
                        className="mode-select"
                        style={{ marginLeft: '10px', padding: '5px' }}
                      >
                        <option value="public">🌍 Herkese Açık</option>
                        <option value="private">🔒 Sadece Ben</option>
                      </select>
                    </div>

                    <div className="mode-selector">
                      <div className="mode-selector-header">
                        <h3>Başlık Seçin</h3>
                        <p>Çiziminiz için bir başlık seçin</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                        {predefinedTitles.map((title) => (
                          <label key={title.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px', borderRadius: '8px', backgroundColor: titlePresetId === title.id ? 'rgba(116, 192, 252, 0.15)' : 'transparent' }}>
                            <input
                              type="radio"
                              name="titlePresetId"
                              value={title.id}
                              checked={titlePresetId === title.id}
                              onChange={(e) => setTitlePresetId(parseInt(e.target.value))}
                              style={{ cursor: 'pointer' }}
                            />
                            <span>{title.text}</span>
                          </label>
                        ))}
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
                              src={`${API_URL}/avatars/${viewingProfile.avatar_name}`}
                              alt={`${viewingProfile.displayName || viewingProfile.username} Avatarı`}
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
                        <p className="profile-display-name">{viewingProfile.displayName || viewingProfile.username}</p>
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
                        <p>{viewingProfile ? viewingProfile.bio : (currentUserProfile?.bio || "Merhaba! Ben HayAI kullanıcısıyım.")}</p>
                        {!viewingProfile && (
                          <button
                            className="edit-bio-button"
                            title="Biyografi düzenle"
                            onClick={() => {
                              setSelectedBioId(null);
                              setBioModalOpen(true);
                            }}
                          >
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

                      {/* Show interests for current user too */}
                      {!viewingProfile && currentUserProfile && currentUserProfile.interests && currentUserProfile.interests.length > 0 && (
                        <div className="profile-interests">
                          <h4>İlgi Alanları:</h4>
                          <div className="profile-tags">
                            {currentUserProfile.interests.map((interest) => (
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
                      <h2>🖼️ {viewingProfile ? `${addTurkishPossessive(viewingProfile.displayName || viewingProfile.username)} Galerisi` : 'Sanat Galerim'}</h2>
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
                                    className="visibility-button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleVisibility(item);
                                    }}
                                    title={item.visibility === 'private' ? "Gizli (Herkese Aç Yap)" : "Herkese Aç (Gizle)"}
                                  >
                                    {item.visibility === 'private' ? '🔒' : '🌍'}
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
                            <span className="search-result-name">{user.displayName || user.username}</span>
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
                          <h3>{selectedUser.displayName || selectedUser.username}</h3>
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
                        <button
                          type="button"
                          className="add-friend-button"
                          onClick={async () => {
                            if (!selectedUser) return;
                            const currentUserId = getCurrentUserId();
                            if (!currentUserId) {
                              setMessage({
                                type: "error",
                                text: "❌ Kullanıcı kimliği bulunamadı. Lütfen tekrar giriş yapın.",
                              });
                              return;
                            }

                            try {
                              if (selectedUserIsFollowing) {
                                await api.delete(`${API_URL}/users/${selectedUser.id}/follow`, {
                                  params: { current_user_id: currentUserId }
                                });
                                setSelectedUserIsFollowing(false);
                                setMessage({
                                  type: "success",
                                  text: "✅ Takipten çıkıldı.",
                                });
                              } else {
                                await api.post(`${API_URL}/users/${selectedUser.id}/follow`, null, {
                                  params: { current_user_id: currentUserId }
                                });
                                setSelectedUserIsFollowing(true);
                                setMessage({
                                  type: "success",
                                  text: "✅ Kullanıcı takip edildi!",
                                });
                              }
                            } catch (error: any) {
                              console.error('Error following/unfollowing user:', error);
                              setMessage({
                                type: "error",
                                text: `❌ İşlem başarısız: ${error.response?.data?.detail || error.message}`,
                              });
                            }
                          }}
                        >
                          {selectedUserIsFollowing ? '✓ Takip Ediliyor' : '➕ Takip Et'}
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

        {/* Bio Selection Modal */}
        {bioModalOpen && (
          <div className="modal-overlay" onClick={() => setBioModalOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setBioModalOpen(false)}>
                ✕
              </button>
              <h3>Biyografi Seçin</h3>
              <div className="avatar-grid" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {predefinedBios.map((bio) => (
                  <button
                    key={bio.id}
                    className={`mode-option ${selectedBioId === bio.id ? 'selected' : ''}`}
                    onClick={() => setSelectedBioId(bio.id)}
                    style={{ width: '100%', textAlign: 'left', padding: '10px' }}
                  >
                    {bio.text}
                  </button>
                ))}
              </div>
              <div className="modal-actions" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="upload-button"
                  onClick={handleUpdateBio}
                  disabled={!selectedBioId}
                >
                  Güncelle
                </button>
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
                        src={`${API_URL}${avatar.url}`}
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
                {predefinedComments.map((comment) => (
                  <button
                    key={comment.id}
                    type="button"
                    className="comment-option"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Comment button clicked:', comment.id);
                      handleAddComment(comment.id);
                    }}
                  >
                    {comment.text}
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
                            src={`${API_URL}/avatars/${comment.avatar_name}`}
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
