import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { loadKoreanFontBytes } from "./font";
import { detectPdfTitles } from "./titleDetect";

export interface PdfSourceFile {
  fileName: string;
  buffer: Buffer;
}

export interface MergedPdfTitle {
  text: string;
  /** 목차를 제외하고 본문 첫 페이지를 1로 삼는 실제 페이지 번호 */
  pageNumber: number;
}

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const LINE_HEIGHT = 22;
const TITLE_FONT_SIZE = 20;
const BODY_FONT_SIZE = 12;

export async function mergePdfFiles(files: PdfSourceFile[]): Promise<{ buffer: Buffer; titles: MergedPdfTitle[] }> {
  if (files.length === 0) {
    throw new Error("병합할 PDF 파일이 없습니다");
  }

  const perFileTitles = await Promise.all(files.map((f) => detectPdfTitles(f.buffer)));
  const perFileDocs = await Promise.all(files.map((f) => PDFDocument.load(f.buffer)));
  const pageCounts = perFileDocs.map((d) => d.getPageCount());

  // 업로드(취합) 순서대로 병합하므로, 그 순서 그대로 시작 페이지 오프셋을 계산한다
  const startOffsets: number[] = [];
  let acc = 0;
  for (const count of pageCounts) {
    startOffsets.push(acc);
    acc += count;
  }

  const mergedTitles: MergedPdfTitle[] = [];
  perFileTitles.forEach((titles, fileIndex) => {
    for (const t of titles) {
      mergedTitles.push({ text: t.text, pageNumber: startOffsets[fileIndex] + t.pageIndex + 1 });
    }
  });

  const outDoc = await PDFDocument.create();
  outDoc.registerFontkit(fontkit);
  const fontBytes = await loadKoreanFontBytes();
  const font = await outDoc.embedFont(fontBytes, { subset: true });

  const tocPageCount = drawTocPages(outDoc, font, mergedTitles);

  for (const srcDoc of perFileDocs) {
    const copied = await outDoc.copyPages(srcDoc, srcDoc.getPageIndices());
    copied.forEach((p) => outDoc.addPage(p));
  }

  // 목차는 페이지 번호에서 제외하고, 본문 첫 페이지를 1쪽으로 순차 표기
  const pages = outDoc.getPages();
  for (let i = tocPageCount; i < pages.length; i++) {
    drawPageNumber(pages[i], font, i - tocPageCount + 1);
  }

  const bytes = await outDoc.save();
  return { buffer: Buffer.from(bytes), titles: mergedTitles };
}

function drawTocPages(doc: PDFDocument, font: PDFFont, titles: MergedPdfTitle[]): number {
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  let pageCount = 1;

  page.drawText("목차", { x: MARGIN, y, size: TITLE_FONT_SIZE, font, color: rgb(0.1, 0.15, 0.35) });
  y -= LINE_HEIGHT * 2;

  for (const title of titles) {
    if (y < MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      pageCount += 1;
      y = PAGE_HEIGHT - MARGIN;
    }

    const pageNumText = String(title.pageNumber);
    const pageNumWidth = font.widthOfTextAtSize(pageNumText, BODY_FONT_SIZE);
    const maxTitleWidth = PAGE_WIDTH - MARGIN * 2 - pageNumWidth - 10;
    const titleText = truncateToWidth(title.text, font, BODY_FONT_SIZE, maxTitleWidth);

    page.drawText(titleText, { x: MARGIN, y, size: BODY_FONT_SIZE, font, color: rgb(0, 0, 0) });
    page.drawText(pageNumText, {
      x: PAGE_WIDTH - MARGIN - pageNumWidth,
      y,
      size: BODY_FONT_SIZE,
      font,
      color: rgb(0, 0, 0),
    });
    y -= LINE_HEIGHT;
  }

  return pageCount;
}

function drawPageNumber(page: PDFPage, font: PDFFont, pageNumber: number): void {
  const text = String(pageNumber);
  const width = font.widthOfTextAtSize(text, BODY_FONT_SIZE);
  page.drawText(text, {
    x: page.getWidth() / 2 - width / 2,
    y: 30,
    size: BODY_FONT_SIZE,
    font,
    color: rgb(0, 0, 0),
  });
}

function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && font.widthOfTextAtSize(result + "…", size) > maxWidth) {
    result = result.slice(0, -1);
  }
  return result + "…";
}
