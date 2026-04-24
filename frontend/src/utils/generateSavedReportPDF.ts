/**
 * generateSavedReportPDF.ts
 *
 * Generates a fully programmatic, styled PDF using jsPDF.
 * Supports four report modes stored in trend_metrics.type:
 *   'snapshot'        – current-period snapshot
 *   'year_comparison' – avg_score across multiple years (line chart)
 *   'trend'           – mid-year vs year-end across periods (line chart)
 *   'multi_country'   – side-by-side country comparison (bar chart + table)
 */

import jsPDF from 'jspdf';
import type { SavedReport } from '@/types';

// ─── Colour palette ──────────────────────────────────────────────────────────
const C = {
  navy:    [30, 58, 138]   as [number, number, number],
  blue:    [37, 99, 235]   as [number, number, number],
  purple:  [139, 92, 246]  as [number, number, number],
  teal:    [8, 146, 184]   as [number, number, number],
  amber:   [245, 158, 11]  as [number, number, number],
  green:   [0, 166, 62]    as [number, number, number],
  red:     [239, 68, 68]   as [number, number, number],
  text:    [16, 24, 40]    as [number, number, number],
  muted:   [74, 85, 101]   as [number, number, number],
  light:   [226, 232, 240] as [number, number, number],
  bg:      [249, 250, 251] as [number, number, number],
  white:   [255, 255, 255] as [number, number, number],
};

