import JSZip from "jszip";
import { parseXml, buildXml, containerArrayRef, asArray } from "./xmlUtil";

const CONTAINER_RDF_PATH = "META-INF/container.rdf";
const PKG_NS = "http://www.hancom.co.kr/hwpml/2016/meta/pkg#";

// hwpx 패키지에는 어떤 파일이 정식 구성요소인지 선언하는
// META-INF/container.rdf가 따로 있다. 여기에 없는 파일(우리가 새로 추가한
// section3.xml 등)이 zip 안에 있으면, 한글이 "선언되지 않은 내용"으로 보고
// 문서 보안을 낮춰야 열 수 있다는 경고를 띄운다. 새로 만든 섹션들을 여기에도
// 등록해줘야 한다.
export async function registerSectionsInContainerRdf(zip: JSZip, sectionHrefs: string[]): Promise<void> {
  const file = zip.file(CONTAINER_RDF_PATH);
  if (!file || sectionHrefs.length === 0) return;

  const xml = await file.async("string");
  const doc = parseXml(xml);

  const ref = containerArrayRef(doc, "Description");
  if (!ref) return;

  const existing = asArray(ref.parent[ref.key]);
  const additions: Record<string, unknown>[] = [];
  for (const href of sectionHrefs) {
    additions.push({
      "@_rdf:about": "",
      "ns0:hasPart": { "@_xmlns:ns0": PKG_NS, "@_rdf:resource": href },
    });
    additions.push({
      "@_rdf:about": href,
      "rdf:type": { "@_rdf:resource": `${PKG_NS}SectionFile` },
    });
  }
  ref.parent[ref.key] = [...existing, ...additions];

  zip.file(CONTAINER_RDF_PATH, buildXml(doc));
}
