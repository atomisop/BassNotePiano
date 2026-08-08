// Dynamic Glass photography registry — see design-system/bass-note-piano/MASTER.md
// for the full material system this feeds into. One place to swap a photo;
// no page should hardcode a raw Unsplash URL.

function unsplash(id: string, params = "w=2400&q=80&fit=crop&auto=format") {
  return `https://images.unsplash.com/${id}?${params}`;
}

export const BACKDROPS = {
  /** Marketing homepage hero — B&W grand piano, hand on keys, warm bokeh. */
  marketingHero: unsplash("photo-1513883049090-d0b7439799bf"),
  /** Marketing "every instrument" section — acoustic guitar, golden-hour light. */
  guitar: unsplash("photo-1573603088895-d399fbee9653"),
  /** Marketing homepage "The curriculum" section — grand piano in an atmospheric room, distinct from the hero's close-up shot. */
  curriculum: unsplash("photo-1571553693721-b9500d685594"),
  /** Classes page — vintage sheet music, warm prism light. */
  classes: unsplash("photo-1568057609581-8556cf900d3c"),
  /** Pricing page — vinyl record, warm and dark. */
  pricing: unsplash("photo-1473646590311-c48e1bc77b44"),
  /** Shared across every auth screen — moody upright piano, dim warm room. */
  auth: unsplash("photo-1612358715408-3ecb2df90cc1"),
  /** Shared across every authenticated page (dashboard, admin, billing, everything) — piano keys close-up, warm, even tone so it holds up under heavy blur behind dense UI. */
  appShell: unsplash("photo-1512733596533-7b00ccf8ebaf"),
} as const;
