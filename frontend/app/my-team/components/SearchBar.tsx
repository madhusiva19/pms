'use client';

import React from 'react';
import styles from '../styles/search-bar.module.css';

interface SearchBarProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSearch?: () => void;
}

export const SearchBar = ({
  placeholder = 'Search team members...',
  value,
  onChange,
  onSearch,
}: SearchBarProps) => {
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      onSearch();
    }
  };

  return (
    <div className={styles.searchContainer}>
      <div className={styles.searchWrapper}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder={placeholder}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <div className={styles.searchIcon}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8.5 15.5C12.3660254 15.5 15.5 12.3660254 15.5 8.5C15.5 4.63397459 12.3660254 1.5 8.5 1.5C4.63397459 1.5 1.5 4.63397459 1.5 8.5C1.5 12.3660254 4.63397459 15.5 8.5 15.5Z"
              stroke="#99A1AF"
              strokeWidth="1.67"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M18.5 18.5L13.2 13.2"
              stroke="#99A1AF"
              strokeWidth="1.67"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};
