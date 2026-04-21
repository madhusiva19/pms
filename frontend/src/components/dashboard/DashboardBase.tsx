"use client";

import Image from "next/image";
import styles from "./dashboard.module.css";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from "recharts";

function renderPieLabel(props: any) {
  const { cx, cy, midAngle, outerRadius, value, name, fill } = props;
  const RADIAN = Math.PI / 180;
  const r = outerRadius + 22;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#374151" // Darker color for readability
      fontSize={12}
      fontWeight="600"
      dominantBaseline="central"
      textAnchor={x > cx ? "start" : "end"}
    >
      {`${name}: ${value}`} 
    </text>
  );
}

const MOCK_DATA_COLLECTION: Record<number, any> = {
  1: { // HQ Admin
    bar: [
      { country: "India", score: 3.8, fill: "#2563EB" },
      { country: "Sri Lanka", score: 4.1, fill: "#00C49F" },
      { country: "Singapore", score: 4.5, fill: "#FFBB28" },
      { country: "Bangladesh", score: 3.2, fill: "#FF8042" }
    ],
    pie: [
      { name: "0", value: 450, color: "#0088FE" },
      { name: "1", value: 320, color: "#00C49F" },
      { name: "2", value: 280, color: "#FFBB28" },
      { name: "3", value: 190, color: "#FF8042" },
      { name: "4", value: 140, color: "#8884D8" }

    ]
  },
  2: { // Country Admin
    bar: [
      { branch: "Colombo", score: 4.2, fill: "#2563EB" },
      { branch: "Galle", score: 3.9, fill: "#00C49F" },
      { branch: "Kandy", score: 3.5, fill: "#FFBB28" }
    ],
    pie: [
      { name: "0", value: 450, color: "#0088FE" },
      { name: "1", value: 320, color: "#00C49F" },
      { name: "2", value: 280, color: "#FFBB28" },
      { name: "3", value: 190, color: "#FF8042" },
      { name: "4", value: 140, color: "#8884D8" }
    ]
  },
  3: { // Branch Admin
    bar: [
      { dept: "Operations", score: 4.0, fill: "#2563EB" },
      { dept: "Finances", score: 3.7, fill: "#FFBB28" }
    ],
    pie: [
        { name: "0", value: 450, color: "#0088FE" },
        { name: "1", value: 320, color: "#00C49F" },
        { name: "2", value: 280, color: "#FFBB28" },
        { name: "3", value: 190, color: "#FF8042" },
        { name: "4", value: 140, color: "#8884D8" }]
  },
  4: { // Dept Admin
    bar: [
      { subDept: "Air Freight", score: 4.4, fill: "#2563EB" },
      { subDept: "Sea Freight", score: 3.9, fill: "#FF8042" }
    ],
    pie: [
        { name: "0", value: 450, color: "#0088FE" },
      { name: "1", value: 320, color: "#00C49F" },
      { name: "2", value: 280, color: "#FFBB28" },
      { name: "3", value: 190, color: "#FF8042" },
      { name: "4", value: 140, color: "#8884D8" }
    ]
  },
  5: { // Sub-Dept Admin
    bar: [
      { name: "A. Perera", score: 4.8, fill: "#2563EB" },
      { name: "S. Silva", score: 3.2, fill: "#00C49F" },
      { name: "M. Fernando", score: 4.1, fill: "#FFBB28" },
      { name: "K. Kumara", score: 2.9, fill: "#FF8042" },
      { name: "J. Doe", score: 3.7, fill: "#4F39F6" }
    ],
    pie: [] 
  }
};

