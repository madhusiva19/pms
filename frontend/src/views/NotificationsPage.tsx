'use client';

import viewStyles from '../styles/views.module.css';
// Notifications page: displays evaluation alerts and lets users mark them as read.
import { useState, useEffect } from 'react';
import Link from '../lib/routing';
import { getNotifications, markNotificationRead } from '../lib/api';
import Sidebar from '../components/Sidebar';
import { ROUTES } from '../lib/constants';
import { formatNotificationTime } from '../lib/formatters';
import type { EntityId, NotificationItem } from '../types';

export default function Notifications() {
  // Stores all notifications returned from the backend.
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  // Tracks notification IDs that are already read in the current UI state.
  const [readNotifications, setReadNotifications] = useState<Set<EntityId>>(new Set());
  // Controls loading and loaded notification states.
  const [loading, setLoading] = useState(true);
  // Stores a readable message when the notification API cannot be reached.
  const [errorMessage, setErrorMessage] = useState('');

  // Loads notifications and initializes the local read-status set.
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await getNotifications();
        const notificationRows = Array.isArray(response.data) ? response.data : [];
        setNotifications(notificationRows);
        setReadNotifications(
          new Set(notificationRows.filter((notif) => notif.is_read).map((notif) => notif.id))
        );
        setErrorMessage('');
      } catch (error) {
        console.error('Error fetching notifications:', error);
        setErrorMessage('Could not load notifications. Please check that the Flask backend is running on port 8000.');
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
    const refreshTimer = window.setInterval(fetchNotifications, 5000);
    return () => window.clearInterval(refreshTimer);
  }, []);

  // Chooses the icon shown beside a notification based on its type.
  const getNotificationIcon = (type?: string) => {
    switch (type) {
      case 'new_evaluation':
        return '📋';
      case 'rejection':
        return '❌';
      case 'approval_required':
        return '👤';
      case 'approval_approved':
        return '✅';
      case 'status_update':
        return '🔄';
      case 'enquiry':
        return '❓';
      case 'cutoff_reminder':
        return '🔔';
      default:
        return '📌';
    }
  };

  // Chooses the left border color that visually groups notification types.
  const getNotificationColor = (type?: string) => {
    switch (type) {
      case 'new_evaluation':
        return 'border-primary';
      case 'rejection':
        return 'border-red-600';
      case 'approval_required':
        return 'border-purple-600';
      case 'approval_approved':
        return 'border-green-600';
      case 'status_update':
        return 'border-blue-600';
      case 'enquiry':
        return 'border-cyan-600';
      case 'cutoff_reminder':
        return 'border-orange-500';
      default:
        return 'border-gray-400';
    }
  };

  // Optimistically marks one notification as read, then persists that change through the API.
  const markAsRead = async (notificationId: EntityId) => {
    setReadNotifications(prev => new Set([...prev, notificationId]));
    setNotifications((prev) =>
      prev.map((notif) => notif.id === notificationId ? { ...notif, is_read: true } : notif)
    );

    try {
      await markNotificationRead(notificationId);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Marks all notifications as read in the current UI state.
  const markAllAsRead = () => {
    const allIds = new Set(notifications.map(notif => notif.id));
    setReadNotifications(allIds);
  };

  return (
    <div className={viewStyles.v031}>
      <Sidebar />

      <main className={viewStyles.v032}>
        <div className={viewStyles.v136}>
          {/* Breadcrumb */}
          <div className={viewStyles.v034}>
            <Link href={ROUTES.myTeam} className={viewStyles.v035}>
              My Team
            </Link>
            {' > Notifications'}
          </div>

          {/* Header */}
          <div className={viewStyles.v137}>
            <div>
              <h1 className={viewStyles.v055}>Notifications</h1>
              <p className={viewStyles.v138}>
                {readNotifications.size}/{notifications.length} read
              </p>
            </div>
            <button 
              onClick={markAllAsRead}
              className={viewStyles.v139}
            >
              Mark all as read
            </button>
          </div>

          {/* Notification cards update read state when clicked. */}
          {loading ? (
            <div className={viewStyles.v039}>Loading...</div>
          ) : errorMessage ? (
            <div className={viewStyles.v140}>
              {errorMessage}
            </div>
          ) : notifications.length > 0 ? (
            <div className={viewStyles.v129}>
              {notifications.map((notif) => {
                const isRead = readNotifications.has(notif.id) || notif.is_read;
                return (
                  <div
                    key={String(notif.id)}
                    onClick={() => markAsRead(notif.id)}
                    className={`${viewStyles.v153} ${getNotificationColor(notif.type)} ${isRead ? viewStyles.v154 : viewStyles.v155}`}
                  >
                    <div className={viewStyles.v141}>
                      <div className={viewStyles.v142}>{getNotificationIcon(notif.type)}</div>
                      <div className={viewStyles.v093}>
                        <h3 className={`${viewStyles.v156} ${isRead ? viewStyles.v157 : viewStyles.v158}`}>
                          {notif.title}
                          {!isRead && (
                            <span className={viewStyles.v143}></span>
                          )}
                        </h3>
                        <p className={`${viewStyles.v159} ${isRead ? viewStyles.v157 : viewStyles.v082}`}>
                          {notif.description}
                        </p>
                      </div>
                      <div className={`${viewStyles.v160} ${isRead ? viewStyles.v161 : viewStyles.v157}`}>
                        {formatNotificationTime(notif.timestamp)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={viewStyles.v144}>
              <h2 className={viewStyles.v145}>No notifications yet</h2>
              <p className={viewStyles.v146}>
                Workflow updates will appear here after you save drafts, submit evaluations, approve, or reject.
              </p>
            </div>
          )}

          {/* Static helper cards explain the evaluation process and approver levels. */}
          <div className={viewStyles.v147}>
            {/* Process Flow */}
            <div className={viewStyles.v148}>
              <h3 className={viewStyles.v149}>Process Flow (Overview)</h3>
              <ul className={viewStyles.v150}>
                {[
                  'Self Evaluation',
                  'Sub Dept Admin Evaluation',
                  'Dept Admin Approval',
                  'Branch Admin Review',
                  'Country Admin Final Approval'
                ].map((step, idx) => (
                  <li key={idx} className={viewStyles.v151}>
                    <span className={viewStyles.v152}>→</span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>

            {/* Roles & Levels */}
            <div className={viewStyles.v148}>
              <h3 className={viewStyles.v149}>Roles & Levels</h3>
              <ul className={viewStyles.v150}>
                {[
                  { icon: '👤', label: 'Level 1: HQ Admin' },
                  { icon: '👥', label: 'Level 2: Country Admin' },
                  { icon: '🏢', label: 'Level 3: Branch Admin' },
                  { icon: '⭐', label: 'Level 4: Dept Admin' },
                  { icon: '⭐', label: 'Level 4: Sub Dept Admin' }

                ].map((role, idx) => (
                  <li key={idx} className={viewStyles.v151}>
                    <span>{role.icon}</span>
                    {role.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
