"use client"

export type PageExtractionResult = {
  page: number
  text: string
  confidence: number
  source: "pdf-text" | "ocr"
  status: "complete" | "needs-review" | "error"
  error?: string
}

export type ExtractionResult = {
  text: string
  source: "ocr" | "pdf-text" | "mixed" | "manual"
  confidence: number
  pages: number
  pageResults: PageExtractionResult[]
  status: "complete" | "needs-review" | "error"
  errors: string[]
}

export type ExtractedRecordFields = {
  title: string
  provider: string
  facility: string
  date: string
  patientName: string
  dateOfBirth: string
  diagnosis: string
  assessment: string
  procedure: string
  medication: string
  findings: string
  description: string
}

type ProgressPayload = { value: number; page: number; pages: number; step: string; status: "preparing" | "extracting" | "analyzing" | "complete" | "error" }
type ProgressHandler = (payload: ProgressPayload) => void

let workerPromise: Promise<any> | undefined

async function getWorker() {
  if (!workerPromise) {
    const { createWorker } = await import("tesseract.js")
    workerPromise = createWorker("eng", 1, { logger: () => undefined })
  }
  return workerPromise
}

function emit(handler: ProgressHandler | undefined, value: number, page: number, pages: number, step: string, status: ProgressPayload["status"]) {
  handler?.({ value: Math.max(0, Math.min(100, Math.round(value))), page, pages, step, status })
}

async function recognizeImage(input: Blob | HTMLCanvasElement, page: number, pages: number, onProgress?: ProgressHandler) {
  const worker = await getWorker()
  const result = await worker.recognize(input, {}, { blocks: true })
  const confidence = Number(result.data.confidence || 0)
  emit(onProgress, ((page - 1) / pages) * 100 + 90 / pages, page, pages, `Reading page ${page}`, "extracting")
  return { page, text: String(result.data.text || "").trim(), confidence, source: "ocr" as const, status: confidence >= 70 ? "complete" as const : "needs-review" as const }
}

async function preprocessImage(file: File) {
  if (typeof document === "undefined") return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.max(1, Math.min(2, 1800 / Math.max(bitmap.width, bitmap.height)))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext("2d")
  if (!context) return file
  context.filter = "grayscale(1) contrast(1.12)"
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas
}

async function extractPdf(file: File, onProgress?: ProgressHandler): Promise<ExtractionResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pageResults: PageExtractionResult[] = []
  const errors: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    emit(onProgress, ((pageNumber - 1) / pdf.numPages) * 100, pageNumber, pdf.numPages, `Extracting page ${pageNumber}`, "extracting")
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const embedded = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim()
    if (embedded.length >= 24) {
      pageResults.push({ page: pageNumber, text: embedded, confidence: 100, source: "pdf-text", status: "complete" })
      continue
    }
    try {
      const viewport = page.getViewport({ scale: 2.2 })
      const canvas = document.createElement("canvas")
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext("2d", { willReadFrequently: true })
      if (!context) throw new Error("Canvas unavailable")
      await page.render({ canvasContext: context, canvas, viewport }).promise
      pageResults.push(await recognizeImage(canvas, pageNumber, pdf.numPages, onProgress))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Page OCR failed"
      errors.push(`Page ${pageNumber}: ${message}`)
      pageResults.push({ page: pageNumber, text: embedded, confidence: 0, source: "ocr", status: "error", error: message })
    }
  }
  const text = pageResults.map((result) => `--- Page ${result.page} ---\n${result.text}`).join("\n\n").trim()
  const confidence = pageResults.length ? pageResults.reduce((sum, result) => sum + result.confidence, 0) / pageResults.length : 0
  return { text, source: pageResults.some((result) => result.source === "ocr") && pageResults.some((result) => result.source === "pdf-text") ? "mixed" : pageResults.some((result) => result.source === "ocr") ? "ocr" : "pdf-text", confidence, pages: pdf.numPages, pageResults, status: errors.length || confidence < 70 ? "needs-review" : "complete", errors }
}

export async function extractDocumentText(file: File, onProgress?: ProgressHandler): Promise<ExtractionResult> {
  const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"]
  if (!allowed.includes(file.type)) throw new Error("This file type isn't supported. Please upload a PDF, JPG, PNG, or WEBP.")
  if (file.size > 10 * 1024 * 1024) throw new Error("This document is larger than 10 MB.")
  emit(onProgress, 0, 0, 1, "Preparing document", "preparing")
  if (file.type === "application/pdf") return extractPdf(file, onProgress)
  const input = await preprocessImage(file)
  const pageResult = await recognizeImage(input, 1, 1, onProgress)
  const result = { text: pageResult.text, source: "ocr" as const, confidence: pageResult.confidence, pages: 1, pageResults: [pageResult], status: pageResult.status, errors: [] }
  emit(onProgress, 100, 1, 1, "Extraction complete", "complete")
  return result
}

const firstMatch = (text: string, patterns: RegExp[]) => patterns.map((pattern) => text.match(pattern)?.[1]?.trim()).find(Boolean) || ""
const clean = (value: string) => value.replace(/\s+/g, " ").replace(/[|]+/g, " ").trim().slice(0, 400)

export function inferRecordFields(text: string): ExtractedRecordFields {
  const normalized = text.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim()
  const date = firstMatch(normalized, [/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2})\b/, /\b(\d{1,2}[/-]\d{1,2}[/-]20\d{2})\b/, /(?:report|visit|specimen)\s+date\s*[:\-]?\s*([^.;,]+)/i])
  const provider = clean(firstMatch(normalized, [/(?:doctor|physician|consultant)\s*[:\-]?\s*([^.;,]+)/i, /(?:attending|referred\s+by)\s*[:\-]?\s*([^.;,]+)/i]))
  const facility = clean(firstMatch(normalized, [/(?:hospital|clinic|facility|medical\s+centre|medical\s+center)\s*[:\-]?\s*([^.;,]+)/i]))
  const title = clean(firstMatch(normalized, [/(?:report|study|investigation|procedure)\s*(?:title|name)?\s*[:\-]?\s*([^.;]+)/i]))
  const patientName = clean(firstMatch(normalized, [/(?:patient|patient\s+name|name)\s*[:\-]?\s*([^.;,]+)/i]))
  const dateOfBirth = firstMatch(normalized, [/(?:date\s+of\s+birth|dob)\s*[:\-]?\s*([^.;,]+)/i])
  const diagnosis = clean(firstMatch(normalized, [/(?:diagnosis|impression)\s*[:\-]?\s*([^.;]+)/i]))
  const assessment = clean(firstMatch(normalized, [/(?:assessment|clinical\s+assessment)\s*[:\-]?\s*([^.;]+)/i]))
  const procedure = clean(firstMatch(normalized, [/(?:test|investigation|procedure)\s*[:\-]?\s*([^.;]+)/i]))
  const medication = clean(firstMatch(normalized, [/(?:medication|prescription|medicine)\s*[:\-]?\s*([^.;]+)/i]))
  const findings = clean(firstMatch(normalized, [/(?:findings|results|observations)\s*[:\-]?\s*([^.;]+)/i]))
  return { title: title || "", provider, facility, date, patientName, dateOfBirth, diagnosis, assessment, procedure, medication, findings, description: clean([diagnosis, assessment, procedure, medication, findings].filter(Boolean).join(". ")) }
}

export async function releaseOcrWorker() {
  const worker = await workerPromise
  workerPromise = undefined
  await worker?.terminate()
}
