import axios from 'axios';

// API URL - uses environment variable in production, localhost in development
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add the auth token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('hayai-token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle 401s (optional but recommended)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            // Handle unauthorized access (e.g., redirect to login or clear storage)
            // For now, we'll just let the component handle it, but we could clear token here
            // localStorage.removeItem('hayai-token');
            // localStorage.removeItem('hayai-auth');
        }
        return Promise.reject(error);
    }
);

export default api;
