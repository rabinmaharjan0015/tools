import { useEffect, useState } from 'react'

/** Renders an image, audio, video or PDF preview of a Blob via an object URL (revoked on unmount). */
export function BlobPreview({ blob, mime }: { blob: Blob; mime?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(blob)
    // oxlint-disable-next-line react/set-state-in-effect -- syncing with an external resource (object URL)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])

  const type = mime || blob.type
  if (!url) return null
  if (type.startsWith('image/')) return <img className="preview" src={url} alt="Preview" />
  if (type.startsWith('audio/')) return <audio className="preview" src={url} controls />
  if (type.startsWith('video/')) return <video className="preview" src={url} controls />
  if (type === 'application/pdf') return <iframe className="preview pdf" src={url} title="PDF preview" />
  return null
}
