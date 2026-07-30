import { NextRequest, NextResponse } from "next/server";
import { mergeHwpxFiles } from "@/lib/hwpx/merge";
import type { HwpxSourceFile } from "@/lib/hwpx/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const formData = await request.formData();

  const sample = formData.get("sample");
  const targets = formData.getAll("files");

  if (!(sample instanceof File)) {
    return NextResponse.json({ error: "샘플 hwpx 파일을 업로드해주세요." }, { status: 400 });
  }
  if (targets.length === 0 || !targets.every((f) => f instanceof File)) {
    return NextResponse.json({ error: "병합할 hwpx 파일을 1개 이상 업로드해주세요." }, { status: 400 });
  }

  try {
    const sampleFile: HwpxSourceFile = {
      fileName: sample.name,
      buffer: Buffer.from(await sample.arrayBuffer()),
    };
    const targetFiles: HwpxSourceFile[] = await Promise.all(
      (targets as File[]).map(async (f) => ({
        fileName: f.name,
        buffer: Buffer.from(await f.arrayBuffer()),
      })),
    );

    console.log(
      "[merge-hwpx] 업로드 수신:",
      JSON.stringify({
        sample: { name: sampleFile.fileName, bytes: sampleFile.buffer.length },
        targets: targetFiles.map((f) => ({ name: f.fileName, bytes: f.buffer.length })),
      }),
    );

    const { buffer, titles } = await mergeHwpxFiles(sampleFile, targetFiles);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="merged.hwpx"',
        "X-Detected-Title-Count": String(titles.length),
      },
    });
  } catch (error) {
    console.error("[merge-hwpx] 처리 실패:", error);
    const message = error instanceof Error ? error.message : "hwpx 병합 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
