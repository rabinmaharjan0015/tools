/** Display helpers shared by the UI. */
export const clip = (s: string, n = 200_000) => (s.length > n ? s.slice(0, n) : s)

export const canPreview = (type: string) =>
  type.startsWith('image/') || type.startsWith('audio/') || type.startsWith('video/') || type === 'application/pdf'
