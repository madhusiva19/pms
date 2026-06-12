/**
 * generateSavedReportPDF.ts
 *
 * Generates a professional programmatic PDF using jsPDF.
 * Supports two report modes stored in trend_metrics.type:
 *   'year_comparison' – multi-line trend chart across years
 *   'multi_country'   – horizontal bar chart + table per country
 *
 * Data shape (new):
 *   year_comparison: year_data = [{ year, mid_year?: { avg_score, top_performers, total_evaluated }, year_end?: {...} }]
 *   multi_country:   country_data = [{ country_id, country_name, mid_year?: {...}, year_end?: {...} }]
 */

import jsPDF from 'jspdf';
import type { SavedReport } from '@/types';

// ─── Logo loader ──────────────────────────────────────────────────────────────
async function loadLogoAsDataUrl(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const cnv = document.createElement('canvas');
        cnv.width = img.naturalWidth;
        cnv.height = img.naturalHeight;
        const ctx = cnv.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(cnv.toDataURL('image/png'));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ─── Colour palette ───────────────────────────────────────────────────────────
const C = {
  navy:   [30,  58,  138] as [number, number, number],
  blue:   [37,  99,  235] as [number, number, number],
  teal:   [8,   146, 184] as [number, number, number],
  green:  [0,   166, 62]  as [number, number, number],
  amber:  [245, 158, 11]  as [number, number, number],
  red:    [239, 68,  68]  as [number, number, number],
  text:   [16,  24,  40]  as [number, number, number],
  muted:  [100, 116, 139] as [number, number, number],
  light:  [226, 232, 240] as [number, number, number],
  bg:     [249, 250, 251] as [number, number, number],
  white:  [255, 255, 255] as [number, number, number],
};

// Series colours for multi-line chart (up to 5 series)
const SERIES_COLORS: [number, number, number][] = [
  C.blue, C.teal, C.amber, C.green, C.red,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function periodLabel(p: string): string {
  if (p === 'both')     return 'Mid-Year & Year-End';
  if (p === 'mid_year') return 'Mid-Year';
  return 'Year-End';
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

// ─── Professional multi-series line chart ────────────────────────────────────
/**
 * Draws a clean line chart with grid lines, labelled axes, dots, value labels,
 * and a legend — styled after the screenshot reference.
 *
 * @param series  Array of { label, color, data } — one entry per line
 * @param xLabels Labels for the x-axis (one per data point)
 * @param yMin    Minimum y value (e.g. 0 or 1)
 * @param yMax    Maximum y value (e.g. 5)
 */
function drawMultiLineChart(
  pdf: jsPDF,
  x: number, y: number, w: number, h: number,
  series: Array<{ label: string; color: [number, number, number]; data: number[] }>,
  xLabels: string[],
  yMin: number,
  yMax: number,
) {
  const PAD_LEFT   = 18;  // space for y-axis labels
  const PAD_BOTTOM = 14;  // space for x-axis labels
  const PAD_TOP    = 6;
  const PAD_RIGHT  = 6;

  const plotX = x + PAD_LEFT;
  const plotY = y + PAD_TOP;
  const plotW = w - PAD_LEFT - PAD_RIGHT;
  const plotH = h - PAD_TOP - PAD_BOTTOM;

  // White plot background
  pdf.setFillColor(...C.white);
  pdf.setDrawColor(...C.light);
  pdf.setLineWidth(0.2);
  pdf.rect(plotX, plotY, plotW, plotH, 'FD');

  const n       = xLabels.length;
  const yRange  = yMax - yMin;
  const Y_TICKS = 5;

  const toPlotX = (i: number) => plotX + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const toPlotY = (v: number) => plotY + plotH - ((v - yMin) / yRange) * plotH;

  // Horizontal grid lines + y-axis labels
  for (let t = 0; t <= Y_TICKS; t++) {
    const val    = yMin + (yRange * t) / Y_TICKS;
    const lineY  = toPlotY(val);

    pdf.setDrawColor(...C.light);
    pdf.setLineWidth(0.15);
    if (t > 0) pdf.line(plotX, lineY, plotX + plotW, lineY);

    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...C.muted);
    pdf.text(val.toFixed(1), plotX - 2, lineY + 1, { align: 'right' });
  }

  // X-axis labels
  xLabels.forEach((label, i) => {
    const lx = toPlotX(i);
    // Vertical tick mark
    pdf.setDrawColor(...C.light);
    pdf.setLineWidth(0.15);
    pdf.line(lx, plotY + plotH, lx, plotY + plotH + 2);

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...C.muted);
    pdf.text(label, lx, plotY + plotH + PAD_BOTTOM - 2, { align: 'center' });
  });

  // Draw each series
  series.forEach(({ color, data }) => {
    if (data.length === 0) return;

    pdf.setDrawColor(...color);
    pdf.setLineWidth(0.9);

    // Line segments
    for (let i = 0; i < data.length - 1; i++) {
      pdf.line(toPlotX(i), toPlotY(data[i]), toPlotX(i + 1), toPlotY(data[i + 1]));
    }

    // Dots + value labels
    data.forEach((v, i) => {
      const px = toPlotX(i);
      const py = toPlotY(v);

      // White halo so dots stand out on grid lines
      pdf.setFillColor(...C.white);
      pdf.circle(px, py, 2, 'F');

      // Coloured dot
      pdf.setFillColor(...color);
      pdf.circle(px, py, 1.4, 'F');

      // Value label above the dot (with enough clearance)
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.5);
      pdf.setTextColor(...C.text);
      pdf.text(v.toFixed(2), px, py - 3, { align: 'center' });
    });
  });

  // Legend (below chart, left-aligned)
  const legendY = y + h + 4;
  let legendX   = x + PAD_LEFT;
  series.forEach(({ label, color }) => {
    pdf.setFillColor(...color);
    pdf.rect(legendX, legendY, 6, 2.5, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...C.text);
    pdf.text(label, legendX + 8, legendY + 2.2);
    legendX += pdf.getTextWidth(label) + 20;
  });
}

