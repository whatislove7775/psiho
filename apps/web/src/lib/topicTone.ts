/**
 * Stable playful tone for a topic/tag/category name, so the same topic always gets
 * the same colour across the site (Badge tone / pastel). See docs/DESIGN.md → «Акценты».
 */
export const TOPIC_TONES = ["lilac", "cyan", "coral", "sun", "mint"] as const;
export type TopicTone = (typeof TOPIC_TONES)[number];

export function topicTone(name: string): TopicTone {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return TOPIC_TONES[Math.abs(h) % TOPIC_TONES.length];
}
