/**
 * generateProfilePDF.ts
 *
 * Generates a professional branded PDF of an employee's profile:
 *   - DGL navy header bar (matches generateSavedReportPDF and downloadReport)
 *   - Employee info block  (designation, department, branch, IATA)
 *   - Performance summary  (score + talent block side-by-side)
 *   - Achievement diary    (paginated table, colour-coded by status)
 *   - Supervisor comments  (if present)
 *
 * Uses jsPDF directly — no html2canvas — so output is crisp at any zoom.
 */

import jsPDF from 'jspdf';
import type { SelfAchievement, SupervisorComment } from '@/components/profile/ProfileTemplate';

// ─── Public data shape ────────────────────────────────────────────────────────
export interface ProfilePDFData {
  name:             string;
  role:             string;
  email?:           string | null;
  designation?:     string | null;
  department?:      string | null;
  branch?:          string | null;
  country?:         string | null;
  iataCode?:        string | null;
  joinedDate?:      string | null;
  dob?:             string | null;
  avatarUrl?:       string | null;
  performanceScore?: number | null;
  potentialBlock?:  'H' | 'M' | 'L' | null;
  cycleYear?:       number | null;
  cyclePeriod?:     string | null;
  achievements:     SelfAchievement[];
  supervisorComments?: SupervisorComment[];
}

