import JSZip from "jszip";

// hwpx는 ZIP 컨테이너이므로 JSZip으로 열고 다시 압축한다.
// label을 넘기면 어떤 파일에서 실패했는지 에러 메시지에 그대로 남는다.
export async function openHwpxZip(buffer: Buffer, label?: string): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(buffer);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    const who = label ? `"${label}"` : "hwpx 파일";
    throw new Error(
      `${who}을(를) zip으로 열지 못했습니다 (hwpx가 아니거나 손상된 파일일 수 있습니다): ${reason}`,
    );
  }
}

export async function readZipText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) {
    throw new Error(`hwpx 안에서 ${path} 파일을 찾을 수 없습니다`);
  }
  return file.async("string");
}

export async function writeHwpxZip(zip: JSZip): Promise<Buffer> {
  return zip.generateAsync({ type: "nodebuffer", mimeType: "application/hwp+zip" });
}
