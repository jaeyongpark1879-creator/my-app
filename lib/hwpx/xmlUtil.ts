import { XMLParser, XMLBuilder } from "fast-xml-parser";

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  trimValues: false,
};

export function parseXml(xmlText: string): Record<string, unknown> {
  const parser = new XMLParser(parserOptions);
  return parser.parse(xmlText);
}

export function buildXml(doc: Record<string, unknown>): string {
  const builder = new XMLBuilder({ ...parserOptions, suppressEmptyNode: false });
  // parseXml로 읽은 doc에는 "?xml" 선언이 이미 키로 들어있어 builder가 그대로
  // 되살려준다. 여기서 또 선언을 앞에 붙이면 <?xml ...?>가 두 번 나와서
  // XML 자체가 깨진다(실제 hwpx 파일로 검증하다가 발견). doc에 선언이 없을
  // 때만(직접 만든 doc 등) 보강한다.
  const built = builder.build(doc);
  return "?xml" in doc ? built : XML_DECLARATION + built;
}

// fast-xml-parser는 요소가 1개면 객체, 여러 개면 배열로 만들기 때문에
// 항상 배열로 다루기 위한 정규화 헬퍼
export function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export interface FoundNode {
  /** 부모 객체 (여기서 key를 찾으면 이 노드에 접근 가능) */
  parent: Record<string, unknown>;
  key: string;
  /** parent[key]가 배열이면 그 안의 인덱스, 아니면 null */
  index: number | null;
  node: Record<string, unknown>;
}

// hwpx의 정확한 네임스페이스 접두사(hp:, hh: 등)를 확신할 수 없어서,
// 태그 이름이 특정 접미사로 끝나는 요소를 재귀적으로 전부 찾는 방식을 쓴다
export function findByTagSuffix(root: unknown, suffix: string): FoundNode[] {
  const results: FoundNode[] = [];

  function walk(value: unknown, parent: Record<string, unknown> | null, key: string | null, index: number | null) {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, parent, key, i));
      return;
    }
    if (value !== null && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (
        parent &&
        key &&
        (key === suffix || key.endsWith(`:${suffix}`))
      ) {
        results.push({ parent, key, index, node: obj });
      }
      for (const childKey of Object.keys(obj)) {
        if (childKey.startsWith("@_") || childKey === "#text") continue;
        walk(obj[childKey], obj, childKey, null);
      }
    }
  }

  walk(root, null, null, null);
  return results;
}

// 여러 hwpx를 하나로 합칠 때 id 충돌을 피하기 위해, "@_id" 속성을 가진
// 모든 요소와 이름이 "IDRef"로 끝나는 모든 참조 속성에 동일한 offset을 더한다.
// (charPr id, paraPr id 등 네임스페이스별로 따로 관리해야 정확하지만,
//  같은 offset을 id/참조 양쪽에 동일하게 적용하면 최소한 서로 다른 파일끼리
//  절대 충돌하지 않는다는 안전성은 보장된다)
// 특정 태그 접미사를 가진 요소들이 모여있는 배열(부모+키)을 찾는다.
// 여러 hwpx의 header.xml을 합칠 때, 같은 종류(charPr, fontface 등)의
// 정의 목록끼리 이어붙이는 데 사용한다.
export function containerArrayRef(
  root: unknown,
  tagSuffix: string,
): { parent: Record<string, unknown>; key: string } | null {
  const found = findByTagSuffix(root, tagSuffix);
  if (found.length === 0) return null;
  const { parent, key } = found[0];
  parent[key] = asArray(parent[key]);
  return { parent, key };
}

// 실제 hwpx header.xml의 refList 아래에는 정의 테이블이 정확히 이 태그들뿐이다
// (charPr, paraPr, style, borderFill, tabPr, numbering, bullet — 실제 파일을
// 열어 확인함). 이 태그의 "@_id"만 offset 대상이다. 그 외의 id처럼 보이는
// 속성(outlineShapeIDRef, memoShapeIDRef 등)은 정의 테이블이 없는 내장 값이라
// offset하면 오히려 존재하지 않는 값을 가리키게 되어 문서가 깨진다 —
// 처음엔 "*Id/*IDRef로 끝나면 전부 offset"으로 짰다가 실제 파일 검증 중
// 이 문제를 발견해서 화이트리스트 방식으로 바꿨다.
const MERGE_DEFINITION_TAGS = new Set(["charPr", "paraPr", "style", "borderFill", "tabPr", "numbering", "bullet"]);
const MERGE_REF_ATTRS = new Set([
  "charPrIDRef",
  "paraPrIDRef",
  "styleIDRef",
  "borderFillIDRef",
  "tabPrIDRef",
  "numberingIDRef",
  "bulletIDRef",
]);

function bareTagName(key: string): string {
  const idx = key.indexOf(":");
  return idx === -1 ? key : key.slice(idx + 1);
}

export function offsetMergedIds(root: unknown, offset: number): void {
  function walk(value: unknown, tagKey: string | null) {
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, tagKey));
      return;
    }
    if (value !== null && typeof value === "object") {
      const obj = value as Record<string, unknown>;

      if (tagKey && MERGE_DEFINITION_TAGS.has(bareTagName(tagKey))) {
        const raw = obj["@_id"];
        if (typeof raw === "string" && /^\d+$/.test(raw)) {
          obj["@_id"] = String(Number(raw) + offset);
        }
      }

      for (const attrKey of Object.keys(obj)) {
        if (!attrKey.startsWith("@_")) continue;
        const name = attrKey.slice(2);
        if (MERGE_REF_ATTRS.has(name)) {
          const raw = obj[attrKey];
          if (typeof raw === "string" && /^\d+$/.test(raw)) {
            obj[attrKey] = String(Number(raw) + offset);
          }
        }
      }

      for (const key of Object.keys(obj)) {
        if (key.startsWith("@_") || key === "#text") continue;
        walk(obj[key], key);
      }
    }
  }
  walk(root, null);
}
