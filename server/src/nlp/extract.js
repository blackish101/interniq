/**
 * InternIQ NLP: CV text -> structured skill profile.
 *
 * Pipeline (matches the technique list in the project document):
 *   1. normalise + tokenise           (tokenization)
 *   2. section split                  (document structure awareness)
 *   3. lexicon lookup with surface
 *      forms                           (dictionary/suffix-style matching, NER-like)
 *   4. evidence + confidence scoring  (frequency + context weighting)
 *   5. skill level estimation         (1..5, discounted without hard evidence)
 *   6. regex entity extraction        (contact, education, experience)
 */

const SECTION_PATTERNS = [
  ['skills', /^(?:technical\s+)?(?:skills|core\s+competencies|competencies|technologies|tools)\b/i],
  ['experience', /(work\s+)?(experience|employment|internship|professional\s+background)/i],
  ['education', /(education|academic|qualifications?|courses?|degrees?)/i],
  ['projects', /(projects?|portfolio|research)/i],
  ['certifications', /(certifications?|licen[cs]es|training|courses?\s+completed)/i],
  ['contact', /(contact|personal\s+details|address)/i],
];

const SECTION_WEIGHT = { skills: 1.0, certifications: 0.9, projects: 0.8, experience: 0.75, education: 0.5, contact: 0.2, other: 0.45 };

const SENIORITY_CUES = /\b(senior|lead|chief|architect|advanced|expert|extensive|5\+|3\+ years|two years|three years|several years)\b/i;
const PROFESSIONAL_CUES = /\b(worked|intern(ship)?|employ|responsible|built|developed|implemented|managed|delivered|produc(t|tion)|client|company)\b/i;
const ACADEMIC_CUES = /\b(course|coursework|project|lab|assignment|thesis|learned|studied|tutorial)\b/i;

