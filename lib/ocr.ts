"use client"

export type ExtractionResult = {
  text: string
  source: "ocr" | "pdf-text" | "manual"
  confidence?: number
  pages?: number
}

export async function extractDocumentText(file: File, onProgress?: (value: number) => void): Promise<ExtractionResult> {
  if (file.type === "application/pdf") {
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
      const buffer = await file.arrayBuffer()
      const pdf = await pdfjs.getDocument({ data: buffer }).promise
      const chunks: string[] = []
      for (let index = 1; index <= pdf.numPages; index += 1) {
        const page = await pdf.getPage(index)
        const content = await page.getTextContent()
        chunks.push(content.items.map((item: any) => item.str || "").join(" "))
        onProgress?.(Math.round((index / pdf.numPages) * 100))
      }
      const text = chunks.join("\n").trim()
      if (text) return { text, source: "pdf-text", pages: pdf.numPages, confidence: 100 }
    } catch {
      // Fall through to OCR for scanned PDFs or unsupported browser workers.
    }
  }

  const { createWorker } = await import("tesseract.js")
  const worker = await createWorker("eng", 1, { logger: (message: any) => onProgress?.(Math.round((message.progress || 0) * 100)) })
  try {
    const result = await worker.recognize(file)
    return { text: result.data.text.trim(), source: "ocr", confidence: result.data.confidence }
  } finally {
    await worker.terminate()
  }
}

export function inferRecordFields(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim()
  const date = normalized.match(/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2})\b/)?.[1] || new Date().toISOString().slice(0, 10)
  const provider = normalized.match(/(?:provider|doctor|facility|hospital)\s*[:\-]\s*([^,.;]+)/i)?.[1]?.trim() || ""
  const title = normalized.match(/(?:diagnosis|assessment|test|study|report)\s*[:\-]\s*([^.;]+)/i)?.[1]?.trim() || "Imported health document"
  return { title: title.slice(0, 120), provider: provider.slice(0, 120), date, description: normalized.slice(0, 2000) }
}
