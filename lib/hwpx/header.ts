import { findByTagSuffix, parseXml, buildXml, asArray } from "./xmlUtil";

export interface CharPrEntry {
  id: string;
  heightHundredths: number;
  node: Record<string, unknown>;
}

// Contents/header.xml을 파싱해서 글자모양(charPr) 목록을 돌려준다.
// 정확한 스키마를 확신할 수 없으므로, 태그 이름이 "charPr"로 끝나고
// id/height 속성을 가진 요소를 전부 글자모양으로 취급한다.
export function parseHeader(xmlText: string) {
  const doc = parseXml(xmlText);
  const charPrNodes = findByTagSuffix(doc, "charPr");

  const charPrs: CharPrEntry[] = charPrNodes
    .map(({ node }) => {
      const id = node["@_id"] as string | undefined;
      const heightRaw = node["@_height"] as string | undefined;
      if (id === undefined || heightRaw === undefined) return null;
      return { id, heightHundredths: Number(heightRaw), node };
    })
    .filter((v): v is CharPrEntry => v !== null);

  return { doc, charPrs };
}

export function serializeHeader(doc: Record<string, unknown>): string {
  return buildXml(doc);
}

// 실제 hwpx 헤더에는 문서에서 실제로 쓰지 않는 기본 스타일까지 수백 개가
// 들어있다(표, 각주, 머리말 등). 문서 안에서 실제로 참조되는 id만 후보로
// 넘겨받아야, 무관한 스타일까지 "제목/본문"으로 잘못 분류하지 않는다.
// - 제목: 실사용 후보 중 글자크기가 가장 큰 것
// - 본문: 제목을 제외한 실사용 후보 중 가장 많이 쓰인 것 (usage 없으면 가장 작은 것으로 대체)
export function pickTitleAndBodyCharPr(
  charPrs: CharPrEntry[],
  usageCount?: Map<string, number>,
) {
  const pool = usageCount ? charPrs.filter((c) => usageCount.has(c.id)) : charPrs;
  if (pool.length === 0) return null;

  const byHeightDesc = [...pool].sort((a, b) => b.heightHundredths - a.heightHundredths);
  const title = byHeightDesc[0];

  const bodyPool = pool.filter((c) => c.id !== title.id);
  if (bodyPool.length === 0) {
    return { title, body: title };
  }

  const body = usageCount
    ? [...bodyPool].sort((a, b) => (usageCount.get(b.id) ?? 0) - (usageCount.get(a.id) ?? 0))[0]
    : [...bodyPool].sort((a, b) => a.heightHundredths - b.heightHundredths)[0];

  return { title, body };
}

export function findBulletChar(headerDoc: Record<string, unknown>): string | null {
  const bulletNodes = findByTagSuffix(headerDoc, "bullet");
  for (const { node } of bulletNodes) {
    const char = node["@_char"] as string | undefined;
    if (char) return char;
  }
  return null;
}

// 폰트 정의는 <hh:fontfaces>(전체 묶음) 안에 스크립트별로
// <hh:fontface lang="HANGUL">가 여러 개 있고, 그 안에 실제 폰트가
// <hh:font id=".." face="..">로 들어있다. charPr의 <hh:fontRef hangul="N"/>은
// "HANGUL" 그룹 안의 font id N을 가리킨다.
function findHangulFontfaceGroup(headerDoc: Record<string, unknown>): Record<string, unknown> | null {
  const groups = findByTagSuffix(headerDoc, "fontface");
  const hangul = groups.find(({ node }) => node["@_lang"] === "HANGUL");
  return hangul ? hangul.node : (groups[0]?.node ?? null);
}

export function findFontNameById(headerDoc: Record<string, unknown>, fontId: string): string | null {
  const group = findHangulFontfaceGroup(headerDoc);
  if (!group) return null;
  const fonts = findByTagSuffix(group, "font");
  const match = fonts.find(({ node }) => node["@_id"] === fontId);
  return (match?.node["@_face"] as string | undefined) ?? null;
}

export function findFontIdByName(headerDoc: Record<string, unknown>, fontName: string): string | null {
  const group = findHangulFontfaceGroup(headerDoc);
  if (!group) return null;
  const fonts = findByTagSuffix(group, "font");
  const match = fonts.find(({ node }) => node["@_face"] === fontName);
  return (match?.node["@_id"] as string | undefined) ?? null;
}

export function getHangulFontRefId(charPrNode: Record<string, unknown>): string | null {
  const refs = findByTagSuffix(charPrNode, "fontRef");
  const ref = refs[0]?.node;
  return (ref?.["@_hangul"] as string | undefined) ?? null;
}

export function setHangulFontRefId(charPrNode: Record<string, unknown>, fontId: string): void {
  const refs = findByTagSuffix(charPrNode, "fontRef");
  for (const { node } of refs) {
    node["@_hangul"] = fontId;
  }
}

// header.xml 루트(<hh:head ... secCnt="N">)의 섹션 개수 속성을 갱신한다
export function setSectionCount(headerDoc: Record<string, unknown>, count: number): void {
  const heads = findByTagSuffix(headerDoc, "head");
  for (const { node } of heads) {
    if ("@_secCnt" in node) {
      node["@_secCnt"] = String(count);
    }
  }
}

export function listAsArray<T>(value: T | T[] | undefined) {
  return asArray(value);
}
