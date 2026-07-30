import JSZip from "jszip";
import { readZipText } from "./zip";
import { parseSection } from "./section";

const SECTION_PATH_RE = /^Contents\/section(\d+)\.xml$/;

// hwpx는 문서가 길거나 페이지 설정이 바뀌면 section0.xml, section1.xml...
// 여러 파일로 나뉜다. 실제 파일은 거의 항상 여러 섹션을 갖고 있으므로
// section0.xml 하나만 보면 본문 대부분을 놓치게 된다.
export function listSectionPaths(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((p) => SECTION_PATH_RE.test(p))
    .sort((a, b) => sectionIndexOf(a) - sectionIndexOf(b));
}

export function sectionIndexOf(path: string): number {
  const m = path.match(SECTION_PATH_RE);
  return m ? Number(m[1]) : 0;
}

// 문서 전체(모든 섹션)에서 각 charPr id가 실제로 몇 번 쓰이는지 센다.
// 헤더에는 수백 개의 스타일 정의가 있어도 실제 쓰이는 건 소수뿐이라,
// 이 값으로 "실사용 후보"만 걸러낸다.
export async function computeCharPrUsage(zip: JSZip, sectionPaths: string[]): Promise<Map<string, number>> {
  const usage = new Map<string, number>();
  for (const path of sectionPaths) {
    const xml = await readZipText(zip, path);
    const { paragraphs } = parseSection(xml);
    for (const p of paragraphs) {
      for (const run of p.runs) {
        if (run.charPrIDRef !== null) {
          usage.set(run.charPrIDRef, (usage.get(run.charPrIDRef) ?? 0) + 1);
        }
      }
    }
  }
  return usage;
}
