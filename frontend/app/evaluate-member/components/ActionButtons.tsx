'use client';

import React from 'react';
import styles from '../styles/page.module.css';

interface ActionButtonsProps {
  onCancel?: () => void;
  onSaveDraft?: () => void;
  onSubmit?: () => void;
}

const SaveIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M2.5 1.5H11.5L13.5 3.5V13.5C13.5 14.0304 13.2893 14.5391 12.9142 14.914C12.5391 15.2891 12.0304 15.5 11.5 15.5H2.5C1.96957 15.5 1.46086 15.2893 1.08579 14.914C0.710726 14.5391 0.5 14.0304 0.5 13.5V3C0.5 2.46957 0.710726 1.96086 1.08579 1.58579C1.46086 1.21072 1.96957 1 2.5 1Z"
      stroke="currentColor"
      strokeWidth="1.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5.5 6.5H10.5"
      stroke="currentColor"
      strokeWidth="1.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5.5 9.5H10.5"
      stroke="currentColor"
      strokeWidth="1.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M1.33337 8.66667L5.33337 12.6667L14.6667 3.33333"
      stroke="currentColor"
      strokeWidth="1.33333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ActionButtons = ({ onCancel, onSaveDraft, onSubmit }: ActionButtonsProps) => {
  return (
    <div className={styles.actionButtons}>
      <button className={`${styles.buttonBase} ${styles.buttonSecondary}`} onClick={onCancel}>
        Cancel
      </button>
      <button className={`${styles.buttonBase} ${styles.buttonSaveDraft}`} onClick={onSaveDraft}>
        <SaveIcon />
        Save Draft
      </button>
      <button className={`${styles.buttonBase} ${styles.buttonSubmit}`} onClick={onSubmit}>
        <CheckIcon />
        Submit Evaluation
      </button>
    </div>
  );
};
