"use client";

import Image from "next/image";
import styles from "./dashboard.module.css";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  ReferenceLine,
} from "recharts";

const barData = [
  { country: "India", score: 3.58, fill: "#2563EB" },
  { country: "Sri Lanka", score: 4.0, fill: "#00C49F" },
  { country: "Singapore", score: 4.38, fill: "#FFBB28" },
  { country: "Bangladesh", score: 3.2, fill: "#FF8042" },
  { country: "Pakistan", score: 2.8, fill: "#4F39F6" },
];

const pieData = [
  { name: "0", value: 450, color: "#0088FE" },
  { name: "1", value: 320, color: "#00C49F" },
  { name: "2", value: 280, color: "#FFBB28" },
  { name: "3", value: 190, color: "#FF8042" },
  { name: "4", value: 140, color: "#8884D8" },
];


function renderPieLabel(props: any) {
  const { cx, cy, midAngle, outerRadius, value, fill } = props;
  const RADIAN = Math.PI / 180;

  const r = outerRadius + 22;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill={fill}
      fontSize={16}
      fontFamily="Inter"
      dominantBaseline="central"
      textAnchor={x > cx ? "start" : "end"}
    >
      {value}
    </text>
  );
}

export default function GroupAdminDashboardPage() {
  const router = useRouter();

const handleLogout = () => {
  router.replace("/login");
  router.refresh();
};


  return (
    <div className={styles.dashShell}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Image
            src="/dgl-logo.png"
            alt="DGL Logo"
            width={160}
            height={56}
            className={styles.brandLogoImg}
            priority
          />
        </div>

        <nav className={styles.sideNav}>
  {/* Dashboard (Active) */}
  <button type="button" className={`${styles.sideItem} ${styles.active}`}>
    <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2.2" />
    </svg>
    <span className={styles.sideLabel}>Dashboard</span>
  </button>

  {/* Template Management */}
  <button type="button" className={styles.sideItem}>
    <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
      <path d="M7 3h7l3 3v15H7V3Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M14 3v4h4" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M9 12h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M9 16h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
    <span className={styles.sideLabel}>Template Management</span>
  </button>

  {/* My Team */}
  <button type="button" className={styles.sideItem}>
    <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
      <path d="M8 18c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M12 13a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 12 13Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M19 18c0-1.8-1.2-3.3-2.8-3.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
    <span className={styles.sideLabel}>My Team</span>
  </button>

  {/* Reports */}
  <button type="button" className={styles.sideItem}>
    <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
      <path d="M5 20V4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M5 20h15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M9 20v-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M13 20v-11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M17 20v-4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
    <span className={styles.sideLabel}>Reports</span>
  </button>

  {/* ✅ My Profile (LAST like profile page) */}
  <button
    type="button"
    className={styles.sideItem}
    onClick={() => router.push("/group-admin/profile")}
  >
    <svg className={styles.navSvg} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M20 21a8 8 0 0 0-16 0"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
    <span className={styles.sideLabel}>My Profile</span>
  </button>
</nav>


        {/* Footer (styled same as profile page, but clickable) */}
        <div className={styles.sideFooter}>
          <button
            type="button"
            className={styles.profileRowBtnLikeProfile}
            onClick={() => router.push("/group-admin/profile")}
          >
            <div className={styles.avatarCircle}>GA</div>
            <div className={styles.profileText}>
              <div className={styles.profileName}>Perera</div>
              <div className={styles.profileRole}>group admin</div>
            </div>
          </button>

          <button
            className={styles.logoutBtn}
            type="button"
            onClick={handleLogout}
          >
             Logout
                </button>

        </div>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        <div className={styles.breadcrumb}>
          <span className={styles.crumbLink}>Home</span>
          <span className={styles.crumbSep}>›</span>
          <span className={styles.crumbCurrent}>Dashboard</span>
        </div>

        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.pageTitle}>Dashboard</h1>
            <p className={styles.pageSub}>
              Global overview of performance management across the organization
            </p>
          </div>
        </div>

        {/* Stats */}
        <section className={styles.statsRow}>
          <div className={styles.statCard}>
            <div className={styles.statLeft}>
              <p className={styles.statTitle}>Total Countries</p>
              <p className={styles.statValue}>15</p>
            </div>
            <div className={styles.statIcon} style={{ background: "#EFF6FF" }}>
              <Image src="/icons/globe.svg" alt="Countries" width={40} height={40} className={styles.statIconImg} />
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLeft}>
              <p className={styles.statTitle}>Total Employees</p>
              <p className={styles.statValue}>1,380</p>
            </div>
            <div className={styles.statIcon} style={{ background: "#F3F4F6" }}>
              <Image src="/icons/users.svg" alt="Employees" width={40} height={40} className={styles.statIconImgBlue} />
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statLeft}>
              <p className={styles.statTitle}>Total Branches</p>
              <p className={styles.statValue}>45</p>
            </div>
            <div className={styles.statIcon} style={{ background: "#EFF6FF" }}>
              <Image src="/icons/clipboard.svg" alt="Branches" width={40} height={40} className={styles.statIconImg} />
            </div>
          </div>
        </section>

        {/* Charts */}
        <section className={styles.chartsRow}>
          <div className={styles.chartBox}>
            <div className={styles.chartHead}>
              <h3>Average Performance by Country</h3>
              <div className={styles.miniLegend}>
                <span className={styles.legendDot} />
                <span className={styles.legendText}>score</span>
              </div>
            </div>

            <div className={styles.chartBody}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid stroke="rgba(0,0,26,0.15)" strokeDasharray="4 4" vertical horizontal />
                  <ReferenceLine y={0} stroke="rgba(0,0,26,0.30)" strokeWidth={2} />
                  <XAxis dataKey="country" axisLine tickLine={false} />
                  <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} axisLine tickLine={false} />
                  <Bar dataKey="score" radius={[10, 10, 0, 0]}>
                    {barData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.chartBox}>
            <div className={styles.chartHead}>
              <h3>Employee Distribution</h3>
            </div>

            <div className={styles.chartBody}>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={95}
                    stroke="#FFFFFF"
                    strokeWidth={1}
                    labelLine={{ stroke: "rgba(0,0,0,0.35)", strokeWidth: 1 }}
                    label={renderPieLabel}
                  >
                    {pieData.map((d, idx) => (
                      <Cell key={idx} fill={d.color} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" height={40} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
