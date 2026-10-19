'use client';
/* Local derived thumbnails; detail/comparison views keep original bytes. */
/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
export function ImagePreview({ id, title, detail = false }: { id: string; title: string; detail?: boolean }) {
  const [attempt, setAttempt] = useState(0), [state, setState] = useState('loading');
  return <div className={detail ? 'image-preview image-detail-preview' : 'image-preview'}>
    {state === 'loading' && <span className="storage-note" role="status">Loading image…</span>}
    {state === 'error' && <div role="alert"><p>{detail ? 'Image could not be read. Restore a verified backup if its file is missing or damaged.' : 'Preview could not be loaded. Retry, or open the image to check its original.'}</p><button type="button" className="secondary-button" onClick={() => { setState('loading'); setAttempt(n => n + 1); }}>Retry preview</button></div>}
    <img key={attempt} src={`/api/images/${id}${detail ? '' : '/thumbnail'}?attempt=${attempt}`} loading={detail ? 'eager' : 'lazy'} decoding="async" width={detail ? undefined : 640} height={detail ? undefined : 440} alt={title} hidden={state === 'error'} onLoad={() => setState('ready')} onError={() => setState('error')} />
  </div>;
}
