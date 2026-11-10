/**
 * InternIQ matching engine.
 *
 * Compatibility between a student profile (+ CV) and an internship posting is
 * a weighted sum of six transparent components. Every component keeps its own
 * sub-score and its own explanation, because the project has to defend the
 * ranking, not just display it (specific objective 4 and evaluation objective 7).
 *
 *   final = 100 * SUM(weight_i * subscore_i)   (weights sum to 1.00)
 *
 *   skills     .34  weighted coverage of the posting's required/nice-to-have skills
 *   semantic   .20  cosine similarity of CV text against posting text (TF-IDF)
 *   department .12  department-aware eligibility (objective 5)
 *   academic   .12  year-of-study and GPA fit against the posting's criteria
 *   logistics  .12  work format, city, weekly hours
 *   affinity   .10  student interests / target roles vs the posting's topic terms
 *
 * Eligibility is not a hard filter: an ineligible pairing is reported with a
 * flag and a dampened score so Career Services can see near-misses too.
 */

export const WEIGHTS = {
  skills: 0.34,
  semantic: 0.20,
  department: 0.12,
  academic: 0.12,
  logistics: 0.12,
  affinity: 0.10,
};

const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

/** 1. weighted skill coverage ------------------------------------------------ */
function skillScore(student, internship) {
  const reqs = internship.requirements ?? [];
  const have = student.skill_levels ?? {};
  if (!reqs.length) return { score: 0.5, detail: 'No skills listed on the posting', matched: [], missing: [] };

  let earned = 0;
  let possible = 0;
  const matched = [];
  const missing = [];

  for (const r of reqs) {
    const importance = r.required ? r.weight : r.weight * 0.4;
    const possible_level = Math.max(2, r.weight);
    const level = have[r.skill] ?? 0;
    const credit = clamp01(level / possible_level);
    earned += importance * credit;
    possible += importance;
    if (level > 0) matched.push({ skill: r.skill, student_level: level, required_level: possible_level, required: r.required, credit: Math.round(credit * 100) });
    else if (r.required) missing.push({ skill: r.skill, required_level: possible_level, weight: r.weight });
  }

  const raw = possible ? earned / possible : 0;
  // Extra credit for breadth the posting did not ask for, capped small.
  const extras = Object.keys(have).filter((s) => !reqs.some((r) => r.skill === s)).length;
  const bonus = Math.min(0.06, extras * 0.006);

  matched.sort((a, b) => b.credit - a.credit);
  missing.sort((a, b) => b.weight - a.weight);

  return {
    score: clamp01(raw + bonus),
    detail: `${matched.length}/${reqs.filter((r) => r.required).length} required skills covered` +
      (extras ? ` + ${extras} transferable skills` : ''),
    matched,
    missing,
  };
}

/** 2. semantic similarity ---------------------------------------------------- */
function semanticScore(cos, jac) {
  // Observed TF-IDF cosines for a genuinely relevant pair sit near 0.10-0.35,
  // so the raw value is rescaled rather than shown as-is.
  const scaled = clamp01(cos / 0.30) * 0.8 + clamp01(jac / 0.18) * 0.2;
  return {
    score: clamp01(scaled),
    detail: `cosine ${cos.toFixed(3)} · Jaccard ${jac.toFixed(3)}`,
    cosine: Number(cos.toFixed(4)),
    jaccard: Number(jac.toFixed(4)),
  };
}

/** 3. department eligibility ------------------------------------------------ */
function departmentScore(student, internship) {
  const codes = internship.department_codes ?? [];
  if (!codes.length) return { score: 0.6, detail: 'Open to all departments', eligible: true };
  const eligible = codes.includes(student.department_code);
  return {
    score: eligible ? 1 : 0,
    eligible,
    detail: eligible
      ? `${student.department} is on the posting's eligible-department list`
      : `${student.department} is not listed; posting targets ${codes.join(', ')}`,
  };
}