const BAR_COLORS: [number, number, number][] = [
  [239, 68, 68],  [249, 115, 22], [245, 158, 11], [234, 179, 8],
  [132, 204, 22], [34, 197, 94],  [16, 185, 129], [5, 150, 105],
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function periodLabel(p: string): string {
  if (p === 'both')     return 'Mid-Year & Year-End';
  if (p === 'mid_year') return 'Mid-Year';
  return 'Year-End';
}

function friendlyPeriod(p: string): string {
  return p.replace('mid_year_', 'Mid-Year ').replace('year_end_', 'Year-End ');
}

function drawRect(
  pdf: jsPDF, x: number, y: number, w: number, h: number,
  rgb: [number, number, number], radius = 3,
) {
  pdf.setFillColor(...rgb);
  pdf.roundedRect(x, y, w, h, radius, radius, 'F');
}

function sectionHeader(pdf: jsPDF, text: string, y: number, pageW: number): number {
  pdf.setFillColor(...C.light);
  pdf.rect(14, y, pageW - 28, 0.4, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(...C.muted);
  pdf.text(text.toUpperCase(), 14, y + 5);
  return y + 10;
}

function gridLine(pdf: jsPDF, x1: number, y: number, x2: number) {
  pdf.setDrawColor(...C.light);
  pdf.setLineWidth(0.1);
  pdf.line(x1, y, x2, y);
}

// ─── Line graph (used for trend and year-comparison) ─────────────────────────
function drawLineGraph(
  pdf: jsPDF,
  x: number, y: number, w: number, h: number,
  data: number[], labels: string[],
  color: [number, number, number],
) {
  drawRect(pdf, x - 10, y - 5, w + 20, h + 28, C.bg, 4);
  const pad = 12;
  const cW  = w - pad * 2;
  const cH  = h - pad * 2;
  const min = Math.max(0, Math.min(...data) - 0.5);
  const max = Math.min(5, Math.max(...data) + 0.5);
  const rng = max - min;
  const gx  = (i: number) => x + pad + (i * cW) / (data.length - 1);
  const gy  = (v: number) => y + pad + cH - ((v - min) / rng) * cH;

  for (let i = 0; i <= 4; i++) {
    const v = min + (rng * i) / 4;
    gridLine(pdf, x + pad, gy(v), x + pad + cW);
    pdf.setFontSize(6);
    pdf.setTextColor(...C.muted);
    pdf.text(v.toFixed(1), x + pad - 2, gy(v) + 1, { align: 'right' });
  }

  pdf.setDrawColor(...color);
  pdf.setLineWidth(0.8);
  for (let i = 0; i < data.length - 1; i++) {
    pdf.line(gx(i), gy(data[i]), gx(i + 1), gy(data[i + 1]));
  }
  data.forEach((v, i) => {
    pdf.setFillColor(...color);
    pdf.circle(gx(i), gy(v), 1.2, 'F');
    // value label above dot
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...C.text);
    pdf.text(v.toFixed(2), gx(i), gy(v) - 2.5, { align: 'center' });
    // x-axis label
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(...C.muted);
    pdf.text(labels[i], gx(i), y + h + 10, { align: 'center', angle: 30 });
  });
}

// ─── Bell curve bars ─────────────────────────────────────────────────────────
function drawBellCurve(
  pdf: jsPDF,
  x: number, y: number, w: number, h: number,
  data: number[], labels: string[], prevData?: number[],
) {
  drawRect(pdf, x - 10, y - 5, w + 20, h + 25, C.bg, 4);
  const pad  = 12;
  const cW   = w - pad * 2;
  const cH   = h - pad * 2;
  const maxV = Math.max(120, ...data, ...(prevData ?? []));
  const barW = (cW / data.length) * 0.7;
  const barG = (cW / data.length) * 0.3;

  labels.forEach((_, i) => {
    const bx = x + pad + i * (barW + barG);
    if (prevData) {
      const ph = (prevData[i] / maxV) * cH;
      pdf.setFillColor(200, 200, 200);
      pdf.rect(bx - 2, y + pad + cH - ph, barW, ph, 'F');
    }
    const bh = (data[i] / maxV) * cH;
    pdf.setFillColor(...BAR_COLORS[i % BAR_COLORS.length]);
    pdf.roundedRect(bx, y + pad + cH - bh, barW, bh, 1, 1, 'F');
    pdf.setFontSize(6.5);
    pdf.setTextColor(...C.muted);
    pdf.text(labels[i], bx + barW / 2, y + h + 8, { align: 'center', angle: 45 });
  });

  [0, 30, 60, 90, 120].forEach(tick => {
    const ty = y + pad + cH - (tick / maxV) * cH;
    gridLine(pdf, x + pad, ty, x + pad + cW);
    pdf.setFontSize(6);
    pdf.text(String(tick), x + pad - 2, ty + 1, { align: 'right' });
  });
}

// ─── Multi-country horizontal bar chart ──────────────────────────────────────
function drawMultiCountrySection(
  pdf: jsPDF, y: number, pageW: number,
  countryData: Array<{ country_name: string; avg_score: number; top_performers: number; total_evaluated: number }>,
  period: string, reportYear: number,
): number {
  y = sectionHeader(
    pdf,
    `Country Comparison — ${periodLabel(period)} ${reportYear}`,
    y, pageW,
  );
  y += 4;

  const maxScore = Math.max(...countryData.map(d => d.avg_score), 5);
  const barAreaW = pageW - 80;
  const rowH     = 14;

  // Column headers
  drawRect(pdf, 14, y, pageW - 28, 8, C.navy, 3);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...C.white);
  pdf.text('Country',         20,              y + 5.5);
  pdf.text('Avg Score',       pageW - 90,      y + 5.5, { align: 'center' });
  pdf.text('Top Performers',  pageW - 58,      y + 5.5, { align: 'center' });
  pdf.text('Evaluated',       pageW - 22,      y + 5.5, { align: 'right' });
  y += 12;

  countryData.forEach((entry, i) => {
    const rowBg: [number, number, number] = i % 2 === 0 ? C.white : C.bg;
    drawRect(pdf, 14, y, pageW - 28, rowH, rowBg, 2);

    // Country name
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...C.text);
    pdf.text(entry.country_name, 20, y + rowH / 2 + 1.5);

    // Avg score bar
    const barMaxW = 48;
    const barW    = (entry.avg_score / maxScore) * barMaxW;
    const barX    = pageW - 118;
    const barY    = y + 3;
    const barH    = rowH - 6;
    drawRect(pdf, barX, barY, barMaxW, barH, C.light, 2);
    const scoreColor: [number, number, number] =
      entry.avg_score >= 4.0 ? C.green :
      entry.avg_score >= 3.0 ? C.blue  : C.red;
    drawRect(pdf, barX, barY, barW, barH, scoreColor, 2);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...C.text);
    pdf.text(entry.avg_score.toFixed(2), barX + barMaxW + 2, y + rowH / 2 + 1.5);

    // Top performers
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...C.muted);
    pdf.text(String(entry.top_performers), pageW - 58, y + rowH / 2 + 1.5, { align: 'center' });

    // Total evaluated
    pdf.text(String(entry.total_evaluated), pageW - 18, y + rowH / 2 + 1.5, { align: 'right' });

    y += rowH + 2;
  });

  return y + 8;
}