// ─── Colour palette (identical to generateSavedReportPDF) ────────────────────
const C = {
  navy:  [30,  58,  138] as [number, number, number],
  blue:  [37,  99,  235] as [number, number, number],
  green: [0,   166, 62]  as [number, number, number],
  amber: [245, 158, 11]  as [number, number, number],
  red:   [239, 68,  68]  as [number, number, number],
  text:  [16,  24,  40]  as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  light: [226, 232, 240] as [number, number, number],
  bg:    [249, 250, 251] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

// ─── Logo cache — loaded once per session, not on every click ────────────────
// undefined = not yet attempted; null = failed; string = ready
let _logoCache: string | null | undefined = undefined;
let _logoPromise: Promise<string | null> | null = null;

function loadLogoAsDataUrl(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const cnv = document.createElement('canvas');
        cnv.width  = img.naturalWidth;
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

function getLogoDataUrl(): Promise<string | null> {
  // Return cached result immediately if already resolved
  if (_logoCache !== undefined) return Promise.resolve(_logoCache);
  // Re-use the in-flight promise if already loading (prevents parallel fetches)
  if (_logoPromise) return _logoPromise;
  _logoPromise = loadLogoAsDataUrl('/Dart_Logo_new.png').then((result) => {
    _logoCache   = result;
    _logoPromise = null;
    return result;
  });
  return _logoPromise;
}

/**
 * Call this once when the profile page mounts so the logo is ready
 * before the user ever clicks Download PDF.
 */
export function preloadProfilePDFAssets(): void {
  getLogoDataUrl(); // fire-and-forget — result gets cached automatically
}

// Loads an avatar URL and returns a data URL with the image pre-clipped to a circle.
// Returns null if the URL is missing or fails to load (CORS, network, etc.).
async function loadAvatarAsCircleDataUrl(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 120; // canvas resolution — rendered at 18 mm in the PDF
        const cnv  = document.createElement('canvas');
        cnv.width  = size;
        cnv.height = size;
        const ctx  = cnv.getContext('2d');
        if (!ctx) { resolve(null); return; }
        // Clip to a circle before drawing so transparent corners are preserved
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();
        // Cover-fit the source image into the square canvas
        const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
        const sw    = img.naturalWidth  * scale;
        const sh    = img.naturalHeight * scale;
        ctx.drawImage(img, (size - sw) / 2, (size - sh) / 2, sw, sh);
        resolve(cnv.toDataURL('image/png'));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
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

// Returns updated y, adding a new page if the next block won't fit
function ensureSpace(pdf: jsPDF, y: number, pageH: number, needed: number): number {
  if (y + needed > pageH - 18) { pdf.addPage(); return 15; }
  return y;
}

// Format a date string for display (e.g. "2024-06-15" -> "15 Jun 2024")
function fmtDate(raw: string | null | undefined): string {
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return raw; }
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateProfilePDF(
  data: ProfilePDFData,
  fileName?: string,
): Promise<void> {

  const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  const logoDataUrl   = await getLogoDataUrl();
  const avatarDataUrl = data.avatarUrl ? await loadAvatarAsCircleDataUrl(data.avatarUrl) : null;

  // ── Header bar (0–17 mm) ─────────────────────────────────────────────────
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
  pdf.text('Employee Profile', pageW - 5, 8, { align: 'right' });

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(147, 197, 253);
  pdf.text('Confidential — Internal Use Only', pageW - 5, 13.5, { align: 'right' });

  // ── Context row (expands to 24 mm when avatar is present) ──────────────
  const ctxTop = 22;
  const ctxH   = avatarDataUrl ? 24 : 13;

  pdf.setFillColor(...C.bg);
  pdf.rect(0, ctxTop, pageW, ctxH, 'F');
  pdf.setDrawColor(...C.light);
  pdf.setLineWidth(0.2);
  pdf.line(0, ctxTop,        pageW, ctxTop);
  pdf.line(0, ctxTop + ctxH, pageW, ctxTop + ctxH);

  // Avatar — circular, right-aligned
  const avatarSize = 18;
  const avatarX    = pageW - 5 - avatarSize;
  const avatarY    = ctxTop + (ctxH - avatarSize) / 2;
  if (avatarDataUrl) {
    pdf.addImage(avatarDataUrl, 'PNG', avatarX, avatarY, avatarSize, avatarSize);
    // thin border ring
    pdf.setDrawColor(...C.light);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(avatarX, avatarY, avatarSize, avatarSize, avatarSize / 2, avatarSize / 2, 'S');
  }

  // Keep role/date to the left of the avatar so they don't overlap
  const textRightX = avatarDataUrl ? avatarX - 3 : pageW - 5;

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.muted);
  pdf.text('EMPLOYEE PROFILE', 5, ctxTop + 5);

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.text);
  pdf.text(data.name, 5, ctxTop + (ctxH > 13 ? 14 : 11.5));

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...C.blue);
  pdf.text(data.role, textRightX, ctxTop + (ctxH > 13 ? 7 : 5), { align: 'right' });

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...C.muted);
  pdf.text(
    `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    textRightX, ctxTop + (ctxH > 13 ? 20 : 11.5), { align: 'right' },
  );

  let y = ctxTop + ctxH + 8;

  // ── Employee info block ──────────────────────────────────────────────────
  const infoFields: [string, string][] = [
    ['Designation',  data.designation  || '—'],
    ['Email',        data.email        || '—'],
    ['Date Joined',  fmtDate(data.joinedDate)],
    ['Date of Birth', fmtDate(data.dob)],
    ...(data.department ? [['Department', data.department] as [string, string]] : []),
    ...(data.branch     ? [['Branch',     data.branch]     as [string, string]] : []),
    ...(data.country    ? [['Country',    data.country]    as [string, string]] : []),
    ...(data.iataCode   ? [['IATA Code',  data.iataCode]   as [string, string]] : []),
  ];

  const infoH = infoFields.length * 9 + 8;
  drawRect(pdf, 14, y, pageW - 28, infoH, C.bg, 4);
  infoFields.forEach(([k, v], i) => {
    const ry = y + 6 + i * 9;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...C.muted);
    pdf.text(k, 20, ry);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...C.text);
    pdf.text(String(v), 75, ry);
  });
  y += infoH + 10;

  // ── Performance summary (score + talent block side-by-side) ─────────────
  const hasScore = data.performanceScore != null;
  const hasTalent = !!data.potentialBlock;

  if (hasScore || hasTalent) {
    y = ensureSpace(pdf, y, pageH, 36);
    y = sectionHeader(pdf, 'Performance Summary', y, pageW);
    y += 2;

    const cardW = (pageW - 32) / 2;
    const cardH = 22;

    // Score card (left)
    if (hasScore) {
      const scoreColor: [number, number, number] =
        (data.performanceScore as number) >= 4.0 ? C.green :
        (data.performanceScore as number) >= 3.0 ? C.blue  : C.red;

      drawRect(pdf, 14, y, cardW, cardH, C.bg, 4);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...C.muted);
      pdf.text('PERFORMANCE SCORE', 20, y + 7);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.setTextColor(...scoreColor);
      const scoreStr = (data.performanceScore as number).toFixed(2);
      pdf.text(scoreStr, 20, y + 17);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...C.muted);
      pdf.text('/ 5.00', 20 + pdf.getTextWidth(scoreStr) + 2, y + 17);

      // Period label if available
      if (data.cyclePeriod && data.cycleYear) {
        pdf.setFontSize(7);
        pdf.setTextColor(...C.muted);
        pdf.text(`${data.cyclePeriod} ${data.cycleYear}`, cardW + 10, y + 7, { align: 'right' });
      }
    }

    // Talent block card (right)
    if (hasTalent) {
      const blockMap: Record<string, { bg: [number,number,number]; fg: [number,number,number]; label: string }> = {
        H: { bg: [220, 252, 231], fg: [22,  101, 52],  label: 'High Potential'   },
        M: { bg: [254, 249, 195], fg: [133, 77,  14],  label: 'Medium Potential' },
        L: { bg: [254, 226, 226], fg: [153, 27,  27],  label: 'Low Potential'    },
      };
      const block  = blockMap[data.potentialBlock as string]
                  ?? { bg: C.bg, fg: C.text as [number,number,number], label: data.potentialBlock as string };
      const cardX  = 14 + cardW + 4;

      drawRect(pdf, cardX, y, cardW, cardH, C.bg, 4);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...C.muted);
      pdf.text('TALENT BLOCK', cardX + 6, y + 7);

      const badgeLabel = block.label;
      const badgeW     = pdf.getTextWidth(badgeLabel) + 10;
      drawRect(pdf, cardX + 6, y + 10, badgeW, 8, block.bg, 3);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(...block.fg);
      pdf.text(badgeLabel, cardX + 11, y + 15.5);
    }

    y += cardH + 12;
  }

  // ── Achievement diary ────────────────────────────────────────────────────
  const allEntries = [
    ...data.achievements.filter(a => a.status === 'approved'),
    ...data.achievements.filter(a => a.status === 'pending'),
    ...data.achievements.filter(a => a.status === 'rejected'),
  ];

  y = ensureSpace(pdf, y, pageH, 30);
  y = sectionHeader(
    pdf,
    `Achievement Diary${allEntries.length > 0 ? ` (${allEntries.length} Entries)` : ''}`,
    y, pageW,
  );
  y += 4;

  if (allEntries.length === 0) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9);
    pdf.setTextColor(...C.muted);
    pdf.text('No diary entries recorded.', 20, y + 4);
    y += 14;
  } else {
    const statusColors: Record<string, [number,number,number]> = {
      approved: C.green,
      pending:  C.amber,
      rejected: C.red,
    };

    // Column x-positions
    const COL_DATE    = 20;
    const COL_CONTENT = 52;
    const COL_STATUS  = pageW - 18;
    const CONTENT_W   = COL_STATUS - COL_CONTENT - 26;

    let rowIdx = 0;

    const drawDiaryHeader = () => {
      drawRect(pdf, 14, y, pageW - 28, 8, C.navy, 3);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...C.white);
      pdf.text('Date',        COL_DATE,    y + 5.5);
      pdf.text('Achievement', COL_CONTENT, y + 5.5);
      pdf.text('Status',      COL_STATUS,  y + 5.5, { align: 'right' });
      y += 10;
      rowIdx = 0;
    };
    drawDiaryHeader();

    for (const entry of allEntries) {
      const lines  = pdf.splitTextToSize(entry.content, CONTENT_W);
      const rowH   = Math.max(11, lines.length * 5 + 4);
      const sColor = statusColors[entry.status] ?? C.muted;

      if (y + rowH + 2 > pageH - 18) {
        pdf.addPage();
        y = 15;
        drawDiaryHeader();
      }

      drawRect(pdf, 14, y, pageW - 28, rowH, rowIdx % 2 === 0 ? C.white : C.bg, 2);

      // Date
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...C.muted);
      pdf.text(fmtDate(entry.date), COL_DATE, y + rowH / 2 + 1.5);

      // Content (may wrap)
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...C.text);
      pdf.text(lines, COL_CONTENT, y + 5.5);

      // Status badge
      const statusLabel = entry.status.charAt(0).toUpperCase() + entry.status.slice(1);
      const badgeW = pdf.getTextWidth(statusLabel) + 6;
      drawRect(pdf,
        COL_STATUS - badgeW - 2, y + rowH / 2 - 2.5,
        badgeW, 6,
        sColor.map(v => Math.min(255, v + 180)) as [number,number,number],
        2,
      );
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(...sColor);
      pdf.text(statusLabel, COL_STATUS - badgeW + 1, y + rowH / 2 + 1.2);

      y     += rowH + 1.5;
      rowIdx++;
    }
    y += 8;
  }

  // ── Supervisor comments ──────────────────────────────────────────────────
  const comments = data.supervisorComments ?? [];
  if (comments.length > 0) {
    y = ensureSpace(pdf, y, pageH, 30);
    y = sectionHeader(pdf, `Supervisor Comments (${comments.length})`, y, pageW);
    y += 4;

    const COL_DATE_C  = 20;
    const COL_SUP     = 56;
    const COL_COMMENT = 110;
    const COMMENT_W   = pageW - COL_COMMENT - 18;

    let rowIdx = 0;

    const drawCommentHeader = () => {
      drawRect(pdf, 14, y, pageW - 28, 8, C.navy, 3);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...C.white);
      pdf.text('Date',       COL_DATE_C,  y + 5.5);
      pdf.text('Supervisor', COL_SUP,     y + 5.5);
      pdf.text('Comment',    COL_COMMENT, y + 5.5);
      y += 10;
      rowIdx = 0;
    };
    drawCommentHeader();

    for (const c of comments) {
      const lines = pdf.splitTextToSize(c.comment, COMMENT_W);
      const rowH  = Math.max(11, lines.length * 5 + 4);

      if (y + rowH + 2 > pageH - 18) {
        pdf.addPage();
        y = 15;
        drawCommentHeader();
      }

      drawRect(pdf, 14, y, pageW - 28, rowH, rowIdx % 2 === 0 ? C.white : C.bg, 2);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...C.muted);
      pdf.text(fmtDate(c.date), COL_DATE_C, y + rowH / 2 + 1.5);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...C.text);
      pdf.text(c.supervisorName || '—', COL_SUP, y + rowH / 2 + 1.5);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...C.text);
      pdf.text(lines, COL_COMMENT, y + 5.5);

      y     += rowH + 1.5;
      rowIdx++;
    }
    y += 8;
  }

  // ── Footer on every page ─────────────────────────────────────────────────
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

  const safe = fileName ?? `${data.name.replace(/\s+/g, '-')}_Profile.pdf`;
  pdf.save(safe);
}