/** 4. academic fit ---------------------------------------------------------- */
function academicScore(student, internship) {
  const minYear = internship.min_year ?? 3;
  const minGpa = Number(internship.min_gpa ?? 0);
  const gpa = student.gpa == null ? null : Number(student.gpa);

  const yearScore = student.year_of_study >= minYear ? 1 : clamp01(0.4 + 0.3 * (student.year_of_study - (minYear - 2)));
  let gpaScore = 0.7;
  if (gpa != null && minGpa > 0) gpaScore = gpa >= minGpa ? 1 : clamp01(0.35 + (gpa / minGpa) * 0.55);
  else if (gpa != null) gpaScore = clamp01(0.5 + gpa / 8);

  const levelBonus = internship.level === 'beginner' ? 0.06 : internship.level === 'advanced' ? -0.04 : 0;
  return {
    score: clamp01(yearScore * 0.6 + gpaScore * 0.4 + levelBonus),
    detail: `Year ${student.year_of_study} vs minimum ${minYear}${minGpa ? `; GPA ${gpa ?? 'n/a'} vs minimum ${minGpa}` : ''}`,
    year_ok: student.year_of_study >= minYear,
    gpa_ok: gpa == null || gpa >= minGpa,
  };
}

/** 5. logistics ------------------------------------------------------------- */
function logisticsScore(student, internship) {
  const pref = student.preferred_format ?? 'flexible';
  const want = internship.format;
  const formatScore = pref === 'flexible' || pref === want ? 1 : (pref === 'hybrid' || want === 'hybrid' ? 0.75 : 0.4);

  const sameCity = !internship.city || !student.city ? 0.8 : internship.city.toLowerCase() === student.city.toLowerCase() ? 1 : 0.45;
  const remoteForgiving = want === 'remote' || pref === 'remote' ? 0.1 : 0;

  const need = internship.hours_per_week ?? 20;
  const avail = student.availability_hours ?? need;
  const hoursScore = need <= 0 ? 1 : clamp01(Math.min(1, avail / need) * (avail >= need ? 1 : 0.75) + (avail >= need ? 0.1 : 0));

  return {
    score: clamp01(formatScore * 0.45 + (sameCity + remoteForgiving) * 0.28 + hoursScore * 0.27),
    detail: `${pref} preference vs ${want} posting · ${student.city ?? 'location unspecified'} vs ${internship.city ?? 'unspecified'} · ${avail}h available vs ${need}h required`,
  };
}

/** 6. topical affinity ------------------------------------------------------ */
function affinityScore(student, internship) {
  const studentTerms = new Set(
    [...(student.interests ?? []), ...(student.target_roles ?? [])]
      .join(' ')
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((t) => t.length > 2)
  );
  const postingTerms = new Set(
    [...(internship.topics ?? []), ...(internship.responsibilities ?? []), internship.title ?? '']
      .join(' ')
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((t) => t.length > 2)
  );
  let hits = 0;
  const shared = [];
  for (const t of studentTerms) if (postingTerms.has(t)) { hits += 1; shared.push(t); }
  const score = studentTerms.size === 0 ? 0.45 : clamp01(hits / Math.min(6, studentTerms.size));
  return { score, detail: hits ? `${hits} shared interest terms: ${shared.slice(0, 6).join(', ')}` : 'No overlap between stated interests and the role', shared: shared.slice(0, 8) };
}

function label(key) {
  return {
    skills: 'Skill compatibility',
    semantic: 'Semantic similarity (TF-IDF cosine)',
    department: 'Department eligibility',
    academic: 'Academic criteria',
    logistics: 'Work format & availability',
    affinity: 'Interest alignment',
  }[key];
}

/**
 * Scores one student against one internship.
 * Both arguments are plain objects produced by the data layer.
 */
