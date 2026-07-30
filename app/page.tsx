"use client";

import { useState } from "react";
import Image from "next/image";

type BatchType = "hwpx" | "pdf";

interface ResultState {
  url: string;
  fileName: string;
  titleCount: number;
}

export default function Home() {
  const [batchType, setBatchType] = useState<BatchType>("hwpx");
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [targetFiles, setTargetFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);

  function resetResult() {
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setError(null);
  }

  function handleBatchTypeChange(next: BatchType) {
    setBatchType(next);
    setSampleFile(null);
    setTargetFiles([]);
    resetResult();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetResult();

    if (batchType === "hwpx" && !sampleFile) {
      setError("기준이 될 샘플 hwpx 파일을 먼저 업로드해주세요.");
      return;
    }
    if (targetFiles.length === 0) {
      setError("병합할 파일을 1개 이상 업로드해주세요.");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      if (batchType === "hwpx" && sampleFile) {
        formData.append("sample", sampleFile);
      }
      targetFiles.forEach((f) => formData.append("files", f));

      const endpoint = batchType === "hwpx" ? "/api/merge-hwpx" : "/api/merge-pdf";
      const res = await fetch(endpoint, { method: "POST", body: formData });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "병합 중 오류가 발생했습니다.");
      }

      const titleCount = Number(res.headers.get("X-Detected-Title-Count") ?? "0");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const fileName = batchType === "hwpx" ? "merged.hwpx" : "merged.pdf";
      setResult({ url, fileName, titleCount });
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-[#122a4f] text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <Image src="/기획예산처.svg" alt="기획예산처 로고" width={36} height={36} />
          <div>
            <h1 className="text-lg font-semibold">문서 취합 프로그램</h1>
            <p className="text-xs text-slate-300">hwpx·PDF 문서를 양식에 맞춰 하나로 합칩니다</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex gap-2">
            {(["hwpx", "pdf"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleBatchTypeChange(type)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  batchType === type
                    ? "bg-[#122a4f] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {type === "hwpx" ? "hwpx 배치" : "PDF 배치"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {batchType === "hwpx" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  기준 샘플 hwpx 파일 (서식 기준)
                </label>
                <input
                  type="file"
                  accept=".hwpx"
                  onChange={(e) => setSampleFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-[#122a4f] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#1c3d6e]"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                병합할 {batchType === "hwpx" ? "hwpx" : "PDF"} 파일 (여러 개 선택 가능)
              </label>
              <input
                type="file"
                multiple
                accept={batchType === "hwpx" ? ".hwpx" : ".pdf"}
                onChange={(e) => setTargetFiles(Array.from(e.target.files ?? []))}
                className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-[#122a4f] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-[#1c3d6e]"
              />
              {targetFiles.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-xs text-slate-500">
                  {targetFiles.map((f, i) => (
                    <li key={i}>{f.name}</li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[#122a4f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1c3d6e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "병합 중..." : "병합하기"}
            </button>
          </form>

          {error && (
            <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          )}

          {result && (
            <div className="mt-4 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <p>병합이 완료됐습니다. 인식된 제목 {result.titleCount}개로 목차를 만들었습니다.</p>
              <a
                href={result.url}
                download={result.fileName}
                className="mt-2 inline-block font-medium underline"
              >
                {result.fileName} 다운로드
              </a>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
