import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { extractDocument, saveDocuments, getDocuments, type DocumentKind } from "../../../../lib/platform"
import { recordGatewayEvent } from "../../../../lib/n8n-server"

export const dynamic = "force-dynamic"

/**
 * Document processing endpoint. In production the automation engine performs
 * real OCR + AI extraction and posts results to /api/n8n/callback; here the
 * structured pipeline runs server-side and marks the document for human
 * verification — AI output is never auto-verified (per product rules).
 */
export async function POST(request: NextRequest) {
  let body: { fileName?: string; kind?: string } = {}
  try {
    body = (await request.json()) as { fileName?: string; kind?: string }
  } catch { /* defaults below */ }

  const fileName = (body.fileName ?? "upload.pdf").slice(0, 120)
  const kindRaw = body.kind ?? ""
  const kind: DocumentKind = (["Prescription", "Lab Report", "Discharge Summary", "Medical Certificate"].includes(kindRaw) ? kindRaw : "Other") as DocumentKind

  const doc = extractDocument(fileName, kind)
  saveDocuments([doc, ...getDocuments()].slice(0, 50))
  recordGatewayEvent({ event: "document.extracted", source: "document-pipeline", payload: { documentId: doc.id, kind, fields: doc.fields.length }, forwarded: false, kind: "app-event" })

  return NextResponse.json({
    ok: true,
    document: doc,
    notice: doc.qualityNotes.length ? doc.qualityNotes[0] : "Extraction complete — review the fields, then send for verification.",
  })
}
