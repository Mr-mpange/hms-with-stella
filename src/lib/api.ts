import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { io, Socket } from 'socket.io-client';

// API Base URL
// Production: uses VITE_API_URL (defaults to /api for same-origin Hostinger deployment)
// Development: uses VITE_API_URL or falls back to localhost:8000
const getBaseURL = (): string => {
  if (import.meta.env.PROD) {
    return import.meta.env.VITE_API_URL || '/api';
  }
  return import.meta.env.VITE_API_URL || 'https://mpanges.com/api';
};

// Create axios instance for API calls
const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // Increased back to 30s for mobile payments (they can be slow)
});

// Add auth token to requests
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('auth_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      // Only redirect if not already on auth page to prevent loops
      if (window.location.pathname !== '/auth') {
        window.location.href = '/auth';
      }
    }
    return Promise.reject(error);
  }
);

// Socket.io client for real-time updates
let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    const socketURL = import.meta.env.PROD 
      ? 'https://mpanges.com' 
      : (import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000');
    
    socket = io(socketURL, {
      auth: {
        token: localStorage.getItem('auth_token')
      },
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {

    });

    socket.on('disconnect', () => {

    });

    socket.on('connect_error', (error: Error) => {

    });
  }
  return socket;
};

export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export default api;
