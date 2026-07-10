"use client";

import styles from "./dashboard.module.css";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { apiFetch } from "@/lib/apiFetch";
import { logger } from "@/utils/logger";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from "recharts";

interface BarEntry {
  name: string;
  score: number;
  fill: string;
  entity_id?: string;
  entity_type?: string;
  drillable?: boolean;
}
interface PieEntry { name: string; value: number; color: string; }
interface ChartData { bar: BarEntry[]; pie: PieEntry[]; }

interface DrillLevel {
  label: string;
  entityType: string | null;
  entityId: string | null;
}

interface RoleDashboardConfig {
  role: string;
  stats: string[];
  barTitle: string;
  pieTitle: string;
  showPie: boolean;
}

const COLORS = [
  "#2563EB", "#00C49F", "#FFBB28", "#FF8042", "#8884D8",
  "#4F39F6", "#E11D48", "#0891B2", "#65A30D", "#D97706",
];

const DRILL_TITLES: Record<string, { bar: string; pie: string }> = {
  branch:         { bar: "Average Performance by Branch",         pie: "Employee Distribution by Branch"         },
  department:     { bar: "Average Performance by Department",     pie: "Employee Distribution by Department"     },
  sub_department: { bar: "Average Performance by Sub-Department", pie: "Employee Distribution by Sub-Department" },
  employee:       { bar: "Team Member Performance",               pie: ""                                        },
};

interface PieLabelProps {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
  value?: number;
}

function renderPieLabel(props: PieLabelProps) {
  const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, value } = props;
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
      {`${value}`}
    </text>
  );
}

const ROLE_CONFIG: Record<number, RoleDashboardConfig> = {
  1: { role: "HQ Admin",       stats: ["Total Countries", "Total Employees", "Total Branches"],    barTitle: "Average Performance by Country",        pieTitle: "Employee Distribution by Country",        showPie: true  },
  2: { role: "Country Admin",  stats: ["Total Branches", "Total Employees", "Total Departments"],  barTitle: "Average Performance by Branch",         pieTitle: "Employee Distribution by Branch",         showPie: true  },
  3: { role: "Branch Admin",   stats: ["Total Departments", "Total Employees", "Total Sub-Depts"], barTitle: "Average Performance by Department",     pieTitle: "Employee Distribution by Department",     showPie: true  },
  4: { role: "Dept Admin",     stats: ["Total Sub-Departments", "Total Employees"],                barTitle: "Average Performance by Sub-Department", pieTitle: "Employee Distribution by Sub-Department", showPie: true  },
  5: { role: "Sub-Dept Admin", stats: ["Total Employees"],                                         barTitle: "Team Member Performance",           pieTitle: "",                                        showPie: false },
};

function addColors(data: { bar: any[]; pie: any[] }): ChartData {
  const bar = (data.bar || []).map((item: any, i: number) => ({
    ...item,
    fill: COLORS[i % COLORS.length],
  }));
  const pie = (data.pie || []).map((item: any, i: number) => ({
    ...item,
    color: COLORS[i % COLORS.length],
  }));
  return { bar, pie };
}