// ─── Year-over-year section ───────────────────────────────────────────────────
function drawYearComparisonSection(
  pdf: jsPDF, y: number, pageW: number,
  yearData: Array<Record<string, any>>,
  period: string,
): number {
  const sorted = [...yearData].sort((a, b) => a.year - b.year);
  const xLabels = sorted.map(d => String(d.year));

  // Build series from nested or flat structure
  const hasMid  = period === 'mid_year' || period === 'both';
  const hasEnd  = period === 'year_end'  || period === 'both';
  const series: Array<{ label: string; color: [number, number, number]; data: number[] }> = [];

  if (hasMid) {
    const data = sorted.map(d =>
      typeof d.mid_year === 'object' ? d.mid_year?.avg_score :
      (period === 'mid_year' ? d.avg_score : null)
    ).filter((v): v is number => v != null);
    if (data.length) series.push({ label: 'Mid-Year Avg Score', color: C.teal, data });
  }
  if (hasEnd) {
    const data = sorted.map(d =>
      typeof d.year_end === 'object' ? d.year_end?.avg_score :
      (period === 'year_end' || !period ? d.avg_score : null)
    ).filter((v): v is number => v != null);
    if (data.length) series.push({ label: 'Year-End Avg Score', color: C.blue, data });
  }

  if (series.length === 0) return y;

  y = sectionHeader(pdf, 'Year-Over-Year Performance Trend', y, pageW);
  y += 6;

  const chartH = 52;
  const allVals = series.flatMap(s => s.data);
  const yMin = Math.max(0, Math.floor(Math.min(...allVals) * 2) / 2 - 0.5);
  const yMax = Math.min(5, Math.ceil(Math.max(...allVals)  * 2) / 2 + 0.5);

  drawMultiLineChart(pdf, 14, y, pageW - 28, chartH, series, xLabels, yMin, yMax);
  y += chartH + 14; // extra for legend row

  // Summary table
  y = sectionHeader(pdf, 'Year-by-Year Breakdown', y, pageW);
  y += 4;

  const periods = [...(hasMid ? ['mid_year'] : []), ...(hasEnd ? ['year_end'] : [])];

  // Header row
  const colX = { year: 22, period: 60, avg: 100, top: 135, total: pageW - 18 };
  drawRect(pdf, 14, y, pageW - 28, 8, C.navy, 3);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...C.white);
  pdf.text('Year',            colX.year,  y + 5.5);
  pdf.text('Period',          colX.period, y + 5.5);
  pdf.text('Avg Score',       colX.avg,   y + 5.5, { align: 'center' });
  pdf.text('Top Performers',  colX.top,   y + 5.5, { align: 'center' });
  pdf.text('Total Evaluated', colX.total, y + 5.5, { align: 'right' });
  y += 10;

  let rowIdx = 0;
  sorted.forEach(entry => {
    periods.forEach(p => {
      const d = typeof entry[p] === 'object' ? entry[p] :
                (periods.length === 1 ? { avg_score: entry.avg_score, top_performers: entry.top_performers, total_evaluated: entry.total_evaluated } : null);
      if (!d) return;

      const rowH = 11;
      drawRect(pdf, 14, y, pageW - 28, rowH, rowIdx++ % 2 === 0 ? C.white : C.bg, 2);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...C.text);
      pdf.text(String(entry.year), colX.year, y + rowH / 2 + 1.5);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...C.muted);
      pdf.text(p === 'mid_year' ? 'Mid-Year' : 'Year-End', colX.period, y + rowH / 2 + 1.5);

      const scoreColor: [number, number, number] =
        d.avg_score >= 4.0 ? C.green :
        d.avg_score >= 3.0 ? C.blue  : C.red;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...scoreColor);
      pdf.text(d.avg_score.toFixed(2), colX.avg, y + rowH / 2 + 1.5, { align: 'center' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...C.muted);
      pdf.text(String(d.top_performers),  colX.top,   y + rowH / 2 + 1.5, { align: 'center' });
      pdf.text(String(d.total_evaluated), colX.total, y + rowH / 2 + 1.5, { align: 'right' });
      y += rowH + 1.5;
    });
  });

  return y + 10;
}

