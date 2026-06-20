import viewStyles from '../../styles/views.module.css';
// Notifications page: displays evaluation alerts and lets users mark them as read.
import { useState, useEffect } from 'react';
import Link, { useRoutes } from '../../lib/routing';
import { getNotifications, markNotificationRead } from '../../lib/api';
import Sidebar from '../sidebar/Sidebar';
import LoadingScreen from '../LoadingScreen';
import { formatNotificationTime } from '../../lib/formatters';
import type { EntityId, NotificationItem } from '../../lib/types';

export default function Notifications() {
  const routes = useRoutes();
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
  }, []);

  // Chooses the icon shown beside a notification based on its type.
  const getNotificationIcon = (type?: string) => {
    switch (type) {
      case 'new_evaluation':    return '📋';
      case 'rejection':         return '❌';
      case 'approval_required': return '👤';
      case 'approval_approved': return '✅';
      case 'status_update':     return '🔄';
      case 'enquiry':           return '❓';
      case 'cutoff_reminder':   return '🔔';
      default:                  return '📌';
    }
  };

  // Returns a CSS module key for the left border colour — replaces broken Tailwind strings.
  const getNotificationTypeClass = (type?: string): string => {
    switch (type) {
      case 'new_evaluation':    return 'notifTypeBlue';
      case 'rejection':         return 'notifTypeRed';
      case 'approval_required': return 'notifTypePurple';
      case 'approval_approved': return 'notifTypeGreen';
      case 'status_update':     return 'notifTypeBlue';
      case 'enquiry':           return 'notifTypeCyan';
      case 'cutoff_reminder':   return 'notifTypeOrange';
      default:                  return 'notifTypeGray';
    }
  };

  // Returns a CSS module key for the icon wrapper background.
  const getNotificationIconClass = (type?: string): string => {
    switch (type) {
      case 'new_evaluation':    return 'notifIconBlue';
      case 'rejection':         return 'notifIconRed';
      case 'approval_required': return 'notifIconPurple';
      case 'approval_approved': return 'notifIconGreen';
      case 'status_update':     return 'notifIconBlue';
      case 'enquiry':           return 'notifIconCyan';
      case 'cutoff_reminder':   return 'notifIconOrange';
      default:                  return '';
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

  const unreadCount = notifications.filter(n => !readNotifications.has(n.id) && !n.is_read).length;

  return (
    <div className={viewStyles.v031}>
      <Sidebar />

      <main className={viewStyles.v032}>
        <div className={viewStyles.v136}>
          {/* Breadcrumb */}
          <div className={viewStyles.v034}>
            <Link href={routes.myTeam} className={viewStyles.v035}>
              My Team
            </Link>
            {' > Notifications'}
          </div>

          {/* Hero banner */}
          <div className={viewStyles.notifHero}>
            <div className={viewStyles.notifHeroIcon}>🔔</div>
            <div className={viewStyles.notifHeroText}>
              <h1 className={viewStyles.notifHeroTitle}>Notifications</h1>
              <p className={viewStyles.notifHeroSub}>Stay updated on evaluation approvals, rejections, and workflow changes.</p>
            </div>
            <div className={viewStyles.notifHeroCount}>
              <span className={viewStyles.notifHeroNum}>{unreadCount}</span>
              <span className={viewStyles.notifHeroNumLabel}>Unread</span>
            </div>
          </div>

          {/* Action bar: read count + mark-all button */}
          <div className={viewStyles.notifActions}>
            <div className={viewStyles.notifReadCount}>
              <span className={viewStyles.notifReadPill}>{readNotifications.size}/{notifications.length}</span>
              notifications read
            </div>
            <button onClick={markAllAsRead} className={viewStyles.notifMarkAllBtn}>
              Mark all as read
            </button>
          </div>

          {/* Notification cards update read state when clicked. */}
          {loading ? (
            <LoadingScreen />
          ) : errorMessage ? (
            <div className={viewStyles.v140}>
              {errorMessage}
            </div>
          ) : notifications.length > 0 ? (
            <div className={viewStyles.notifList}>
              {notifications.map((notif) => {
                const isRead = readNotifications.has(notif.id) || notif.is_read;
                const typeClass = getNotificationTypeClass(notif.type);
                const iconClass = getNotificationIconClass(notif.type);
                return (
                  <div
                    key={String(notif.id)}
                    onClick={() => markAsRead(notif.id)}
                    className={`${viewStyles.notifCard} ${(viewStyles as Record<string,string>)[typeClass]} ${isRead ? viewStyles.notifCardRead : viewStyles.notifCardUnread}`}
                  >
                    <div className={viewStyles.notifCardInner}>
                      <div className={`${viewStyles.notifIconWrap} ${(viewStyles as Record<string,string>)[iconClass]}`}>
                        {getNotificationIcon(notif.type)}
                      </div>
                      <div className={viewStyles.notifBody}>
                        <div className={viewStyles.notifMeta}>
                          <div className={viewStyles.notifTitleRow}>
                            <span className={isRead ? viewStyles.notifTitleTextRead : viewStyles.notifTitleText}>
                              {notif.title}
                            </span>
                            {!isRead && <span className={viewStyles.notifUnreadDot} />}
                          </div>
                          <span className={viewStyles.notifTimeText}>
                            {formatNotificationTime(notif.timestamp)}
                          </span>
                        </div>
                        <p className={isRead ? viewStyles.notifDescTextRead : viewStyles.notifDescText}>
                          {notif.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={viewStyles.notifEmpty}>
              <div className={viewStyles.notifEmptyIcon}>📭</div>
              <h2 className={viewStyles.notifEmptyTitle}>No notifications yet</h2>
              <p className={viewStyles.notifEmptyDesc}>
                Workflow updates will appear here after you save drafts, submit evaluations, approve, or reject.
              </p>
            </div>
          )}

          {/* Static helper cards explain the evaluation process and approver levels. */}
          <div className={viewStyles.notifInfoGrid}>
            {/* Process Flow */}
            <div className={viewStyles.notifInfoCard}>
              <h3 className={viewStyles.notifInfoTitle}>Process Flow</h3>
              <div className={viewStyles.notifProcessList}>
                {[
                  'Self Evaluation',
                  'Sub Dept Admin Evaluation',
                  'Dept Admin Approval',
                  'Branch Admin Review',
                  'Country Admin Final Approval',
                ].map((step, idx) => (
                  <div key={idx} className={viewStyles.notifProcessStep}>
                    <span className={viewStyles.notifProcessNum}>{idx + 1}</span>
                    <span className={viewStyles.notifProcessText}>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Roles & Levels */}
            <div className={viewStyles.notifInfoCard}>
              <h3 className={viewStyles.notifInfoTitle}>Roles & Levels</h3>
              <div className={viewStyles.notifRoleList}>
                {[
                  { icon: '👤', label: 'Level 1: HQ Admin' },
                  { icon: '👥', label: 'Level 2: Country Admin' },
                  { icon: '🏢', label: 'Level 3: Branch Admin' },
                  { icon: '⭐', label: 'Level 4: Dept Admin' },
                  { icon: '⭐', label: 'Level 4: Sub Dept Admin' },
                ].map((role, idx) => (
                  <div key={idx} className={viewStyles.notifRoleItem}>
                    <div className={viewStyles.notifRoleIcon}>{role.icon}</div>
                    <span className={viewStyles.notifRoleLabel}>{role.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