export default function DashboardBase({ level }: { level: number }) {
  const config = ROLE_CONFIG[level] || ROLE_CONFIG[1];
  const currentUser = useCurrentUser();

  const [stats,        setStats]        = useState<Record<string, number>>({});
  const [chartData,    setChartData]    = useState<ChartData>({ bar: [], pie: [] });
  const [loading,      setLoading]      = useState(true);
  const [drillPath,    setDrillPath]    = useState<DrillLevel[]>([{ label: "Overview", entityType: null, entityId: null }]);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    const fetchData = async () => {
      try {
        const [statsRes, chartRes] = await Promise.all([
          apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/stats/${currentUser.employee_id}`),
          apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/charts/${currentUser.employee_id}`),
        ]);

        const statsJson = await statsRes.json();
        const chartJson = await chartRes.json();

        const freshStats = statsJson.stats || {};
        const freshChart = chartJson.data || { bar: [], pie: [] };

        setStats(freshStats);
        setChartData(addColors(freshChart));

      } catch (err) {
        logger.error("Failed to fetch dashboard data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  async function handleBarClick(data: any) {
    if (data?.drillable !== true) return;
    setDrillLoading(true);
    try {
      const res = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/drilldown?entity_type=${data.entity_type}&entity_id=${data.entity_id}`
      );
      const json = await res.json();
      setChartData(addColors(json.data || { bar: [], pie: [] }));
      setDrillPath(prev => [...prev, { label: data.name, entityType: data.entity_type, entityId: data.entity_id }]);
    } catch (err) {
      logger.error("Failed to load drilldown data", err);
    } finally {
      setDrillLoading(false);
    }
  }

  async function handleBreadcrumbClick(index: number) {
    if (index >= drillPath.length - 1) return;
    const target = drillPath[index];
    setDrillLoading(true);
    try {
      let res;
      if (index === 0) {
        res = await apiFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/charts/${currentUser!.employee_id}`
        );
      } else {
        res = await apiFetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/dashboard/drilldown?entity_type=${target.entityType}&entity_id=${target.entityId}`
        );
      }
      const json = await res.json();
      setChartData(addColors(json.data || { bar: [], pie: [] }));
      setDrillPath(prev => prev.slice(0, index + 1));
    } catch (err) {
      logger.error("Failed to navigate breadcrumb", err);
    } finally {
      setDrillLoading(false);
    }
  }

  const coloredBar = chartData.bar;
  const coloredPie = chartData.pie;

  const currentEntityType = coloredBar[0]?.entity_type;
  const barTitle  = drillPath.length > 1 && currentEntityType
    ? (DRILL_TITLES[currentEntityType]?.bar ?? config.barTitle)
    : config.barTitle;
  const pieTitle  = drillPath.length > 1 && currentEntityType
    ? (DRILL_TITLES[currentEntityType]?.pie ?? config.pieTitle)
    : config.pieTitle;
  const showPie   = drillPath.length > 1 ? coloredPie.length > 0 : config.showPie;
  const isDrillable = coloredBar.some(b => b.drillable === true);

  return (
    <main style={{ flex: 1, minHeight: '100vh', background: '#F9FAFB', overflow: 'auto' }}>
      <div style={{ maxWidth: '1225px', margin: '0 auto', width: '100%', padding: '24px 32px 40px' }}>
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

        {/* ── Drill Breadcrumb ── */}
        {drillPath.length > 1 && (
          <div className={styles.breadcrumb} style={{ marginBottom: "12px" }}>
            {drillPath.map((crumb, idx) => (
              <span key={idx}>
                {idx > 0 && <span className={styles.crumbSep}>›</span>}
                {idx < drillPath.length - 1 ? (
                  <span className={styles.crumbLink} style={{ cursor: "pointer" }} onClick={() => handleBreadcrumbClick(idx)}>
                    {crumb.label}
                  </span>
                ) : (
                  <span className={styles.crumbCurrent}>{crumb.label}</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* ── Charts ── */}
        <section className={styles.chartsRow}>

          {/* Bar Chart */}
          <div className={!showPie ? styles.chartBoxFull : styles.chartBox}>
            <div className={styles.chartHead}>
              <h3>{barTitle}</h3>
            </div>
            <div className={styles.chartBody}>
              {loading || drillLoading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#9CA3AF" }}>
                  Loading...
                </div>
              ) : coloredBar.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#9CA3AF" }}>
                  No data available
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart
                    data={coloredBar}
                    margin={{ top: 16, right: 16, left: 0, bottom: 40 }}
                    style={{ outline: "none" }}
                    tabIndex={-1}
                  >
                    <CartesianGrid strokeDasharray="4 4" vertical={false} />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={55}
                    />
                    <YAxis domain={[0, 5]} ticks={[0,1,2,3,4,5]} axisLine={false} tickLine={false} />
                    <Bar
                      dataKey="score"
                      radius={[10, 10, 0, 0]}
                      cursor={isDrillable ? "pointer" : "default"}
                      onClick={(data) => handleBarClick(data)}
                    >
                      {coloredBar.map((entry: BarEntry, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Pie Chart */}
          {showPie && coloredPie.length > 0 && (
            <div className={styles.chartBox}>
              <div className={styles.chartHead}>
                <h3>{pieTitle}</h3>
              </div>
              <div className={styles.chartBody}>
                {loading ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px", color: "#9CA3AF" }}>
                    Loading...
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={coloredPie}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        label={renderPieLabel}
                      >
                        {coloredPie.map((entry: PieEntry, index: number) => (
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
      </div>
    </main>
  );
}