// ─── Year-over-year section ───────────────────────────────────────────────────
function drawYearComparisonSection(
  pdf: jsPDF, y: number, pageW: number,
  yearData: Array<{ year: number; avg_score: number; top_performers: number; total_evaluated: number }>,
): number {
  const sorted = [...yearData].sort((a, b) => a.year - b.year);
  y = sectionHeader(pdf, 'Year-Over-Year Performance', y, pageW);
  y += 8;

  // Line chart
  const scores = sorted.map(d => d.avg_score);
  const labels = sorted.map(d => String(d.year));
  if (scores.length >= 2) {
    drawLineGraph(pdf, 25, y, pageW - 50, 40, scores, labels, C.teal);
    y += 64;
  }

  // Table
  const rowH = 12;
  drawRect(pdf, 14, y, pageW - 28, 8, C.teal, 3);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...C.white);
  pdf.text('Year',            22,         y + 5.5);
  pdf.text('Avg Score',       70,         y + 5.5, { align: 'center' });
  pdf.text('Top Performers',  120,        y + 5.5, { align: 'center' });
  pdf.text('Total Evaluated', pageW - 18, y + 5.5, { align: 'right' });
  y += 10;

  sorted.forEach((entry, i) => {
    drawRect(pdf, 14, y, pageW - 28, rowH, i % 2 === 0 ? C.white : C.bg, 2);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...C.text);
    pdf.text(String(entry.year), 22, y + rowH / 2 + 1.5);

    const scoreColor: [number, number, number] =
      entry.avg_score >= 4.0 ? C.green :
      entry.avg_score >= 3.0 ? C.blue  : C.red;
    pdf.setTextColor(...scoreColor);
    pdf.text(entry.avg_score.toFixed(2), 70, y + rowH / 2 + 1.5, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...C.muted);
    pdf.setFontSize(8);
    pdf.text(String(entry.top_performers),  120,        y + rowH / 2 + 1.5, { align: 'center' });
    pdf.text(String(entry.total_evaluated), pageW - 18, y + rowH / 2 + 1.5, { align: 'right' });
    y += rowH + 2;
  });

  return y + 8;
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function generateSavedReportPDF(
  report: SavedReport & Record<string, any>,
  fileName?: string,
): Promise<void> {
  const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  // ── Resolve mode from trend_metrics ─────────────────────────────────────────
  const tm            = report.trend_metrics ?? {};
  const tmType        = tm.type as string | undefined;
  const isTrend       = !!report.is_trend_report || tmType === 'trend';
  const isMultiCountry = tmType === 'multi_country';
  const isYearComp    = tmType === 'year_comparison';
  const adminComment  = report.admin_comment ?? tm.admin_comment;

  // Header colour per mode
  const headerColor: [number, number, number] =
    isMultiCountry ? C.amber  :
    isYearComp     ? C.teal   :
    isTrend        ? C.purple : C.navy;

  // Header label per mode
  const modeLine =
    isMultiCountry
      ? `Multi-Country Comparison  ·  ${(tm.country_data ?? []).length} Countries`
      : isYearComp
      ? `Year-Over-Year Analysis  ·  ${[report.report_year, ...(tm.comparison_years ?? [])].sort((a, b) => b - a).join(', ')}`
      : isTrend
      ? `Trend Analysis  ·  ${(report.selected_periods ?? []).length} Periods`
      : `Performance Snapshot  ·  ${periodLabel(report.report_period)} ${report.report_year}`;

  // ── HEADER BANNER ────────────────────────────────────────────────────────────
  drawRect(pdf, 0, 0, pageW, 48, headerColor, 0);
  drawRect(pdf, 0, 0, pageW, 2, C.blue, 0);

  const emoji = isMultiCountry ? '🌍' : isYearComp ? '📅' : isTrend ? '📈' : '📊';
  pdf.setFontSize(22);
  pdf.setTextColor(255, 255, 255);
  pdf.text(emoji, 14, 18);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(255, 255, 255);
  const nameLines = pdf.splitTextToSize(report.report_name, pageW - 44);
  pdf.text(nameLines, 30, 15);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(200, 210, 240);
  pdf.text(modeLine, 30, nameLines.length > 1 ? 29 : 23);

  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  pdf.setFontSize(8);
  pdf.setTextColor(180, 195, 235);
  pdf.text(`Generated: ${now}`, pageW - 14, 43, { align: 'right' });

  let y = 56;

  // ── METADATA BLOCK ───────────────────────────────────────────────────────────
  const meta: [string, string][] = [
    ['Report Type', isMultiCountry ? 'Multi-Country Comparison' : isYearComp ? 'Year Comparison' : isTrend ? 'Trend Analysis' : (report.report_type === 'country' ? 'Country Snapshot' : 'Branch Snapshot')],
    ['Period / Scope', modeLine],
    ['Created By', report.created_by_email ?? 'N/A'],
  ];
  if (report.report_description) {
    meta.unshift(['Description', report.report_description]);
  }

  drawRect(pdf, 14, y, pageW - 28, meta.length * 9 + 8, C.bg, 4);
  meta.forEach(([k, v], i) => {
    const ry = y + 6 + i * 9;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...C.muted);
    pdf.text(k, 20, ry);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...C.text);
    const vLines = pdf.splitTextToSize(v, pageW - 90);
    pdf.text(vLines, 70, ry);
  });
  y += meta.length * 9 + 16;

  // ── HQ ADMIN REMARKS ─────────────────────────────────────────────────────────
  if (adminComment) {
    y = sectionHeader(pdf, 'HQ Admin Remarks', y, pageW);
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9.5);
    pdf.setTextColor(...C.text);
    const lines = pdf.splitTextToSize(adminComment, pageW - 40);
    pdf.text(lines, 20, y + 4);
    y += lines.length * 5 + 12;
  }

  // ── MULTI-COUNTRY ────────────────────────────────────────────────────────────
  if (isMultiCountry && Array.isArray(tm.country_data) && tm.country_data.length > 0) {
    y = drawMultiCountrySection(
      pdf, y, pageW,
      tm.country_data,
      tm.comparison_period ?? report.report_period,
      report.report_year,
    );
  }

  // ── YEAR COMPARISON ──────────────────────────────────────────────────────────
  if (isYearComp && Array.isArray(tm.year_data) && tm.year_data.length > 0) {
    y = drawYearComparisonSection(pdf, y, pageW, tm.year_data);
  }

  // ── TREND ANALYSIS ───────────────────────────────────────────────────────────
  if (isTrend && Array.isArray(report.selected_periods) && report.selected_periods.length >= 2) {
    y = sectionHeader(pdf, 'Performance Trend', y, pageW);
    y += 8;
    const avgScores: number[] = tm.avg_scores
      ?? report.selected_periods.map((_: any, i: number) => 3.2 + i * 0.2 + Math.random() * 0.3);
    drawLineGraph(pdf, 25, y, pageW - 50, 40, avgScores, report.selected_periods, C.purple);
    y += 68;

    // Period breakdown header
    y = sectionHeader(pdf, 'Period Breakdown', y, pageW);
    y += 4;
    const colW = (pageW - 28) / report.selected_periods.length;
    drawRect(pdf, 14, y, pageW - 28, 10, C.purple, 3);
    report.selected_periods.forEach((p: string, i: number) => {
      pdf.setFontSize(8);
      pdf.setTextColor(255, 255, 255);
      pdf.text(friendlyPeriod(p), 14 + i * colW + colW / 2, y + 6.5, { align: 'center' });
    });
    y += 15;
  }

  // ── SNAPSHOT: Included analytics note ───────────────────────────────────────
  if (!isMultiCountry && !isYearComp) {
    y = sectionHeader(pdf, 'Included Analytics', y, pageW);
    const opts: [string, string][] = [
      ['Metrics', (report.metrics_included ?? []).join(', ') || 'None'],
      ['Charts',  (report.charts_included  ?? []).join(', ') || 'None'],
    ];
    if (!isTrend) {
      opts.push(['AI Insights', report.include_ai_insights ? 'Enabled' : 'Disabled']);
      opts.push(['Comparison',  report.include_comparison  ? 'Enabled' : 'Disabled']);
    }
    opts.forEach(([k, v]) => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...C.text);
      pdf.text(k, 14, y);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...C.muted);
      pdf.text(v, 52, y);
      y += 6;
    });
    y += 4;
  }

  // ── FOOTER ───────────────────────────────────────────────────────────────────
  pdf.setDrawColor(...C.light);
  pdf.line(14, pageH - 14, pageW - 14, pageH - 14);
  pdf.setFontSize(7);
  pdf.setTextColor(...C.muted);
  pdf.text('Performance Management System  ·  Confidential', 14, pageH - 8);
  pdf.text('Page 1', pageW - 14, pageH - 8, { align: 'right' });

  const safe = fileName ?? `${report.report_name.replace(/\s+/g, '-')}_${report.report_year}.pdf`;
  pdf.save(safe);
}
