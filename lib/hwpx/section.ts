import { findByTagSuffix, parseXml, buildXml, asArray, type FoundNode } from "./xmlUtil";

export interface RunInfo {
  node: Record<string, unknown>;
  charPrIDRef: string | null;
  text: string;
}

export interface ParagraphInfo {
  node: Record<string, unknown>;
  runs: RunInfo[];
  text: string;
}

export function parseSection(xmlText: string) {
  const doc = parseXml(xmlText);
  const paragraphNodes = findByTagSuffix(doc, "p");
  const paragraphs: ParagraphInfo[] = paragraphNodes.map(({ node }) => paragraphFromNode(node));
  return { doc, paragraphNodes, paragraphs };
}

export function paragraphFromNode(pNode: Record<string, unknown>): ParagraphInfo {
  const runNodes = findByTagSuffix(pNode, "run");
  const runs: RunInfo[] = runNodes.map(({ node }) => {
    const charPrIDRef = (node["@_charPrIDRef"] as string | undefined) ?? null;
    return { node, charPrIDRef, text: extractRunText(node) };
  });
  return { node: pNode, runs, text: runs.map((r) => r.text).join("") };
}

// <hp:t>글자</hp:t>처럼 속성이 없는 텍스트 요소는 fast-xml-parser가 객체가
// 아니라 순수 문자열로 파싱하기 때문에, findByTagSuffix(객체만 대상)로는
// 찾을 수 없다. run 노드 자신의 속성을 직접 훑어 "t"로 끝나는 키를 찾는다.
function extractRunText(runNode: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of Object.keys(runNode)) {
    if (key.startsWith("@_")) continue;
    const isTextTag = key === "t" || key.endsWith(":t");
    if (!isTextTag) continue;

    const value = runNode[key];
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (typeof v === "string") parts.push(v);
      else if (typeof v === "number") parts.push(String(v));
      else if (v !== null && typeof v === "object") {
        const text = (v as Record<string, unknown>)["#text"];
        if (typeof text === "string") parts.push(text);
        else if (typeof text === "number") parts.push(String(text));
      }
    }
  }
  return parts.join("");
}

export function serializeSection(doc: Record<string, unknown>): string {
  return buildXml(doc);
}

// section 최상위에서 문단(p) 배열이 실제로 담겨 있는 부모 노드/키를 찾는다.
// 병합 시 이 배열에 다른 파일의 문단 노드를 그대로 이어 붙인다.
export function findParagraphContainer(doc: Record<string, unknown>): FoundNode[] {
  return findByTagSuffix(doc, "p");
}

export function paragraphArrayRef(doc: Record<string, unknown>): {
  parent: Record<string, unknown>;
  key: string;
} | null {
  const found = findByTagSuffix(doc, "p");
  if (found.length === 0) return null;
  const { parent, key } = found[0];
  // parent[key]를 배열로 정규화해서 반환 (원래 객체 하나뿐이었으면 배열로 바꿔줌)
  parent[key] = asArray(parent[key]);
  return { parent, key };
}
