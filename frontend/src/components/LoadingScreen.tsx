import styles from './loadingScreen.module.css';

interface Props {
  fullPage?: boolean;
  message?: string;
}

export default function LoadingScreen({ fullPage = false, message = 'Loading' }: Props) {
  if (fullPage) {
    return (
      <div className={styles.fullPage}>
        <div className={styles.card}>
          <img src="/logo.png" alt="Logo" className={styles.logo} />
          <div className={styles.spinnerWrap}>
            <div className={styles.spinnerTrack} />
            <div className={styles.spinnerArc} />
          </div>
          <div className={styles.dots}>
            <div className={styles.dot} />
            <div className={styles.dot} />
            <div className={styles.dot} />
          </div>
          <p className={styles.label}>{message}</p>
        </div>
      </div>
    );
  }

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
