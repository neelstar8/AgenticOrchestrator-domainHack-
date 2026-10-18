import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import type {
  ProviderContext,
  ProviderDescriptor,
  ProviderResult,
  ReportDocumentInput,
  ReportDocumentSection,
  ReportGenerationProvider,
} from "@/agents/providers/types";
import { providerFailed, providerOk } from "@/agents/providers/types";

/**
 * Real PDF generation with pdf-lib.
 *
 * This provider is live in every mode — it runs locally, needs no credentials
 * and produces a genuine PDF file. What it renders may describe simulated
 * findings, which is why `simulationNotice` is printed in a caution block on
 * the cover page and repeated in the footer of every page: an exported
 * document must carry its provenance even after it leaves the application.
 */

const PAGE_WIDTH = 595.28; // A4 portrait
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLOR_TEXT = rgb(0.08, 0.09, 0.11);
const COLOR_MUTED = rgb(0.42, 0.45, 0.5);
const COLOR_ACCENT = rgb(0.13, 0.33, 0.62);
const COLOR_CAUTION_BG = rgb(0.99, 0.96, 0.89);
const COLOR_CAUTION_BORDER = rgb(0.82, 0.62, 0.21);
const COLOR_RULE = rgb(0.85, 0.87, 0.9);
const COLOR_TABLE_HEADER_BG = rgb(0.95, 0.96, 0.97);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
}

interface Cursor {
  page: PDFPage;
  y: number;
  pageNumber: number;
}

/**
 * pdf-lib's StandardFonts are WinAnsi-encoded and throw on characters outside
 * that range. Report text is author-supplied, so it is sanitised rather than
 * allowed to crash an export.
 */
