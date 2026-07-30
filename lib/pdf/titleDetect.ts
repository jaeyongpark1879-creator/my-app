// PDF는 hwpx와 달리 별도의 "샘플" 개념이 없으므로, 페이지마다 가장 눈에 띄게
// 큰 글자크기를 그 페이지의 제목으로 추정하는 휴리스틱을 쓴다.
// (본문 대비 뚜렷하게 큰 글자가 없으면 그 페이지에는 제목이 없다고 본다)

export interface PdfTitleCandidate {
  pageIndex: number; // 0부터 시작
  text: string;
}

interface TextItemLike {
  str: string;
  transform: number[];
}

const TITLE_SIZE_RATIO_THRESHOLD = 1.15;

export async function detectPdfTitles(pdfBuffer: Buffer): Promise<PdfTitleCandidate[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;

  const titles: PdfTitleCandidate[] = [];

  for (let pageIndex = 0; pageIndex < doc.numPages; pageIndex++) {
    const page = await doc.getPage(pageIndex + 1);
    const content = await page.getTextContent();
    const items = (content.items as TextItemLike[]).filter((i) => i.str.trim().length > 0);
    if (items.length === 0) continue;

    const sizes = items.map((i) => fontSizeOf(i));
    const maxSize = Math.max(...sizes);
    // 짝수 개일 때 위쪽 중앙값을 고르면 최댓값과 겹쳐버릴 수 있어(예: [12,26]일 때
    // 인덱스 1을 고르면 26=최댓값), 항상 아래쪽 중앙값을 쓴다
    const sortedSizes = [...sizes].sort((a, b) => a - b);
    const medianSize = sortedSizes[Math.floor((sortedSizes.length - 1) / 2)];

    if (medianSize > 0 && maxSize / medianSize >= TITLE_SIZE_RATIO_THRESHOLD) {
      const titleText = items
        .filter((i) => fontSizeOf(i) === maxSize)
        .map((i) => i.str)
        .join(" ")
        .trim();
      if (titleText) {
        titles.push({ pageIndex, text: titleText });
      }
    }
  }

  await loadingTask.destroy();
  return titles;
}

function fontSizeOf(item: TextItemLike): number {
  // transform 행렬의 [2],[3]으로 실제 렌더링 스케일(세로 크기)을 근사한다
  return Math.hypot(item.transform[2], item.transform[3]);
}
