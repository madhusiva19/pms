"use client";

import styles from "./Sidebar.module.css";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function Sidebar() {
  const pathname = usePathname();

  const menuItems = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Template Management", path: "/templates" },
    { name: "My Team", path: "/my-team" },
    { name: "Reports", path: "/reports" },
  ];

  return (
    <div className={styles.sidebar}>
      
      {/* Logo */}
      <div className={styles.logoSection}>
        <Image
          src="/images.png"  // put your logo in public folder
          alt="Logo"
          width={140}
          height={70}
          className={styles.logo}
        />
      </div>

      {/* Navigation */}
      <div className={styles.nav}>
        {menuItems.map((item) => (
          <Link key={item.name} href={item.path}>
            <div
              className={`${styles.navItem} ${
                pathname === item.path ? styles.active : ""
              }`}
            >
              <span className={styles.icon}>⬤</span>
              {item.name}
            </div>
          </Link>
        ))}
      </div>

      {/* Bottom Section */}
      <div className={styles.bottomSection}>
        <div className={styles.profile}>
          <Image
            src="/images-2.png" // put avatar in public folder
            alt="User"
            width={40}
            height={40}
            className={styles.avatar}
          />
          <div className={styles.profileInfo}>
            <span className={styles.name}>Group Admin</span>
            <span className={styles.role}>Admin</span>
          </div>
        </div>

        <div className={styles.logout}>
          ⎋ Logout
        </div>
      </div>
    </div>
  );
}
