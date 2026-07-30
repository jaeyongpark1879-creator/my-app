import { openHwpxZip, readZipText, writeHwpxZip } from "./zip";
import {
  parseHeader,
  serializeHeader,
  pickTitleAndBodyCharPr,
  findFontIdByName,
  setHangulFontRefId,
} from "./header";
import { listSectionPaths, computeCharPrUsage } from "./sections";
import type { SampleStyle } from "./types";

const HEADER_PATH = "Contents/header.xml";

export interface FormatResult {
  buffer: Buffer;
  /** 이 파일에서 "제목"으로 판단한 charPr id. 목차 추출 시 그대로 재사용한다 */
  titleCharPrId: string | null;
}

// 대상 hwpx에서 실제로 쓰이는 charPr 중 "제목"·"본문" 딱 2개만 골라
// 그 두 정의의 글자크기/폰트만 샘플 기준으로 덮어쓴다. 나머지 수백 개의
// 스타일(표, 각주, 머리말 등)은 절대 건드리지 않는다. 문단/텍스트도 그대로 둔다.
export async function applyFormatToHwpx(
  buffer: Buffer,
  style: SampleStyle,
  fileName = "대상 hwpx",
): Promise<FormatResult> {
  const zip = await openHwpxZip(buffer, fileName);
  const headerXml = await readZipText(zip, HEADER_PATH);
  const { doc, charPrs } = parseHeader(headerXml);

  const sectionPaths = listSectionPaths(zip);
  const usage = await computeCharPrUsage(zip, sectionPaths);

  const picked = pickTitleAndBodyCharPr(charPrs, usage);
  if (!picked) {
    // 실사용 글자모양을 찾지 못하면 서식을 맞출 대상이 없다는 뜻이므로 원본 그대로 둔다
    return { buffer, titleCharPrId: null };
  }

  applyOne(doc, picked.title.node, style.title);
  if (picked.body.id !== picked.title.id) {
    applyOne(doc, picked.body.node, style.body);
  }

  const newHeaderXml = serializeHeader(doc);
  zip.file(HEADER_PATH, newHeaderXml);
  const outBuffer = await writeHwpxZip(zip);
  return { buffer: outBuffer, titleCharPrId: picked.title.id };
}

function applyOne(
  headerDoc: Record<string, unknown>,
  charPrNode: Record<string, unknown>,
  target: { heightHundredths: number; fontName: string | null },
): void {
  charPrNode["@_height"] = String(target.heightHundredths);
  if (target.fontName) {
    const fontId = findFontIdByName(headerDoc, target.fontName);
    // 대상 문서의 폰트 테이블에 같은 이름이 없으면 크기만 맞추고 폰트는 그대로 둔다
    if (fontId) setHangulFontRefId(charPrNode, fontId);
  }
}
