"use client";

import styles from "./dashboard.module.css";
import Sidebar from "@/components/sidebar/Sidebar";
import { useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from "recharts";

function renderPieLabel(props: any) {
  const { cx, cy, midAngle, outerRadius, value, name } = props;
  const RADIAN = Math.PI / 180;
  const r = outerRadius + 22;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);

  

  return (
    <text
      x={x}
      y={y}
      fill="#374151"
      fontSize={12}
      fontWeight="600"
      dominantBaseline="central"
      textAnchor={x > cx ? "start" : "end"}
    >
      {`${name}: ${value}`}
    </text>
  );
}

const ROLE_CONFIG: Record<number, any> = {
  1: { role: "HQ Admin",       stats: ["Total Countries", "Total Employees", "Total Branches"],    barTitle: "Avg Performance by Country",        pieTitle: "Employee Distribution by Country",        showPie: true  },
  2: { role: "Country Admin",  stats: ["Total Branches", "Total Employees", "Total Departments"],  barTitle: "Avg Performance by Branch",         pieTitle: "Employee Distribution by Branch",         showPie: true  },
  3: { role: "Branch Admin",   stats: ["Total Departments", "Total Employees", "Total Sub-Depts"], barTitle: "Avg Performance by Department",     pieTitle: "Employee Distribution by Department",     showPie: true  },
  4: { role: "Dept Admin",     stats: ["Total Sub-Departments", "Total Employees"],                barTitle: "Avg Performance by Sub-Department", pieTitle: "Employee Distribution by Sub-Department", showPie: true  },
  5: { role: "Sub-Dept Admin", stats: ["Total Employees"],                                         barTitle: "Team Member Performance",           pieTitle: "",                                        showPie: false },
};

export default function DashboardBase({ level }: { level: number }) {
  const config = ROLE_CONFIG[level] || ROLE_CONFIG[1];

  const [stats,     setStats]     = useState<Record<string, number>>({});
  const [chartData, setChartData] = useState<any>({ bar: [], pie: [] });
  const [user,      setUser]      = useState<any>(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem("pms_user");
    if (!raw) return;
    const currentUser = JSON.parse(raw);
    setUser(currentUser);

    const fetchData = async () => {
      try {
        // Fetch stats
        const statsRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/stats/${currentUser.employee_id}`
        );
        const statsJson = await statsRes.json();
        setStats(statsJson.stats || {});

        // Fetch chart data
        const chartRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/charts/${currentUser.employee_id}`
        );
        const chartJson = await chartRes.json();
        setChartData(chartJson.data || { bar: [], pie: [] });

      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className={styles.dashShell}>
      <Sidebar />

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

        {/* ── Stats Cards ── */}
        <section className={styles.statsRow}>
          {config.stats.map((label: string, idx: number) => (
            <div key={idx} className={styles.statCard}>
              <div className={styles.statLeft}>
                <p className={styles.statTitle}>{label}</p>
                <p className={styles.statValue}>
                  {loading ? "--" : (stats[label] ?? "--")}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* ── Charts ── */}
        <section className={styles.chartsRow}>

          {/* Bar Chart */}
          <div className={!config.showPie ? styles.chartBoxFull : styles.chartBox}>
            <div className={styles.chartHead}>
              <h3>{config.barTitle}</h3>
      
            </div>
            <div className={styles.chartBody}>
              {loading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px", color: "#9CA3AF" }}>
                  Loading...
                </div>
              ) : chartData.bar.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px", color: "#9CA3AF" }}>
                  No data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData.bar}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 5]} ticks={[0,1,2,3,4,5]} axisLine={false} tickLine={false} />
                    <Bar dataKey="score" radius={[10, 10, 0, 0]}>
                      {chartData.bar.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Pie Chart */}
          {config.showPie && (
            <div className={styles.chartBox}>
              <div className={styles.chartHead}>
                <h3>{config.pieTitle}</h3>
              </div>
              <div className={styles.chartBody}>
                {loading ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px", color: "#9CA3AF" }}>
                    Loading...
                  </div>
                ) : chartData.pie.length === 0 ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px", color: "#9CA3AF" }}>
                    No data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={chartData.pie}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        label={renderPieLabel}
                      >
                        {chartData.pie.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}
        </section>
</main>
</div> ); }