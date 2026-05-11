// utils/downloadReport.ts

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export interface ReportHeaderInfo {
  entityType: string;
  entityName: string;
  reportPeriod?: string;
  reportYear: number;
  metrics?: {
    totalEvaluated?: number;
    avgScore?: string;
    topPerformers?: number;
    employeeScore?: string;
  };
  generatedAt: Date;
}

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
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function downloadReportAsPDF(
  elementId: string,
  fileName: string = 'performance-report.pdf',
  headerInfo?: ReportHeaderInfo
): Promise<string> {
  const element = document.getElementById(elementId);
  if (!element) throw new Error('Report element not found');

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#FFFFFF',
    logging: false,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  let contentStartY = 0;

  if (headerInfo) {
    const logoDataUrl = await loadLogoAsDataUrl('/Dart_Logo_new.png');

    // ─── Colour palette (matching generateSavedReportPDF) ──────────────────────
    const C = {
      navy:    [30, 58, 138]   as [number, number, number],
      blue:    [37, 99, 235]   as [number, number, number],
      text:    [16, 24, 40]    as [number, number, number],
      muted:   [74, 85, 101]   as [number, number, number],
      light:   [226, 232, 240] as [number, number, number],
      bg:      [249, 250, 251] as [number, number, number],
      white:   [255, 255, 255] as [number, number, number],
    };

    // ── Branding bar (0–17 mm) ───────────────────────────────────────
    pdf.setFillColor(...C.navy);
    pdf.rect(0, 0, pageWidth, 17, 'F');

    if (logoDataUrl) {
      pdf.addImage(logoDataUrl, 'PNG', 4, 2, 18, 13);
    }

    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...C.white);
    pdf.text('DART Global Logistics', 25, 8);

    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(147, 197, 253);
    pdf.text('Performance Management System', 25, 13.5);

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...C.white);
    pdf.text('Performance Report', pageWidth - 5, 8, { align: 'right' });

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(147, 197, 253);
    pdf.text('Confidential — Internal Use Only', pageWidth - 5, 13.5, { align: 'right' });

    // ── Gap between branding bar and context row (17–22 mm) ──────────
    pdf.setFillColor(...C.white);
    pdf.rect(0, 17, pageWidth, 5, 'F');

    // ── Context row (22–35 mm) ───────────────────────────────────────
    const contextTop = 22;
    pdf.setFillColor(...C.bg);
    pdf.rect(0, contextTop, pageWidth, 13, 'F');
    pdf.setDrawColor(...C.light);
    pdf.setLineWidth(0.2);
    pdf.line(0, contextTop, pageWidth, contextTop);
    pdf.line(0, contextTop + 13, pageWidth, contextTop + 13);

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...C.muted);
    pdf.text(`${headerInfo.entityType.toUpperCase()} REPORT`, 5, contextTop + 5);

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...C.text);
    pdf.text(headerInfo.entityName, 5, contextTop + 11.5);

    const periodLabel = headerInfo.reportPeriod
      ? `${headerInfo.reportPeriod} ${headerInfo.reportYear}`
      : `Full Year ${headerInfo.reportYear}`;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...C.blue);
    pdf.text(periodLabel, pageWidth - 5, contextTop + 5, { align: 'right' });

    const genDate = headerInfo.generatedAt.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const genTime = headerInfo.generatedAt.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit',
    });
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...C.muted);
    pdf.text(`Generated: ${genDate} at ${genTime}`, pageWidth - 5, contextTop + 11.5, { align: 'right' });

    contentStartY = contextTop + 13;

    // ── Gap between context row and metrics row (35–40 mm) ───────────
    pdf.setFillColor(...C.white);
    pdf.rect(0, contentStartY, pageWidth, 5, 'F');

    // ── Metrics row (40–53 mm) ───────────────────────────────────────
    if (headerInfo.metrics) {
      const m = headerInfo.metrics;
      const metricsTop = contentStartY + 8;

      pdf.setFillColor(...C.white);
      pdf.rect(0, metricsTop, pageWidth, 13, 'F');
      pdf.setDrawColor(...C.light);
      pdf.setLineWidth(0.2);
      pdf.line(0, metricsTop, pageWidth, metricsTop);
      pdf.line(0, metricsTop + 13, pageWidth, metricsTop + 13);

      const colW = pageWidth / 3;
      pdf.line(colW, metricsTop, colW, metricsTop + 13);
      pdf.line(colW * 2, metricsTop, colW * 2, metricsTop + 13);

      const drawMetric = (cx: number, label: string, value: string) => {
        pdf.setFontSize(6);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...C.muted);
        pdf.text(label, cx, metricsTop + 4.5, { align: 'center' });
        pdf.setFontSize(13);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...C.text);
        pdf.text(value, cx, metricsTop + 11, { align: 'center' });
      };

      const scoreLabel = m.employeeScore !== undefined ? 'SCORE (MID / END)' : 'AVG SCORE';
      const scoreValue = m.employeeScore ?? m.avgScore ?? '—';

      drawMetric(colW * 0.5, 'TOTAL EVALUATED', String(m.totalEvaluated ?? '—'));
      drawMetric(colW * 1.5, scoreLabel, scoreValue);
      drawMetric(colW * 2.5, 'TOP PERFORMERS', String(m.topPerformers ?? '—'));

      contentStartY = metricsTop + 14;
    }
  }

  // ── Place html2canvas image below the header ─────────────────────
  const imgData = canvas.toDataURL('image/png');
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  pdf.addImage(imgData, 'PNG', 0, contentStartY, imgWidth, imgHeight);
  let heightLeft = imgHeight - (pageHeight - contentStartY);

  while (heightLeft > 0) {
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, heightLeft - imgHeight, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  // ── Add professional footer to all pages ────────────────────────────
  const totalPages = pdf.getNumberOfPages();
  const C = {
    light:   [226, 232, 240] as [number, number, number],
    muted:   [74, 85, 101]   as [number, number, number],
  };

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(...C.light);
    pdf.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);
    pdf.setFontSize(7);
    pdf.setTextColor(...C.muted);
    pdf.text('Performance Management System  ·  Confidential', 14, pageHeight - 8);
    pdf.text(`Page ${i}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
  }

  pdf.save(fileName);
  return `local://${fileName}`;
}