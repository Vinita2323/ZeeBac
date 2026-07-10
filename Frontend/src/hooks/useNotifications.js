import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';

/**
 * Custom hook for notification management
 * - Fetches notifications from backend
 * - Tracks unread count
 * - Mark as read / Mark all as read
 */
export default function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await apiClient.get('/notifications/unread-count');
      setUnreadCount(res.data?.count || 0);
    } catch (err) {
      // Silently fail — don't block UI
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get('/notifications?limit=30');
      setNotifications(res.data?.data || []);
      setUnreadCount(
        (res.data?.data || []).filter((n) => !n.isRead).length
      );
    } catch (err) {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (id) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {}
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await apiClient.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {}
  }, []);

  // Fetch unread count on mount (lightweight)
  useEffect(() => {
    fetchUnreadCount();
    // Poll every 60 seconds for new notifications
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    isLoading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  };
}
