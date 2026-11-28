import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';
import { connectSocket, getSocket } from '../services/socket';
import useAuthStore from '../store/useAuthStore';

// Module-level shared store so unread badge updates propagate immediately
// between the notification drawer/page and the header bell icon across panels.
const sharedState = {
  notifications: [],
  unreadCount: 0,
};
const subscribers = new Set();

function publish(next) {
  if (typeof next.notifications !== 'undefined') {
    sharedState.notifications = next.notifications;
  }
  if (typeof next.unreadCount !== 'undefined') {
    sharedState.unreadCount = Math.max(0, Number(next.unreadCount) || 0);
  }
  const snapshot = {
    notifications: sharedState.notifications,
    unreadCount: sharedState.unreadCount,
  };
  subscribers.forEach((fn) => fn(snapshot));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('zeebac-notifications-updated', {
        detail: { unreadCount: sharedState.unreadCount },
      })
    );
  }
}

/**
 * Custom hook for notification management
 * - Fetches notifications from backend
 * - Tracks unread count (shared across all mounted consumers)
 * - Mark as read / Mark all as read (optimistic + immediate badge sync)
 */
export default function useNotifications() {
  const [state, setState] = useState(() => ({
    notifications: sharedState.notifications,
    unreadCount: sharedState.unreadCount,
  }));
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    subscribers.add(setState);
    setState({
      notifications: sharedState.notifications,
      unreadCount: sharedState.unreadCount,
    });
    return () => {
      subscribers.delete(setState);
    };
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await apiClient.get('/notifications/unread-count');
      publish({ unreadCount: res.data?.count || 0 });
    } catch {
      // Silently fail — don't block UI
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get('/notifications?limit=30');
      const rows = res.data?.data || [];
      publish({
        notifications: rows,
        unreadCount: rows.filter((n) => !n.isRead).length,
      });
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (id) => {
    const target = sharedState.notifications.find((n) => n._id === id);
    const wasUnread = target ? !target.isRead : true;
    publish({
      notifications: sharedState.notifications.map((n) =>
        n._id === id ? { ...n, isRead: true } : n
      ),
      unreadCount: wasUnread
        ? Math.max(0, sharedState.unreadCount - 1)
        : sharedState.unreadCount,
    });

    try {
      await apiClient.patch(`/notifications/${id}/read`);
    } catch {
      fetchUnreadCount();
    }
  }, [fetchUnreadCount]);

  const markAllAsRead = useCallback(async () => {
    publish({
      notifications: sharedState.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    });

    try {
      await apiClient.patch('/notifications/read-all');
    } catch {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  // Fetch unread count on mount (lightweight)
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Live updates: push new notifications instantly over the socket
  useEffect(() => {
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    connectSocket(token);
    const socket = getSocket();
    if (!socket) return;

    const handleNewNotification = (notif) => {
      const alreadyExists = sharedState.notifications.some((n) => n._id === notif?._id);
      if (alreadyExists) return;
      publish({
        notifications: [notif, ...sharedState.notifications],
        unreadCount: sharedState.unreadCount + 1,
      });
    };

    socket.on('new_notification', handleNewNotification);
    return () => socket.off('new_notification', handleNewNotification);
  }, []);

  return {
    notifications: state.notifications,
    unreadCount: state.unreadCount,
    isLoading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  };
}