// ─── Multi-country section ────────────────────────────────────────────────────
function drawMultiCountrySection(
  pdf: jsPDF, y: number, pageW: number,
  countryData: Array<Record<string, any>>,
  period: string,
  reportYear: number,
): number {
  const hasMid = period === 'mid_year' || period === 'both';
  const hasEnd = period === 'year_end'  || period === 'both';
  const periods = [...(hasMid ? ['mid_year'] : []), ...(hasEnd ? ['year_end'] : [])];

  // If 'both', draw a grouped line chart (one line per period, x = countries)
  if (period === 'both') {
    const xLabels = countryData.map(d => d.country_name as string);
    const series: Array<{ label: string; color: [number, number, number]; data: number[] }> = [];

    const midData = countryData.map(d => d.mid_year?.avg_score).filter((v): v is number => v != null);
    const endData = countryData.map(d => d.year_end?.avg_score).filter((v): v is number => v != null);
    if (midData.length) series.push({ label: 'Mid-Year Avg Score', color: C.teal, data: midData });
    if (endData.length) series.push({ label: 'Year-End Avg Score', color: C.blue, data: endData });

    if (series.length > 0) {
      y = sectionHeader(pdf, `Country Comparison — ${reportYear}`, y, pageW);
      y += 6;
      const allVals = series.flatMap(s => s.data);
      const yMin = Math.max(0, Math.floor(Math.min(...allVals) * 2) / 2 - 0.5);
      const yMax = Math.min(5, Math.ceil(Math.max(...allVals)  * 2) / 2 + 0.5);
      drawMultiLineChart(pdf, 14, y, pageW - 28, 52, series, xLabels, yMin, yMax);
      y += 70;
    }
  }

  // Table for each period
  periods.forEach(p => {
    const rows = countryData
      .map(d => {
        const s = typeof d[p] === 'object' ? d[p] :
                  (periods.length === 1 ? { avg_score: d.avg_score, top_performers: d.top_performers, total_evaluated: d.total_evaluated } : null);
        return s ? { name: d.country_name as string, ...s } : null;
      })
      .filter(Boolean) as Array<{ name: string; avg_score: number; top_performers: number; total_evaluated: number }>;

    if (rows.length === 0) return;

    const label = period === 'both'
      ? (p === 'mid_year' ? 'Mid-Year Breakdown' : 'Year-End Breakdown')
      : `Country Comparison — ${periodLabel(p)} ${reportYear}`;

    y = sectionHeader(pdf, label, y, pageW);
    y += 4;

    const maxScore = Math.max(...rows.map(r => r.avg_score), 5);
    const rowH = 13;

    // Column headers
    drawRect(pdf, 14, y, pageW - 28, 8, C.navy, 3);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...C.white);
    pdf.text('Country',         20,          y + 5.5);
    pdf.text('Avg Score',       pageW - 92,  y + 5.5, { align: 'center' });
    pdf.text('Top Performers',  pageW - 56,  y + 5.5, { align: 'center' });
    pdf.text('Evaluated',       pageW - 18,  y + 5.5, { align: 'right' });
    y += 10;

    rows.forEach((row, i) => {
      drawRect(pdf, 14, y, pageW - 28, rowH, i % 2 === 0 ? C.white : C.bg, 2);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...C.text);
      pdf.text(row.name, 20, y + rowH / 2 + 1.5);

      // Score bar
      const barMaxW = 44;
      const barW    = (row.avg_score / maxScore) * barMaxW;
      const barX    = pageW - 120;
      const barY    = y + 3;
      const barH    = rowH - 6;
      drawRect(pdf, barX, barY, barMaxW, barH, C.light, 2);
      const scoreColor: [number, number, number] =
        row.avg_score >= 4.0 ? C.green :
        row.avg_score >= 3.0 ? C.blue  : C.red;
      drawRect(pdf, barX, barY, Math.max(barW, 1), barH, scoreColor, 2);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...C.text);
      pdf.text(row.avg_score.toFixed(2), barX + barMaxW + 2, y + rowH / 2 + 1.5);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...C.muted);
      pdf.text(String(row.top_performers), pageW - 56, y + rowH / 2 + 1.5, { align: 'center' });
      pdf.text(String(row.total_evaluated), pageW - 18, y + rowH / 2 + 1.5, { align: 'right' });
      y += rowH + 1.5;
    });

    y += 10;
  });

  return y;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateSavedReportPDF(
  report: SavedReport & Record<string, any>,
  fileName?: string,
): Promise<void> {
  const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const tm             = report.trend_metrics ?? {};
  const tmType         = tm.type as string | undefined;
  const isMultiCountry = tmType === 'multi_country';
  const isYearComp     = tmType === 'year_comparison';
  const adminComment   = report.admin_comment ?? tm.admin_comment;
  const period         = tm.period ?? tm.comparison_period ?? report.report_period ?? 'year_end';

  const modeTitle =
    isMultiCountry ? 'Multi-Country Report' :
    isYearComp     ? 'Year Comparison Report' : 'Performance Report';

  const modeLine =
    isMultiCountry
      ? `Multi-Country  ·  ${(tm.country_data ?? []).length} Countries  ·  ${periodLabel(period)}`
      : isYearComp
      ? `${[report.report_year, ...(tm.comparison_years ?? [])].sort((a: number, b: number) => b - a).join(', ')}  ·  ${periodLabel(period)}`
      : `Snapshot  ·  ${periodLabel(period)} ${report.report_year}`;

  // ── Header bar ──────────────────────────────────────────────────────────────
  const logoDataUrl = await loadLogoAsDataUrl('/Dart_Logo_new.png');

  pdf.setFillColor(...C.navy);
  pdf.rect(0, 0, pageW, 17, 'F');

  if (logoDataUrl) pdf.addImage(logoDataUrl, 'PNG', 4, 2, 18, 13);

  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text('DART Global Logistics', 25, 8);

  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(147, 197, 253);
  pdf.text('Performance Management System', 25, 13.5);

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(255, 255, 255);
  pdf.text(modeTitle, pageW - 5, 8, { align: 'right' });

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(147, 197, 253);
  pdf.text('Confidential — Internal Use Only', pageW - 5, 13.5, { align: 'right' });

  // ── Context row ─────────────────────────────────────────────────────────────
  const ctxTop = 22;
  pdf.setFillColor(...C.bg);
  pdf.rect(0, ctxTop, pageW, 13, 'F');
  pdf.setDrawColor(...C.light);
  pdf.setLineWidth(0.2);
  pdf.line(0, ctxTop, pageW, ctxTop);
  pdf.line(0, ctxTop + 13, pageW, ctxTop + 13);

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.muted);
  pdf.text('REPORT', 5, ctxTop + 5);

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.text);
  pdf.text(pdf.splitTextToSize(report.report_name, pageW * 0.55)[0], 5, ctxTop + 11.5);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.blue);
  pdf.text(modeLine, pageW - 5, ctxTop + 5, { align: 'right' });

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.muted);
  pdf.text(
    `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    pageW - 5, ctxTop + 11.5, { align: 'right' },
  );

  let y = ctxTop + 13 + 8;

  // ── Metadata block ──────────────────────────────────────────────────────────
  const meta: [string, string][] = [
    ['Report Type',   isMultiCountry ? 'Multi-Country Comparison' : isYearComp ? 'Year-Over-Year Comparison' : 'Performance Report'],
    ['Period / Scope', modeLine],
    ['Created By',    report.created_by_email ?? 'N/A'],
  ];
  if (report.report_description) meta.unshift(['Description', report.report_description]);

  drawRect(pdf, 14, y, pageW - 28, meta.length * 9 + 8, C.bg, 4);
  meta.forEach(([k, v], i) => {
    const ry = y + 6 + i * 9;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...C.muted);
    pdf.text(k, 20, ry);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...C.text);
    pdf.text(pdf.splitTextToSize(v, pageW - 90), 70, ry);
  });
  y += meta.length * 9 + 16;

  // ── HQ Admin Remarks ────────────────────────────────────────────────────────
  if (adminComment) {
    y = sectionHeader(pdf, 'HQ Admin Remarks', y, pageW);
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9.5);
    pdf.setTextColor(...C.text);
    const lines = pdf.splitTextToSize(adminComment, pageW - 40);
    pdf.text(lines, 20, y + 4);
    y += lines.length * 5 + 12;
  }

  // ── Year comparison ─────────────────────────────────────────────────────────
  if (isYearComp && Array.isArray(tm.year_data) && tm.year_data.length > 0) {
    y = drawYearComparisonSection(pdf, y, pageW, tm.year_data, period);
  }

  // ── Multi-country ───────────────────────────────────────────────────────────
  if (isMultiCountry && Array.isArray(tm.country_data) && tm.country_data.length > 0) {
    y = drawMultiCountrySection(pdf, y, pageW, tm.country_data, period, report.report_year);
  }

  // ── Footer on every page ────────────────────────────────────────────────────
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(...C.light);
    pdf.line(14, pageH - 14, pageW - 14, pageH - 14);
    pdf.setFontSize(7);
    pdf.setTextColor(...C.muted);
    pdf.text('Performance Management System  ·  Confidential', 14, pageH - 8);
    pdf.text(`Page ${i} of ${totalPages}`, pageW - 14, pageH - 8, { align: 'right' });
  }

  const safe = fileName ?? `${report.report_name.replace(/\s+/g, '-')}_${report.report_year}.pdf`;
  pdf.save(safe);
}