const ROLE_CONFIG: Record<number, any> = {
  1: { role: "HQ Admin", stats: ["Total Countries", "Total Employees", "Total Branches"], barTitle: "Average Performance by Country", barKey: "country", showPie: true },
  2: { role: "Country Admin", stats: ["Total Branches", "Total Employees", "Total Departments"], barTitle: "Average Performance by Branch", barKey: "branch", showPie: true },
  3: { role: "Branch Admin", stats: ["Total Departments", "Total Employees", "Total Sub-Depts"], barTitle: "Average Performance by Department", barKey: "dept", showPie: true },
  4: { role: "Dept Admin", stats: ["Total Sub-Departments", "Total Employees"], barTitle: "Average Performance by Sub-Department", barKey: "subDept", showPie: true },
  5: { role: "Sub-Dept Admin", stats: ["Total Employees"], barTitle: "Individual Employee Scores", barKey: "name", showPie: false },
};

export default function DashboardBase({ level }: { level: number }) {
  const router = useRouter();
  const config = ROLE_CONFIG[level] || ROLE_CONFIG[1];

  const handleLogout = () => {
    router.replace("/login");
  };

  return (
    <div className={styles.dashShell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Image src="/dgl-logo.png" alt="DGL Logo" width={160} height={56} priority />
        </div>
        <nav className={styles.sideNav}>
          <button type="button" className={`${styles.sideItem} ${styles.active}`}>
            <span className={styles.sideLabel}>Dashboard</span>
          </button>
          {level === 1 && (
            <button type="button" className={styles.sideItem}>
              <span className={styles.sideLabel}>Template Management</span>
            </button>
          )}
          <button type="button" className={styles.sideItem}><span className={styles.sideLabel}>My Team</span></button>
          <button type="button" className={styles.sideItem}><span className={styles.sideLabel}>Reports</span></button>
          <button type="button" className={styles.sideItem} onClick={() => router.push("/profile")}>
            <span className={styles.sideLabel}>My Profile</span>
          </button>
        </nav>
        <div className={styles.sideFooter}>
          <div className={styles.profileRowBtnLikeProfile}>
            <div className={styles.avatarCircle}>GA</div>
            <div className={styles.profileText}>
              <div className={styles.profileName}>Perera</div>
              <div className={styles.profileRole}>{config.role}</div>
            </div>
          </div>
          <button className={styles.logoutBtn} type="button" onClick={handleLogout}>Logout</button>
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.breadcrumb}>
          <span className={styles.crumbLink}>Home</span> › <span className={styles.crumbCurrent}>Dashboard</span>
        </div>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.pageTitle}>{config.role} Dashboard</h1>
            <p className={styles.pageSub}>Performance overview for {config.role} scope.</p>
          </div>
        </div>

        <section className={styles.statsRow}>
          {config.stats.map((label: string, idx: number) => (
            <div key={idx} className={styles.statCard}>
              <div className={styles.statLeft}>
                <p className={styles.statTitle}>{label}</p>
                <p className={styles.statValue}>--</p>
              </div>
            </div>
          ))}
        </section>

        <section className={styles.chartsRow}>
          <div className={!config.showPie ? styles.chartBoxFull : styles.chartBox}>
            <div className={styles.chartHead}><h3>{config.barTitle}</h3></div>
            <div className={styles.chartBody}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={MOCK_DATA_COLLECTION[level]?.bar || []}>
                  <CartesianGrid strokeDasharray="4 4" vertical horizontal />
                  <XAxis dataKey={config.barKey} axisLine tickLine={false} /> 
                  <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} axisLine tickLine={false} />
                  <Bar dataKey="score" radius={[10, 10, 0, 0]}>
                    {(MOCK_DATA_COLLECTION[level]?.bar || []).map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {config.showPie && (
            <div className={styles.chartBox}>
              <div className={styles.chartHead}><h3>Employee Distribution</h3></div>
              <div className={styles.chartBody}>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie 
                        data={MOCK_DATA_COLLECTION[level]?.pie || []} 
                        dataKey="value" 
                        nameKey="name" 
                        cx="50%" 
                        cy="50%" 
                        innerRadius={60} 
                        outerRadius={90}
                        label={renderPieLabel}
                    >
                        {(MOCK_DATA_COLLECTION[level]?.pie || []).map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Legend />
                </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}