export function scoreMatch(student, internship, vectors = {}) {
  const components = {
    skills: skillScore(student, internship),
    semantic: semanticScore(vectors.cosine ?? 0, vectors.jaccard ?? 0),
    department: departmentScore(student, internship),
    academic: academicScore(student, internship),
    logistics: logisticsScore(student, internship),
    affinity: affinityScore(student, internship),
  };

  let total = 0;
  const breakdown = [];
  for (const [key, comp] of Object.entries(components)) {
    const weighted = WEIGHTS[key] * comp.score;
    total += weighted;
    breakdown.push({
      key,
      label: label(key),
      weight: WEIGHTS[key],
      score: Math.round(comp.score * 100),
      weighted: Math.round(weighted * 100),
      detail: comp.detail,
    });
  }

  const flags = [];
  if (!components.department.eligible && components.department.eligible !== undefined) flags.push('department_ineligible');
  if (!components.academic.year_ok) flags.push('below_min_year');
  if (!components.academic.gpa_ok) flags.push('below_min_gpa');
  const dampened = flags.includes('department_ineligible') ? total * 0.55 : total;

  const skills = components.skills;
  const reasons = [];
  if (skills.matched?.length) {
    const top = skills.matched.slice(0, 3).map((m) => `${m.skill} (you ${m.student_level}/5 vs ${m.required_level}/5 needed)`);
    reasons.push(`Covers required skills: ${top.join('; ')}`);
  }
  if (components.department.eligible) reasons.push(components.department.detail);
  if (components.affinity.shared?.length) reasons.push(`Interests match the role: ${components.affinity.shared.slice(0, 3).join(', ')}`);
  if ((components.semantic.cosine ?? 0) > 0.12) reasons.push(`CV wording is close to the posting (cosine ${components.semantic.cosine})`);
  if (components.academic.year_ok && (components.academic.gpa_ok ?? true)) reasons.push('Meets the year and GPA criteria');

  const gaps = (skills.missing ?? []).slice(0, 4).map((m) => `Missing ${m.skill} (posting wants ${m.required_level}/5)`);
  if (!components.academic.year_ok) gaps.push(`Needs year ${internship.min_year}+, you are year ${student.year_of_study}`);
  if (!components.academic.gpa_ok) gaps.push(`Needs GPA ${internship.min_gpa}+, yours is ${student.gpa ?? 'unrecorded'}`);

  return {
    score: Math.round(clamp01(dampened) * 1000) / 10,
    components,
    breakdown,
    reasons,
    gaps,
    flags,
    eligible: !flags.includes('department_ineligible'),
  };
}

/** Ranking helper shared by student recommendations and employer applicant lists. */
export function rank(pairs, { limit = 50 } = {}) {
  return [...pairs].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, limit);
}

/** Precision@k / recall@k / MAP against the hand-labelled evaluation set. */
export function evaluateRanking(rankedLists, labels) {
  const K = [1, 3, 5, 10];
  const out = { ks: K.map((k) => ({ k, precision: 0, recall: 0 })), mean_avg_precision: 0, cases: [], total_labels: labels.length };

  const byInternship = new Map();
  for (const [key, isRelevant] of labels) byInternship.set(key[0], [...(byInternship.get(key[0]) ?? []), { student_id: key[1], isRelevant }]);

  let apSum = 0;
  let scored = 0;

  for (const [internshipId, list] of rankedLists) {
    const truth = byInternship.get(internshipId);
    if (!truth) continue;
    const relevant = new Set(truth.filter((t) => t.isRelevant).map((t) => t.student_id));
    if (!relevant.size) continue;
    scored += 1;

    let hits = 0;
    let precisionSum = 0;
    list.forEach((item, idx) => {
      if (relevant.has(item.student_id)) {
        hits += 1;
        precisionSum += hits / (idx + 1);
      }
    });
    const ap = hits ? precisionSum / Math.min(relevant.size, list.length) : 0;
    apSum += ap;

    const perK = K.map((k) => {
      const top = list.slice(0, k);
      const th = top.filter((t) => relevant.has(t.student_id)).length;
      return { k, precision: th / Math.min(k, Math.max(1, top.length)), recall: th / relevant.size };
    });

    for (let i = 0; i < K.length; i += 1) {
      out.ks[i].precision += perK[i].precision;
      out.ks[i].recall += perK[i].recall;
    }
    out.cases.push({ internship_id: Number(internshipId), relevant_count: relevant.size, avg_precision: Math.round(ap * 1000) / 1000, top: perK[2].precision });
  }

  out.ranked_internships = scored;
  out.ks = out.ks.map((r) => ({ k: r.k, precision: scored ? Math.round((r.precision / scored) * 1000) / 10 : 0, recall: scored ? Math.round((r.recall / scored) * 1000) / 10 : 0 }));
  out.mean_avg_precision = scored ? Math.round((apSum / scored) * 1000) / 1000 : 0;
  return out;
}
