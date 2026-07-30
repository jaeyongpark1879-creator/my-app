import { openHwpxZip, readZipText, writeHwpxZip } from "./zip";
import { parseHeader, serializeHeader, setSectionCount } from "./header";
import { parseSection, serializeSection, paragraphArrayRef, paragraphFromNode } from "./section";
import { listSectionPaths, sectionIndexOf } from "./sections";
import { extractSampleStyle } from "./sampleStyle";
import { applyFormatToHwpx } from "./formatMatch";
import { detectTitlesInHwpx } from "./titleDetect";
import { updateContentHpf, type ManifestItem } from "./contentHpf";
import { registerSectionsInContainerRdf } from "./containerRdf";
import { offsetMergedIds, containerArrayRef, asArray } from "./xmlUtil";
import type { HwpxSourceFile, DetectedTitle } from "./types";

const HEADER_PATH = "Contents/header.xml";

// header.xml에서 스타일 정의가 모여있을 만한 태그들. fontface(폰트 테이블)는
// 스크립트별로 id 공간이 따로 있어 단순 이어붙이기가 위험하므로 제외한다
// (그래서 병합된 파일 중 첫 번째가 아닌 파일들은 폰트 이름이 정확히 재현되지
// 않을 수 있다 — 알려진 한계).
const STYLE_CONTAINER_TAGS = ["charPr", "paraPr", "bullet", "numbering", "borderFill", "style", "tabPr"];

export interface MergeHwpxResult {
  buffer: Buffer;
  titles: DetectedTitle[];
}

export async function mergeHwpxFiles(
  sampleFile: HwpxSourceFile,
  targetFiles: HwpxSourceFile[],
): Promise<MergeHwpxResult> {
  if (targetFiles.length === 0) {
    throw new Error("병합할 hwpx 파일이 없습니다");
  }

  const style = await extractSampleStyle(sampleFile.buffer, sampleFile.fileName);

  const formatted = await Promise.all(
    targetFiles.map((f) => applyFormatToHwpx(f.buffer, style, f.fileName)),
  );

  const titlesPerFile = await Promise.all(
    formatted.map((r, i) => detectTitlesInHwpx(r.buffer, r.titleCharPrId, i, targetFiles[i].fileName)),
  );
  const titles = titlesPerFile.flat();

  // 베이스: 첫 번째 파일의 zip 전체(모든 섹션 + 헤더)를 그대로 시작점으로 삼는다.
  // hwpx는 문서가 길면 여러 섹션(section0, section1, ...)으로 나뉘므로,
  // 문단을 억지로 한 섹션에 이어붙이지 않고 파일별로 섹션을 추가하는 방식으로 합친다.
  const baseZip = await openHwpxZip(formatted[0].buffer, `${targetFiles[0].fileName} (서식 적용 후)`);
  const baseHeaderXml = await readZipText(baseZip, HEADER_PATH);
  const { doc: baseHeaderDoc } = parseHeader(baseHeaderXml);
  const baseSectionPaths = listSectionPaths(baseZip);
  if (baseSectionPaths.length === 0) {
    throw new Error(`"${targetFiles[0].fileName}"에서 본문 섹션을 찾지 못했습니다`);
  }
  const baseSectionIds = baseSectionPaths.map((p) => `section${sectionIndexOf(p)}`);

  const firstSectionXml = await readZipText(baseZip, baseSectionPaths[0]);
  const { doc: firstSectionDoc } = parseSection(firstSectionXml);

  let nextSectionIndex = Math.max(...baseSectionPaths.map(sectionIndexOf)) + 1;
  const newManifestItems: ManifestItem[] = [];
  const appendedSpineIds: string[] = [];

  for (let i = 1; i < formatted.length; i++) {
    const offset = i * 100000;
    const zip = await openHwpxZip(formatted[i].buffer, `${targetFiles[i].fileName} (서식 적용 후)`);
    const headerXml = await readZipText(zip, HEADER_PATH);
    const { doc: headerDoc } = parseHeader(headerXml);
    offsetMergedIds(headerDoc, offset);

    for (const tag of STYLE_CONTAINER_TAGS) {
      const baseContainer = containerArrayRef(baseHeaderDoc, tag);
      const otherContainer = containerArrayRef(headerDoc, tag);
      if (baseContainer && otherContainer) {
        const otherEntries = asArray(otherContainer.parent[otherContainer.key]);
        baseContainer.parent[baseContainer.key] = [
          ...asArray(baseContainer.parent[baseContainer.key]),
          ...otherEntries,
        ];
      }
    }

    const sectionPaths = listSectionPaths(zip);
    for (const path of sectionPaths) {
      const xml = await readZipText(zip, path);
      const { doc: sectionDoc } = parseSection(xml);
      offsetMergedIds(sectionDoc, offset);

      const newPath = `Contents/section${nextSectionIndex}.xml`;
      const newId = `section${nextSectionIndex}`;
      baseZip.file(newPath, serializeSection(sectionDoc));
      newManifestItems.push({ id: newId, href: newPath });
      appendedSpineIds.push(newId);
      nextSectionIndex += 1;
    }
  }

  // 목차 섹션: 베이스 문서 첫 섹션의 구조(페이지 설정 문단 + 본문 문단 하나)를
  // 그대로 복제해서 텍스트만 제목 목록으로 바꿔치기한다. 이렇게 하면 문서가
  // 원래 갖고 있던 유효한 페이지/서식 구조를 그대로 재사용할 수 있다.
  const tocSectionXml = buildTocSectionXml(firstSectionDoc, formatted[0].titleCharPrId, titles);
  const tocPath = `Contents/section${nextSectionIndex}.xml`;
  const tocId = `section${nextSectionIndex}`;
  baseZip.file(tocPath, tocSectionXml);
  newManifestItems.push({ id: tocId, href: tocPath });
  nextSectionIndex += 1;

  setSectionCount(baseHeaderDoc, nextSectionIndex);
  baseZip.file(HEADER_PATH, serializeHeader(baseHeaderDoc));

  await updateContentHpf(baseZip, {
    newManifestItems,
    // 목차가 맨 앞에서 읽히도록 spine 순서를 지정한다 (실제 페이지 번호는
    // 목차를 제외하고 그다음 섹션부터 매겨지도록 만드는 것이 목표)
    spineSectionIdsInOrder: [tocId, ...baseSectionIds, ...appendedSpineIds],
  });

  // content.hpf 외에 META-INF/container.rdf도 패키지 구성 파일 목록을 따로
  // 들고 있어서, 새로 추가한 섹션들을 여기에도 등록해야 한글이 "선언되지 않은
  // 파일이 섞여있다"고 보고 보안 경고를 띄우지 않는다
  await registerSectionsInContainerRdf(baseZip, newManifestItems.map((item) => item.href));

  const buffer = await writeHwpxZip(baseZip);
  return { buffer, titles };
}