function sanitize(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u00a0\u2007\u2009\u202f]/g, " ")
    .replace(/[\u2022\u00b7]/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/[^\u0020-\u00ff\n]/g, "?");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const rawLine of sanitize(text).split("\n")) {
    if (rawLine.trim() === "") {
      lines.push("");
      continue;
    }
    const words = rawLine.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current === "" ? word : `${current} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current !== "") lines.push(current);
      // A single word longer than the line is hard-broken rather than dropped.
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
    if (current !== "") lines.push(current);
  }
  return lines;
}

export class PdfReportGenerationProvider implements ReportGenerationProvider {
  readonly descriptor: ProviderDescriptor = {
    id: "pdf-lib-report",
    label: "PDF report generator",
    description:
      "Renders a real, self-contained PDF locally with pdf-lib. No external service is used and " +
      "no credentials are required.",
    isLive: true,
    origin: "LIVE_COLLECTED",
    requiredEnv: [],
  };

  async renderPdf(
    input: ReportDocumentInput,
    context: ProviderContext,
  ): Promise<ProviderResult<Uint8Array>> {
    const started = Date.now();

    try {
      const pdf = await PDFDocument.create();
      pdf.setTitle(sanitize(`${input.reference} — ${input.title}`));
      pdf.setAuthor(sanitize(input.organisationName));
      pdf.setSubject(sanitize(`Sentinel domain intelligence report (${input.statusLabel})`));
      pdf.setProducer("Sentinel — Trading Domain Intelligence");
      pdf.setCreator("Sentinel");
      pdf.setCreationDate(new Date());

      const fonts: Fonts = {
        regular: await pdf.embedFont(StandardFonts.Helvetica),
        bold: await pdf.embedFont(StandardFonts.HelveticaBold),
        mono: await pdf.embedFont(StandardFonts.Courier),
      };

      const cursor: Cursor = { page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: 0, pageNumber: 1 };
      cursor.y = PAGE_HEIGHT - MARGIN;

      this.drawCover(cursor, pdf, fonts, input);
      this.newPage(cursor, pdf);

      for (const section of input.sections) {
        if (context.signal.aborted) {
          return providerFailed(
            { code: "CANCELLED", message: "PDF generation was cancelled.", retryable: false },
            {
              providerId: this.descriptor.id,
              origin: "LIVE_COLLECTED",
              durationMs: Date.now() - started,
              warnings: [],
            },
          );
        }
        this.drawSection(cursor, pdf, fonts, section);
      }

      this.drawFooters(pdf, fonts, input);

      const bytes = await pdf.save();

      return providerOk(bytes, {
        providerId: this.descriptor.id,
        origin: "LIVE_COLLECTED",
        durationMs: Date.now() - started,
        warnings: [],
      });
    } catch (error) {
      return providerFailed(
        {
          code: "UPSTREAM_ERROR",
          message: `PDF generation failed: ${error instanceof Error ? error.message : String(error)}`,
          retryable: false,
          cause: error instanceof Error ? error.stack : undefined,
        },
        {
          providerId: this.descriptor.id,
          origin: "LIVE_COLLECTED",
          durationMs: Date.now() - started,
          warnings: [],
        },
      );
    }
  }

  // --- layout primitives --------------------------------------------------

  private newPage(cursor: Cursor, pdf: PDFDocument): void {
    cursor.page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursor.pageNumber += 1;
    cursor.y = PAGE_HEIGHT - MARGIN;
  }

  private ensureSpace(cursor: Cursor, pdf: PDFDocument, needed: number): void {
    if (cursor.y - needed < MARGIN + 36) this.newPage(cursor, pdf);
  }

  private drawParagraph(
    cursor: Cursor,
    pdf: PDFDocument,
    font: PDFFont,
    text: string,
    options: { size?: number; color?: ReturnType<typeof rgb>; leading?: number; indent?: number } = {},
  ): void {
    const size = options.size ?? 10;
    const leading = options.leading ?? size * 1.45;
    const indent = options.indent ?? 0;
    const lines = wrapText(text, font, size, CONTENT_WIDTH - indent);

    for (const line of lines) {
      this.ensureSpace(cursor, pdf, leading);
      if (line !== "") {
        cursor.page.drawText(line, {
          x: MARGIN + indent,
          y: cursor.y - size,
          size,
          font,
          color: options.color ?? COLOR_TEXT,
        });
      }
      cursor.y -= leading;
    }
  }

  private drawCover(
    cursor: Cursor,
    pdf: PDFDocument,
    fonts: Fonts,
    input: ReportDocumentInput,
  ): void {
    // Shield-and-radar mark, drawn with primitives so the PDF stays
    // self-contained with no embedded image asset.
    cursor.page.drawRectangle({
      x: MARGIN,
      y: cursor.y - 34,
      width: 26,
      height: 34,
      color: COLOR_ACCENT,
    });
    cursor.page.drawCircle({
      x: MARGIN + 13,
      y: cursor.y - 19,
      size: 7,
      borderColor: rgb(1, 1, 1),
      borderWidth: 1.4,
    });

    cursor.page.drawText("SENTINEL", {
      x: MARGIN + 38,
      y: cursor.y - 16,
      size: 18,
      font: fonts.bold,
      color: COLOR_TEXT,
    });
    cursor.page.drawText("Trading Domain Intelligence", {
      x: MARGIN + 38,
      y: cursor.y - 30,
      size: 9,
      font: fonts.regular,
      color: COLOR_MUTED,
    });
    cursor.y -= 72;

    cursor.page.drawLine({
      start: { x: MARGIN, y: cursor.y },
      end: { x: PAGE_WIDTH - MARGIN, y: cursor.y },
      thickness: 1,
      color: COLOR_RULE,
    });
    cursor.y -= 34;

    this.drawParagraph(cursor, pdf, fonts.bold, input.reference, {
      size: 11,
      color: COLOR_ACCENT,
    });
    cursor.y -= 4;
    this.drawParagraph(cursor, pdf, fonts.bold, input.title, { size: 20, leading: 26 });
    cursor.y -= 18;

    const facts: Array<[string, string]> = [
      ["Status", input.statusLabel],
      ["Intended receiving authority", input.receivingAuthorityLabel],
      ["Prepared by", input.preparedByName],
      ["Approved by", input.approvedByName ?? "Not approved"],
      ["Prepared at", input.preparedAt],
      ["Organisation", input.organisationName],
    ];

    for (const [label, value] of facts) {
      this.ensureSpace(cursor, pdf, 16);
      cursor.page.drawText(sanitize(label), {
        x: MARGIN,
        y: cursor.y - 9,
        size: 9,
        font: fonts.bold,
        color: COLOR_MUTED,
      });
      cursor.page.drawText(sanitize(value), {
        x: MARGIN + 170,
        y: cursor.y - 9,
        size: 9,
        font: fonts.regular,
        color: COLOR_TEXT,
      });
      cursor.y -= 16;
    }

    if (input.simulationNotice) {
      cursor.y -= 20;
      this.drawCallout(cursor, pdf, fonts, input.simulationNotice, "DEMONSTRATION DATA");
    }
  }

  private drawCallout(
    cursor: Cursor,
    pdf: PDFDocument,
    fonts: Fonts,
    text: string,
    heading: string,
  ): void {
    const size = 9;
    const leading = size * 1.4;
    const innerWidth = CONTENT_WIDTH - 24;
    const lines = wrapText(text, fonts.regular, size, innerWidth);
    const boxHeight = lines.length * leading + 34;

    this.ensureSpace(cursor, pdf, boxHeight + 8);

    cursor.page.drawRectangle({
      x: MARGIN,
      y: cursor.y - boxHeight,
      width: CONTENT_WIDTH,
      height: boxHeight,
      color: COLOR_CAUTION_BG,
      borderColor: COLOR_CAUTION_BORDER,
      borderWidth: 1,
    });

    let textY = cursor.y - 18;
    cursor.page.drawText(sanitize(heading), {
      x: MARGIN + 12,
      y: textY,
      size: 9,
      font: fonts.bold,
      color: rgb(0.45, 0.31, 0.04),
    });
    textY -= leading + 4;

    for (const line of lines) {
      cursor.page.drawText(line, {
        x: MARGIN + 12,
        y: textY,
        size,
        font: fonts.regular,
        color: rgb(0.3, 0.24, 0.1),
      });
      textY -= leading;
    }

    cursor.y -= boxHeight + 16;
  }

  private drawSection(
    cursor: Cursor,
    pdf: PDFDocument,
    fonts: Fonts,
    section: ReportDocumentSection,
  ): void {
    this.ensureSpace(cursor, pdf, 50);

    cursor.page.drawText(sanitize(section.heading), {
      x: MARGIN,
      y: cursor.y - 13,
      size: 13,
      font: fonts.bold,
      color: COLOR_TEXT,
    });
    cursor.y -= 20;
    cursor.page.drawLine({
      start: { x: MARGIN, y: cursor.y },
      end: { x: PAGE_WIDTH - MARGIN, y: cursor.y },
      thickness: 0.75,
      color: COLOR_RULE,
    });
    cursor.y -= 14;

    for (const paragraph of section.paragraphs) {
      this.drawParagraph(cursor, pdf, fonts.regular, paragraph);
      cursor.y -= 6;
    }

    if (section.table) this.drawTable(cursor, pdf, fonts, section.table);
    if (section.callout) this.drawCallout(cursor, pdf, fonts, section.callout, "IMPORTANT");

    cursor.y -= 12;
  }

  private drawTable(
    cursor: Cursor,
    pdf: PDFDocument,
    fonts: Fonts,
    table: { headers: string[]; rows: string[][] },
  ): void {
    const size = 8;
    const padding = 5;
    const columnCount = Math.max(1, table.headers.length);
    const columnWidth = CONTENT_WIDTH / columnCount;

    const drawHeaderRow = () => {
      this.ensureSpace(cursor, pdf, 24);
      cursor.page.drawRectangle({
        x: MARGIN,
        y: cursor.y - 18,
        width: CONTENT_WIDTH,
        height: 18,
        color: COLOR_TABLE_HEADER_BG,
      });
      table.headers.forEach((header, index) => {
        cursor.page.drawText(
          sanitize(truncateToWidth(header, fonts.bold, size, columnWidth - padding * 2)),
          {
            x: MARGIN + index * columnWidth + padding,
            y: cursor.y - 12,
            size,
            font: fonts.bold,
            color: COLOR_TEXT,
          },
        );
      });
      cursor.y -= 18;
    };

    drawHeaderRow();

    for (const row of table.rows) {
      // Each cell wraps independently; the row is as tall as its tallest cell.
      const cellLines = row.map((cell) =>
        wrapText(cell, fonts.regular, size, columnWidth - padding * 2).slice(0, 4),
      );
      const rowHeight = Math.max(...cellLines.map((lines) => lines.length), 1) * (size * 1.3) + 8;

      if (cursor.y - rowHeight < MARGIN + 36) {
        this.newPage(cursor, pdf);
        drawHeaderRow();
      }

      cellLines.forEach((lines, columnIndex) => {
        lines.forEach((line, lineIndex) => {
          cursor.page.drawText(line, {
            x: MARGIN + columnIndex * columnWidth + padding,
            y: cursor.y - 11 - lineIndex * (size * 1.3),
            size,
            font: fonts.regular,
            color: COLOR_TEXT,
          });
        });
      });

      cursor.y -= rowHeight;
      cursor.page.drawLine({
        start: { x: MARGIN, y: cursor.y },
        end: { x: PAGE_WIDTH - MARGIN, y: cursor.y },
        thickness: 0.4,
        color: COLOR_RULE,
      });
    }

    cursor.y -= 10;
  }

  private drawFooters(pdf: PDFDocument, fonts: Fonts, input: ReportDocumentInput): void {
    const pages = pdf.getPages();
    const total = pages.length;

    pages.forEach((page, index) => {
      const footer = input.simulationNotice
        ? `${input.reference} - DEMONSTRATION DATA, NOT A REAL FINDING - ${input.footerNote}`
        : `${input.reference} - ${input.footerNote}`;

      page.drawLine({
        start: { x: MARGIN, y: MARGIN - 6 },
        end: { x: PAGE_WIDTH - MARGIN, y: MARGIN - 6 },
        thickness: 0.5,
        color: COLOR_RULE,
      });
      page.drawText(
        sanitize(truncateToWidth(footer, fonts.regular, 7.5, CONTENT_WIDTH - 60)),
        { x: MARGIN, y: MARGIN - 18, size: 7.5, font: fonts.regular, color: COLOR_MUTED },
      );
      page.drawText(`${index + 1} / ${total}`, {
        x: PAGE_WIDTH - MARGIN - 32,
        y: MARGIN - 18,
        size: 7.5,
        font: fonts.mono,
        color: COLOR_MUTED,
      });
    });
  }
}

function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const clean = sanitize(text);
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let result = "";
  for (const char of clean) {
    if (font.widthOfTextAtSize(`${result}${char}...`, size) > maxWidth) break;
    result += char;
  }
  return `${result}...`;
}
