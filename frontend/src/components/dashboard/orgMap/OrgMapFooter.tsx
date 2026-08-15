"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { fetchOrgMapTree, type OrgMapCountry } from "@/lib/orgMapApi";
import styles from "./orgMap.module.css";

const OrgMapCanvas = dynamic(() => import("./OrgMapCanvas"), {
  ssr: false,
  loading: () => <div className={styles.centerMessage}>Loading map…</div>,
});

interface OrgMapFooterProps {
  mode: "world" | "country";
  countryId?: string;
}

export default function OrgMapFooter({ mode, countryId }: OrgMapFooterProps) {
  const [countries, setCountries] = useState<OrgMapCountry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchOrgMapTree(mode === "country" ? countryId : undefined);
        if (cancelled) return;
        setCountries(data.countries || []);
      } catch {
        if (cancelled) return;
        setError("Failed to load organization map data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [mode, countryId]);

  const title = mode === "world" ? "Global Organization Map" : "Branch Map";

  return (
    <div className={styles.mapCard}>
      <div className={styles.mapHead}>
        <h3>{title}</h3>
      </div>
      <div className={styles.mapBody}>
        {loading ? (
          <div className={styles.centerMessage}>Loading map…</div>
        ) : error ? (
          <div className={styles.centerMessage}>{error}</div>
        ) : countries.length === 0 ? (
          <div className={styles.centerMessage}>No organization data available</div>
        ) : (
          <OrgMapCanvas countries={countries} mode={mode} />
        )}
      </div>
    </div>
  );
}
