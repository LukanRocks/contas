/**
 * What the camera reads is any QR code the user happens to point at, so a
 * scanned string has to be sorted into something the ingest endpoint accepts
 * before it is worth a round trip.
 *
 * The two shapes `POST /api/nfce` takes are the URL a note's QR code encodes
 * and the chave de acesso on its own. Which of the two a payload is stays the
 * backend's call -- it owns the rules for pulling a chave out of a URL, and
 * duplicating them here would mean rejecting notes the server would have
 * taken. This only tells a plausible note from a wifi code or a vCard.
 */
export type IngestPayload = { url: string } | { chave: string };

export function classifyScan(raw: string): IngestPayload | null {
  const value = raw.trim();
  if (!value) return null;

  // A note's QR code is a link to its state portal. Anything else http(s) is
  // the backend's to reject, with a better reason than this function has.
  if (/^https?:\/\//i.test(value)) return { url: value };

  // Some notes are handed over as the bare key, printed in groups of four.
  // Only digits and the separators a receipt prints, so arbitrary text with 44
  // digits buried in it is not mistaken for a key.
  if (/^[\d\s.-]+$/.test(value)) {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 44) return { chave: digits };
  }

  return null;
}
