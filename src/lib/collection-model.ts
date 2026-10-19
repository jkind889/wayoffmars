export type Member = { kind: 'notes' | 'images' | 'pdfs' | 'fonts'; id: string };
export type Collection = { id: string; name: string; revision: string; createdAt: number; updatedAt: number; members: Member[] };
export type CollectionItem = Member & { title: string; preview: string };
export type CollectionsLibrary = { collections: Collection[]; items: CollectionItem[] };
export const memberKey = (member: Member) => `${member.kind}:${member.id}`;
export const memberUrl = (member: Member) => member.kind === 'fonts' ? `/#font-${encodeURIComponent(member.id)}` : member.kind === 'notes' ? `/notes#note-${encodeURIComponent(member.id)}` : member.kind === 'images' ? `/images?image=${encodeURIComponent(member.id)}` : `/pdf/${encodeURIComponent(member.id)}`;
