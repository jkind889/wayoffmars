import type { Metadata } from "next";
import { NoteLibrary } from "@/components/note-library";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Design notes | wayoffmars", description: "A personal home for your design notes." };
export default function NotesPage() {
  return <><SiteHeader active="notes" /><main className="shell main-content">
    <div className="page-intro"><h1>Your design notes</h1><p>Keep the ideas you want to come back to.</p></div>
    <NoteLibrary />
  </main></>;
}
