/**
 * Vector space model: TF-IDF weighting + cosine similarity.
 *
 * This is the semantic-similarity half of the matcher. The lexicon finds
 * named skills; TF-IDF catches the vocabulary a CV and a posting share when
 * they describe the same work without using the same skill labels. It is the
 * JS stand-in for sentence embeddings in the prototype: same cosine idea,
 * lexical rather than learned vectors, and it needs no model download.
 */

import { contentTokens } from './extract.js';

/** Sublinear term frequency, so a keyword stuffed CV does not win. */
function tf(termFreq) {
  const out = new Map();
  for (const [term, n] of termFreq) out.set(term, 1 + Math.log(n));
  return out;
}

function termCounts(tokens) {
  const c = new Map();
  for (const t of tokens) c.set(t, (c.get(t) ?? 0) + 1);
  return c;
}

export function buildIdf(texts) {
  const docs = texts.map((t) => new Set(contentTokens(t)));
  const n = docs.length || 1;
  const df = new Map();
  for (const set of docs) for (const term of set) df.set(term, (df.get(term) ?? 0) + 1);
  const idf = new Map();
  for (const [term, f] of df) idf.set(term, Math.log((n + 1) / (f + 0.5)) + 1);
  return idf;
}

/** Sparse L2-normalised vector, returned as a Map(term -> weight). */
export function vectorize(text, idf) {
  const counts = termCounts(contentTokens(text));
  const vec = new Map();
  let sumSq = 0;
  for (const [term, n] of tf(counts)) {
    const w = n * (idf.get(term) ?? Math.log(2));
    vec.set(term, w);
    sumSq += w * w;
  }
  const norm = Math.sqrt(sumSq) || 1;
  for (const [k, v] of vec) vec.set(k, v / norm);
  return vec;
}

export function cosine(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, w] of small) {
    const other = large.get(term);
    if (other) dot += w * other;
  }
  return Math.max(0, dot);
}

/** Lexical overlap of two texts, useful as a cheap second opinion. */
export function jaccard(textA, textB) {
  const a = new Set(contentTokens(textA));
  const b = new Set(contentTokens(textB));
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
