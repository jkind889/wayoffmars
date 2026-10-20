import type { Metadata } from "next";
import { NoteLibrary } from "@/components/note-library";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Note | wayoffmars", description: "Read and edit a saved design note." };
export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: segment } = await params;
  let id: string;
  try { id = decodeURIComponent(segment); } catch { id = segment; }
  return <><SiteHeader active="notes" /><main className="shell main-content">
    <div className="page-intro"><h1>Design note</h1><p>Your writing, saved on this Mac.</p></div>
    <NoteLibrary key={id} detailId={id} />
  </main></>;
}
