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
  additionalInfo: string
}

type ProgressPayload = { value: number; page: number; pages: number; step: string; status: "preparing" | "extracting" | "analyzing" | "complete" | "error" }
type ProgressHandler = (payload: ProgressPayload) => void

let workerPromise: Promise<any> | undefined

async function getWorker() {
  if (!workerPromise) {
    const { createWorker } = await import("tesseract.js")
    // Keep these public asset paths in sync with the installed tesseract.js version.
    workerPromise = createWorker("eng", 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/tesseract-core.wasm.js",
      langPath: "/tesseract/lang-data",
      logger: () => undefined,
    })
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
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pageResults: PageExtractionResult[] = []
  const errors: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    emit(onProgress, ((pageNumber - 1) / pdf.numPages) * 100, pageNumber, pdf.numPages, `Extracting page ${pageNumber}`, "extracting")
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const embedded = content.items.map((item) => ("str" in item ? item.str + (("hasEOL" in item && item.hasEOL) ? "\n" : " ") : "")).join("").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
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
  if (file.type === "application/pdf") {
    const result = await extractPdf(file, onProgress)
    if (result.text.replace(/--- Page \d+ ---/g, "").trim().length < 20) throw new Error("We couldn't read any text from this document. Try a clearer photo, better lighting, or a different file.")
    return result
  }
  const input = await preprocessImage(file)
  const pageResult = await recognizeImage(input, 1, 1, onProgress)
  if (pageResult.text.trim().length < 20) throw new Error("We couldn't read any text from this document. Try a clearer photo, better lighting, or a different file.")
  const result = { text: pageResult.text, source: "ocr" as const, confidence: pageResult.confidence, pages: 1, pageResults: [pageResult], status: pageResult.status, errors: [] }
  emit(onProgress, 100, 1, 1, "Extraction complete", "complete")
  return result
}

const firstMatch = (text: string, patterns: RegExp[]) => patterns.map((pattern) => text.match(pattern)?.[1]?.trim()).find(Boolean) || ""
const clean = (value: string) => value.replace(/[ \t]+/g, " ").replace(/[|]+/g, " ").trim().slice(0, 400)
const KNOWN_LABELS = /^(hospital|clinic|facility|medical\s+centre|medical\s+center|doctor|physician|consultant|attending|referred\s+by|patient|patient\s+name|name|date\s+of\s+birth|dob|report|study|investigation|procedure\s+title|report\s+date|visit\s+date|specimen\s+date)\s*[:\-]/i

function extractAdditionalInfo(text: string) {
  const lines = text.split(/\r?\n/).map((line) => clean(line)).filter(Boolean)
  const extras: string[] = []
  for (const line of lines) {
    const match = line.match(/^([A-Za-z][A-Za-z\s/]{2,40}?)\s*[:\-]\s*(.+)$/)
    if (match && !KNOWN_LABELS.test(line)) extras.push(`${match[1].trim()}: ${clean(match[2])}`)
  }
  return extras
}

export function inferRecordFields(text: string): ExtractedRecordFields {
  const source = text.replace(/\u0000/g, " ").trim()
  const normalized = source
  const date = firstMatch(normalized, [/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2})\b/, /\b(\d{1,2}[/-]\d{1,2}[/-]20\d{2})\b/, /(?:report|visit|specimen)\s+date\s*[:\-]?\s*([^.;,\n]+)/i])
  const provider = clean(firstMatch(normalized, [/(?:doctor|physician|consultant)\s*[:\-]?\s*([^.;,\n]+)/i, /(?:attending|referred\s+by)\s*[:\-]?\s*([^.;,\n]+)/i]))
  const labeledFacility = firstMatch(normalized, [/(?:hospital|clinic|facility|medical\s+centre|medical\s+center)\s*[:\-]?\s*([^.;,\n]+)/i])
  const headerLines = source.split(/\r?\n/).map((line) => clean(line)).filter((line) => line.length > 3 && line.length <= 120 && !/\b(?:patient|name|dob|date|report|mrn|id)\b/i.test(line) && !/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line))
  const headerFacility = headerLines.find((line) => /^(?:[A-Z][A-Za-z0-9&.'-]*\s*){2,}$/.test(line) || line === line.toUpperCase()) || ""
  const facility = clean(labeledFacility || headerFacility)
  const title = clean(firstMatch(normalized, [/(?:report|study|investigation|procedure)\s*(?:title|name)?\s*[:\-]?\s*([^.;\n]+)/i]))
  const patientName = clean(firstMatch(normalized, [/(?:patient|patient\s+name|name)\s*[:\-]?\s*([^.;,\n]+)/i]))
  const dateOfBirth = clean(firstMatch(normalized, [/(?:date\s+of\s+birth|dob)\s*[:\-]?\s*([^.;,\n]+)/i]))
  const diagnosis = clean(firstMatch(normalized, [/(?:diagnosis|impression)\s*[:\-]?\s*([^.;\n]+)/i]))
  const assessment = clean(firstMatch(normalized, [/(?:assessment|clinical\s+assessment)\s*[:\-]?\s*([^.;\n]+)/i]))
  const procedure = clean(firstMatch(normalized, [/(?:test|investigation|procedure)\s*[:\-]?\s*([^.;\n]+)/i]))
  const medication = clean(firstMatch(normalized, [/(?:medication|prescription|medicine)\s*[:\-]?\s*([^.;\n]+)/i]))
  const findings = clean(firstMatch(normalized, [/(?:findings|results|observations)\s*[:\-]?\s*([^.;\n]+)/i]))
  const description = clean(firstMatch(normalized, [/(?:description|notes|clinical\s+notes?)\s*[:\-]?\s*([^.;\n]+)/i]))
  const mapped = new Set([title, provider, facility, date, patientName, dateOfBirth, description])
  const labeledExtras = extractAdditionalInfo(source).filter((item) => !Array.from(mapped).some((value) => value && item.toLowerCase().endsWith(value.toLowerCase())))
  const additionalInfo = [...[
    diagnosis && `Diagnosis: ${diagnosis}`, assessment && `Assessment: ${assessment}`, procedure && `Procedure: ${procedure}`, medication && `Medication: ${medication}`, findings && `Findings: ${findings}`, patientName && `Patient name: ${patientName}`, dateOfBirth && `Date of birth: ${dateOfBirth}`
  ].filter(Boolean), ...labeledExtras].join("\n")
  return { title, provider, facility, date, patientName, dateOfBirth, diagnosis, assessment, procedure, medication, findings, description, additionalInfo }
}

export async function releaseOcrWorker() {
  const worker = await workerPromise
  workerPromise = undefined
  await worker?.terminate()
}
