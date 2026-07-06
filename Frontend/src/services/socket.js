import { io } from 'socket.io-client';
import { API_BASE_URL } from './api';

// Create a singleton instance
let socket;

export const connectSocket = (token) => {
  if (socket) {
    socket.disconnect();
  }

  // Extract base URL from API_BASE_URL (removing /api)
  const baseUrl = API_BASE_URL.replace('/api', '');

  socket = io(baseUrl, {
    auth: {
      token,
    },
    withCredentials: true,
  });

  socket.on('connect', () => {
    console.log('Connected to socket server:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
  });

  return socket;
};

export const getSocket = () => {
  if (!socket) {
    console.warn('Socket is not initialized. Call connectSocket first.');
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