function buildTocSectionXml(
  templateSectionDoc: Record<string, unknown>,
  baseTitleCharPrId: string | null,
  titles: DetectedTitle[],
): string {
  const doc = structuredClone(templateSectionDoc) as Record<string, unknown>;
  const ref = paragraphArrayRef(doc);
  if (!ref) {
    throw new Error("목차 섹션을 만들 문단 구조를 찾지 못했습니다");
  }

  const originalParagraphs = asArray(ref.parent[ref.key]) as Record<string, unknown>[];
  if (originalParagraphs.length === 0) {
    throw new Error("목차 섹션 템플릿 문서에 문단이 없습니다");
  }

  // 관례상 각 섹션의 첫 문단이 페이지 설정(secPr)을 담고 있으므로 그대로 재사용한다
  const secPrTemplate = originalParagraphs[0];

  // 목차 항목은 가능하면 "제목 스타일"을 쓰는 문단을 템플릿으로 삼는다
  const titleStyledParagraph = baseTitleCharPrId
    ? findParagraphUsingCharPr(originalParagraphs, baseTitleCharPrId)
    : null;
  const textTemplate = titleStyledParagraph ?? originalParagraphs[1] ?? originalParagraphs[0];

  const secPrClone = structuredClone(secPrTemplate);
  const entries = titles.length > 0 ? titles.map((t) => t.text) : ["(인식된 제목 없음)"];
  const titleParagraphs = entries.map((text) => {
    const clone = structuredClone(textTemplate);
    setParagraphText(clone, text);
    return clone;
  });

  ref.parent[ref.key] = [secPrClone, ...titleParagraphs];
  return serializeSection(doc);
}

function findParagraphUsingCharPr(
  paragraphs: Record<string, unknown>[],
  charPrId: string,
): Record<string, unknown> | null {
  for (const p of paragraphs) {
    const info = paragraphFromNode(p);
    if (info.text.trim() && info.runs.some((r) => r.charPrIDRef === charPrId)) {
      return p;
    }
  }
  return null;
}

// 복제한 문단 노드 안에서 텍스트가 들어갈 첫 번째 자리를 찾아 바꿔치기한다.
// (목차 문단 하나당 텍스트 한 덩어리면 충분하므로 첫 자리만 찾으면 종료)
function setParagraphText(node: Record<string, unknown>, text: string): boolean {
  for (const key of Object.keys(node)) {
    if (key.startsWith("@_")) continue;
    const isTextTag = key === "#text" || key === "t" || key.endsWith(":t");
    const value = node[key];

    if (isTextTag) {
      if (Array.isArray(value)) {
        value.forEach((v, i) => {
          if (v !== null && typeof v === "object") {
            (v as Record<string, unknown>)["#text"] = i === 0 ? text : "";
          } else {
            value[i] = i === 0 ? text : "";
          }
        });
      } else if (value !== null && typeof value === "object") {
        (value as Record<string, unknown>)["#text"] = text;
      } else {
        node[key] = text;
      }
      return true;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && typeof item === "object" && setParagraphText(item as Record<string, unknown>, text)) {
          return true;
        }
      }
    } else if (value !== null && typeof value === "object") {
      if (setParagraphText(value as Record<string, unknown>, text)) return true;
    }
  }
  return false;
}
