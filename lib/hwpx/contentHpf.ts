import JSZip from "jszip";
import { readZipText } from "./zip";
import { parseXml, buildXml, containerArrayRef, asArray } from "./xmlUtil";

const CONTENT_HPF_PATH = "Contents/content.hpf";

export interface ManifestItem {
  id: string;
  href: string;
}

// content.hpf는 opf:manifest(포함된 파일 목록)와 opf:spine(읽는 순서)로 구성된다.
// 섹션 파일을 추가했다면 manifest에 등록하고, spine에서 원하는 순서로 나열해야
// 한글이 실제로 그 섹션을 문서의 일부로 인식하고 올바른 순서로 읽는다.
export async function updateContentHpf(
  zip: JSZip,
  opts: { newManifestItems: ManifestItem[]; spineSectionIdsInOrder: string[] },
): Promise<void> {
  const xml = await readZipText(zip, CONTENT_HPF_PATH);
  const doc = parseXml(xml);

  const manifestRef = containerArrayRef(doc, "item");
  if (manifestRef) {
    const existing = asArray(manifestRef.parent[manifestRef.key]);
    const newItems = opts.newManifestItems.map((item) => ({
      "@_id": item.id,
      "@_href": item.href,
      "@_media-type": "application/xml",
    }));
    manifestRef.parent[manifestRef.key] = [...existing, ...newItems];
  }

  const spineRef = containerArrayRef(doc, "itemref");
  if (spineRef) {
    spineRef.parent[spineRef.key] = [
      { "@_idref": "header", "@_linear": "yes" },
      ...opts.spineSectionIdsInOrder.map((id) => ({ "@_idref": id, "@_linear": "yes" })),
    ];
  }

  zip.file(CONTENT_HPF_PATH, buildXml(doc));
}
