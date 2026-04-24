'use client';

import React, { useState, useEffect } from 'react';
import styles from './NotificationCenter.module.css';
import { Notification } from '../types';

interface NotificationCenterProps {
  userId: string;
  onClose?: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ userId, onClose }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await fetch(
          `http://localhost:5001/api/notifications?userId=${userId}`
        );
        if (!response.ok) throw new Error('Failed to fetch notifications');
        const data = await response.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [userId]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await fetch(`http://localhost:5001/api/notifications/${notificationId}/read`, {
        method: 'POST',
      });
      setNotifications(
        notifications.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'approval_pending':
        return '📋';
      case 'approved':
        return '✅';
      case 'rejected':
        return '❌';
      case 'deadline_warning':
        return '⏰';
      default:
        return '📬';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'approval_pending':
        return '#f59e0b';
      case 'approved':
        return '#10b981';
      case 'rejected':
        return '#ef4444';
      case 'deadline_warning':
        return '#8b5cf6';
      default:
        return '#64748b';
    }
  };

  return (
    <div className={styles.notificationCenter}>
      <div className={styles.header}>
        <h2>Notifications</h2>
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
        {onClose && <button className={styles.closeBtn} onClick={onClose}>✕</button>}
      </div>

      <div className={styles.content}>
        {loading ? (
          <div className={styles.message}>Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className={styles.message}>No notifications</div>
        ) : (
          <div className={styles.notificationsList}>
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`${styles.notificationItem} ${!notification.read ? styles.unread : ''}`}
                onClick={() => !notification.read && handleMarkAsRead(notification.id)}
              >
                <div
                  className={styles.icon}
                  style={{ color: getNotificationColor(notification.type) }}
                >
                  {getNotificationIcon(notification.type)}
                </div>
                <div className={styles.content}>
                  <div className={styles.title}>{notification.title}</div>
                  <div className={styles.message}>{notification.message}</div>
                  <div className={styles.timestamp}>
                    {new Date(notification.createdAt).toLocaleString()}
                  </div>
                </div>
                {!notification.read && <div className={styles.unreadIndicator} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
