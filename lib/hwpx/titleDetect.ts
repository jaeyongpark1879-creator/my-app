import { openHwpxZip, readZipText } from "./zip";
import { parseSection } from "./section";
import { listSectionPaths } from "./sections";
import type { DetectedTitle } from "./types";

// applyFormatToHwpx가 돌려준 titleCharPrId를 그대로 받아서, 그 id를 쓰는
// 문단들을 제목으로 인식한다. 글자크기로 다시 찾지 않는 이유는, 실제 문서의
// header.xml에는 우연히 같은 크기를 가진 무관한 스타일이 섞여 있을 수 있어서다.
export async function detectTitlesInHwpx(
  buffer: Buffer,
  titleCharPrId: string | null,
  sourceIndex: number,
  sourceFileName: string,
): Promise<DetectedTitle[]> {
  if (titleCharPrId === null) return [];

  const zip = await openHwpxZip(buffer, sourceFileName);
  const sectionPaths = listSectionPaths(zip);

  const titles: DetectedTitle[] = [];
  let buffer_: string[] = [];

  const flush = () => {
    const text = buffer_.join("").trim();
    if (text) titles.push({ text, sourceIndex, sourceFileName });
    buffer_ = [];
  };

  for (const path of sectionPaths) {
    const sectionXml = await readZipText(zip, path);
    const { paragraphs } = parseSection(sectionXml);

    for (const p of paragraphs) {
      const isTitleParagraph = p.runs.some((r) => r.charPrIDRef === titleCharPrId);
      if (isTitleParagraph && p.text.trim()) {
        buffer_.push(p.text);
      } else {
        flush();
      }
    }
    flush(); // 섹션 경계에서는 항상 끊는다
  }

  return titles;
}
