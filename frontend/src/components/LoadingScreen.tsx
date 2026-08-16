import styles from './loadingScreen.module.css';

export default function LoadingScreen() {
  const ROWS = 4;
  return (
    <div className={styles.skeleton}>
      {Array.from({ length: ROWS }).map((_, i) => (
        <div key={i} className={styles.skeletonRow}>
          <div className={styles.skeletonAvatar} />
          <div className={styles.skeletonLines}>
            <div className={styles.skeletonLine} />
            <div className={styles.skeletonLine} />
          </div>
          <div className={styles.skeletonBadge} />
        </div>
      ))}
    </div>
  );
}
