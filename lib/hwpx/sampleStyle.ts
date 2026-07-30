import { openHwpxZip, readZipText } from "./zip";
import { parseHeader, pickTitleAndBodyCharPr, findBulletChar, findFontNameById, getHangulFontRefId } from "./header";
import { listSectionPaths, computeCharPrUsage } from "./sections";
import type { SampleStyle } from "./types";

const HEADER_PATH = "Contents/header.xml";

export async function extractSampleStyle(buffer: Buffer, fileName = "샘플 hwpx"): Promise<SampleStyle> {
  const zip = await openHwpxZip(buffer, fileName);
  const headerXml = await readZipText(zip, HEADER_PATH);
  const { doc, charPrs } = parseHeader(headerXml);

  const sectionPaths = listSectionPaths(zip);
  if (sectionPaths.length === 0) {
    throw new Error(`"${fileName}"에서 본문 섹션(Contents/sectionN.xml)을 찾지 못했습니다`);
  }
  const usage = await computeCharPrUsage(zip, sectionPaths);

  const picked = pickTitleAndBodyCharPr(charPrs, usage);
  if (!picked) {
    throw new Error(`"${fileName}"에서 실제로 쓰이는 글자모양(charPr)을 찾지 못했습니다`);
  }

  const bulletChar = findBulletChar(doc);

  const titleFontId = getHangulFontRefId(picked.title.node);
  const bodyFontId = getHangulFontRefId(picked.body.node);

  return {
    title: {
      heightHundredths: picked.title.heightHundredths,
      fontName: titleFontId ? findFontNameById(doc, titleFontId) : null,
    },
    body: {
      heightHundredths: picked.body.heightHundredths,
      fontName: bodyFontId ? findFontNameById(doc, bodyFontId) : null,
    },
    bulletChar,
  };
}