export function normalize(text = '') {
  return String(text)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\u00a0/g, ' ')
    .replace(/([A-Za-z0-9])\.([A-Za-z0-9])/g, '$1. $2')
    .toLowerCase()
    .replace(/[^a-z0-9+#./@_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text = '') {
  return normalize(text).split(' ').filter(Boolean);
}

const STOPWORDS = new Set(('a an the and or but if then than that this these those of in on at to for with without by from as is are was were be been being will would can could should may might must do does did done have has had having it its they them their we our you your he she his her i me my mine not no so such too very just also more most other others some any each few all both few per via etc eg ie vs within into over under about above below across among along before after while when where which who whom whose what how why.'
  + ' resume cv curriculum vitae profile summary objective experience education skills project projects work working year years month months company company role position responsibilities tasks task achieved achieve responsible responsibility use used using user using strong good excellent basic familiar knowledge knowledgeable understanding understanding ability able team teams teamplayer.'
  + ' st marys university addis ababa ethiopia').split(/\s+/).filter(Boolean));

/** Light suffix stripper - enough to make "modeling" and "models" collide. */
export function stem(token) {
  let t = token;
  if (t.length > 4) t = t.replace(/(ing|ions|ies|ers|edly|ing|ed|es|s)$/, '');
  if (t.length > 4) t = t.replace(/(ational|iveness|fulness|ousness|ality|ement|ment|ance|ence|able|ible|al|ic|ive|ful)$/, '');
  return t;
}

export function contentTokens(text) {
  return tokenize(text)
    .map((t) => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A term boundary matcher that survives skills whose names end in punctuation
 * ("C#", ".NET", "Node.js") where a plain \b would never match.
 */
function termRegex(term) {
  const t = escapeRe(term.trim().toLowerCase());
  const left = /[\w.#]$/.test(term) ? '\\b' : '(?<![\\w.])';
  const right = /^[\w.#]/.test(term) ? '\\b' : '(?![\\w.#])';
  return new RegExp(`${left}${t}${right}`, 'g');
}

/** Splits a CV into labelled sections so evidence can be weighted by context. */
export function splitSections(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let current = { name: 'other', lines: [] };
  for (const line of lines) {
    const trimmed = line.trim();
    const looksHeading = trimmed.length > 0 && trimmed.length < 60 && (/[:▬—-]\s*$/.test(trimmed) || /^[A-Z][A-Z\s&/]+$/.test(trimmed));
    if (looksHeading) {
      const hit = SECTION_PATTERNS.find(([, re]) => re.test(trimmed));
      if (hit) {
        if (current.lines.length) out.push(current);
        current = { name: hit[0], lines: [] };
        continue;
      }
    }
    current.lines.push(line);
  }
  if (current.lines.length) out.push(current);
  return out;
}

function snippetAround(raw, index, termLen) {
  const from = Math.max(0, index - 55);
  const to = Math.min(raw.length, index + termLen + 55);
  return (from > 0 ? '...' : '') + raw.slice(from, to).replace(/\s+/g, ' ').trim() + (to < raw.length ? '...' : '');
}

/**
 * Finds lexicon skills in a CV.
 * @param {string} rawText  the CV as plain text
 * @param {Array}  lexicon  [{ id, name, category, aliases: string[] }]
 * @returns {{ skills: Array, unknownCandidates: string[] }}
 */
export function extractSkills(rawText, lexicon) {
  const sections = splitSections(rawText);
  const found = new Map();

  const terms = [];
  for (const skill of lexicon) {
    terms.push({ skill, term: skill.name, exact: skill.name.length <= 3 });
    for (const alias of skill.aliases ?? []) {
      if (alias.length < 2) continue;
      terms.push({ skill, term: alias, exact: alias.length <= 2 });
    }
  }

  for (const section of sections) {
    const text = section.lines.join('\n');
    const lower = text.toLowerCase();
    const norm = normalize(text);
    const weight = SECTION_WEIGHT[section.name] ?? 0.45;

    for (const { skill, term, exact } of terms) {
      const haystack = exact ? text : norm;
      const needle = exact ? term : term.toLowerCase();
      const re = exact ? null : termRegex(needle);
      let match;
      let hits = 0;
      const evidences = [];

      if (exact) {
        const tokenRe = new RegExp(`(^|[\\s,;/()\\[\\]])${escapeRe(needle)}($|[\\s,;/()\\[\\]])`);
        for (const line of text.split(/\r?\n/)) {
          const m = line.match(tokenRe);
          if (m) { hits += 1; evidences.push({ index: line.indexOf(m[0]) + (text.indexOf(line) || 0), len: needle.length }); }
        }
      } else {
        while ((match = re.exec(haystack)) !== null && hits < 20) {
          hits += 1;
          evidences.push({ index: match.index, len: needle.length });
          if (match.index === re.lastIndex) re.lastIndex += 1;
        }
      }
      if (!hits) continue;

      const key = skill.id;
      if (!found.has(key)) {
        found.set(key, { skill_id: skill.id, name: skill.name, category: skill.category, hits: 0, sections: new Set(), evidence: [], matchedTerms: new Set(), weight: 0 });
      }
      const rec = found.get(key);
      rec.hits += hits;
      rec.sections.add(section.name);
      rec.weight = Math.max(rec.weight, weight);
      rec.matchedTerms.add(needle);
      if (rec.evidence.length < 2) {
        for (const e of evidences.slice(0, 2)) rec.evidence.push(snippetAround(text, e.index, e.len));
      }
    }
  }

  const skills = [...found.values()].map((rec) => {
    const contextScore = rec.weight;
    const frequencyScore = Math.min(rec.hits / 4, 1);
    const joined = rec.evidence.join(' ');
    let level = 1 + Math.round(frequencyScore * 2 + contextScore * 2);
    if (SENIORITY_CUES.test(joined)) level += 1;
    else if (!PROFESSIONAL_CUES.test(joined) && rec.sections.has('education')) level -= 1;
    level = Math.max(1, Math.min(5, level));

    const confidence = Math.round(
      Math.min(0.98, 0.35 + contextScore * 0.35 + frequencyScore * 0.2 + (rec.sections.size > 1 ? 0.1 : 0) + (PROFESSIONAL_CUES.test(joined) ? 0.08 : 0)) * 100
    ) / 100;

    return {
      skill_id: rec.skill_id,
      name: rec.name,
      category: rec.category,
      level,
      confidence,
      hits: rec.hits,
      matched_via: [...rec.matchedTerms],
      sections: [...rec.sections],
      evidence: rec.evidence,
      verified: rec.sections.has('skills') || rec.sections.has('experience') || rec.sections.has('certifications'),
    };
  }).sort((a, b) => b.level - a.level || b.confidence - a.confidence || a.name.localeCompare(b.name));

  return { skills, unknownCandidates: suggestUnknown(rawText, lexicon, skills) };
}

/**
 * Open-vocabulary pass: capitalised multi-word candidates that are not in the
 * lexicon. Reported to the student as "unrecognised" so extraction stays honest
 * instead of silently dropping a niche tool.
 */
function suggestUnknown(rawText, lexicon, matched) {
  const known = new Set();
  for (const s of lexicon) { known.add(s.name.toLowerCase()); for (const a of s.aliases ?? []) known.add(String(a).toLowerCase()); }
  for (const m of matched) known.add(m.name.toLowerCase());

  const counts = new Map();
  const re = /(?:[A-Z][A-Za-z0-9+#.]*[ \t]?){1,3}/g;
  for (const raw of rawText.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(http|https|@|\d)/.test(line)) continue;
    let m;
    while ((m = re.exec(line)) !== null) {
      const cand = m[0].trim().replace(/[.,;:]+$/, '');
      if (cand.length < 3 || cand.length > 26) continue;
      if (known.has(cand.toLowerCase())) continue;
      if (/^(I|The|And|Our|We|At|In|On|My|This|That|Curriculum|Resume|Name|Phone|Email|Addis|Ababa|St|Mary|University|College|Faculty|Department|Bachelor|Gpa|Objective|Summary)/.test(cand)) continue;
      counts.set(cand, (counts.get(cand) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
}

/** Regex-based information extraction over the CV. */
export function extractEntities(rawText) {
  const text = String(rawText);
  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ?? null;
  const phone = text.match(/(\+?\d{1,3}[-\s]?)?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{3,4}\b/)?.[0]?.trim() ?? null;
  const urls = [...new Set(text.match(/(?:https?:\/\/|www\.|github\.com\/|linkedin\.com\/in\/)[^\s,;)"']+/gi) ?? [])].slice(0, 6);
  const gpa = text.match(/\bgpa\b[^0-9]{0,12}([0-4](?:\.\d{1,2})?)/i)?.[1] ?? null;
  const graduation = text.match(/(?:graduation(?:\s+year)?|class of)[:\s]*(20\d{2})/i)?.[1] ?? null;
  const yearsExperience = text.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b[^.]{0,30}(?:experience|exp\b)/i)?.[1] ?? null;
  const department = text.match(/\b(computer science|software engineering|accounting|marketing management|marketing|management|tourism|hospitality|economics|business)\b/i)?.[1] ?? null;

  const education = [];
  const eduRe = /\b(b-?sc|bsc|b\.sc|b\.a|ba|master'?s?|m-?sc|msc|m\.s|mba|phd|diploma|certificate|degree)\b[^\n]{0,110}/gi;
  let em;
  while ((em = eduRe.exec(text)) !== null) {
    const line = em[0].trim().replace(/\s+/g, ' ').slice(0, 140);
    if (/study|studies|business|diploma of/i.test(line) && !/university|college|expected|20\d\d/i.test(line)) continue;
    education.push(line);
  }

  return {
    email, phone, urls, gpa,
    graduation_year: graduation ? Number(graduation) : null,
    years_experience: yearsExperience ? Number(yearsExperience) : null,
    department,
    education: [...new Set(education)].slice(0, 3),
  };
}

/** Full CV analysis in one call - what the API layer uses. */
export function analyzeCv(rawText, lexicon) {
  const { skills, unknownCandidates } = extractSkills(rawText, lexicon);
  const entities = extractEntities(rawText);
  const words = tokenize(rawText).length;
  const sections = splitSections(rawText).filter((s) => s.name !== 'other').map((s) => s.name);
  const categories = new Set(skills.map((s) => s.category));
  return {
    skills,
    unknown_candidates: unknownCandidates,
    entities,
    metrics: {
      words,
      characters: rawText.length,
      sections,
      unique_skills: skills.length,
      category_spread: categories.size,
      skills_per_100_words: words ? Math.round((skills.length / words) * 1000) / 10 : 0,
      quality: words < 60 ? 'too_short' : skills.length < 3 ? 'thin' : skills.length < 8 ? 'good' : 'strong',
    },
  };
}
