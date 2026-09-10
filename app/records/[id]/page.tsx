import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Check, Clock3, FileText, ShieldCheck, Workflow } from "lucide-react"
import { mockRecords } from "../../../lib/mock-data"

export function generateStaticParams() {
  return mockRecords.map((record) => ({ id: record.id }))
}

export default async function RecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const record = mockRecords.find((item) => item.id === id)
  if (!record) notFound()

  return (
    <main className="standalone-content">
      <Link href="/records" className="back-link"><ArrowLeft size={15} /> Back to records</Link>
      <div className="page-header">
        <div><div className="eyebrow">{record.type.toUpperCase()}</div><h1>{record.title}</h1><p>{record.provider} · {record.date}</p></div>
        {record.status === "VERIFIED"
          ? <span className="badge"><Check size={13} /> Verified</span>
          : <span className="badge pending-badge"><Clock3 size={13} /> Verification in progress</span>}
      </div>
      <div className="detail-page-grid">
        <section className="card document-card">
          <div className="document-top">
            <span className="record-icon"><FileText size={19} /></span>
            <div><strong>{record.fileName ?? `${record.id}.pdf`}</strong><p>PDF document</p></div>
          </div>
          <div className="document-preview">
            <FileText size={26} />
            <strong>{record.title}</strong>
            <span>{record.data ?? "Document preview is available in the full product."}</span>
          </div>
        </section>
        <section className="card">
          <div className="panel-heading">            <div><h2>Access & automation</h2><p>Who can see this record and how automation protects it.</p></div><Workflow size={18} className="verified" /></div>
          <div className="detail-line"><span>Visibility</span><strong>Consent controlled</strong></div>
          <div className="detail-line"><span>Verification workflow</span><strong>Record intake & verification</strong></div>
          <div className="detail-line"><span>Access notifications</span><strong>Fan-out on every view</strong></div>
          <div className="detail-line"><span>Audit trail</span><strong>Every access is logged</strong></div>
          <p className="security-copy"><ShieldCheck size={15} /> Providers need an active consent to view this document.</p>
        </section>
      </div>
    </main>
  )
}
