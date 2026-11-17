// Builds one study guide per lesson from the lesson's page guides, its quiz questions and its flashcards.
import { marked } from "marked";

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** "S7 2.3 Change Management" -> "Lesson 2.3 Change Management"; intro/summary pages get plain names. */
export function pageTitle(meta) {
  const rest = (meta.title ?? "").replace(/^S\d+\s+\d+(?:\.\d+)?\s*/, "").trim();
  const lessonNo = (meta.lesson ?? "").match(/-l(\d+)$/)?.[1];
  const sec = (meta.lesson ?? "").match(/^s(\d+)-/)?.[1];
  switch (meta.kind) {
    case "page": return meta.page ? `Lesson ${meta.page} ${rest}`.trim() : meta.title;
    case "intro": return `Lesson ${lessonNo} introduction`;
    case "summary": return `Lesson ${lessonNo} summary`;
    case "section-intro": return `Section ${sec} introduction`;
    case "section-summary": return `Section ${sec} summary`;
    default: return meta.title;
  }
}

const sentences = (text) =>
  text.replace(/[#*_`>]|\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z"“])/).map((s) => s.trim()).filter((s) => s.length >= 30 && s.length <= 260);

/** Objectives under the "Learning Objectives" heading of an intro page (bullets, or plain sentences when there are none). */
export function learningObjectives(md) {
  const bullets = [], plain = [];
  let inside = false;
  for (const line of md.split("\n")) {
    if (/^#{2,3}\s+learning objectives?:?\s*$/i.test(line)) { inside = true; continue; }
    if (inside && /^#{1,6}\s/.test(line)) break;
    if (!inside) continue;
    if (line.startsWith("- ")) bullets.push(line.slice(2).trim());
    else if (line.trim().endsWith(".") && line.length <= 260 && !/learning objectives/i.test(line)) plain.push(line.trim());
  }
  return bullets.length ? bullets : plain;
}

/** Short bullets from the courseware's own lesson summary page. */
export function keyIdeas(md, max = 8) {
  const body = md.replace(/^#.*$/gm, "").replace(/Take a moment to think about what you learned in this lesson\.?/i, "");
  return sentences(body).slice(0, max);
}

const shorten = (t, n = 170) => (t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, "") + "…");

const demote = (md, by = 2) => md.replace(/^(#{1,6})(\s)/gm, (_, h, sp) => "#".repeat(Math.min(h.length + by, 6)) + sp);

const hasDefinition = (back) => back.split("\n").some((l) => !/^(Example|Formula):/.test(l));

export function buildLessonGuides({ lessons, pages, questions, cards, clusters = [], courseId }) {
  const guides = [];
  for (const lesson of lessons) {
    const lp = pages.filter((p) => p.lesson === lesson.id);
    if (!lp.length) continue;
    const intro = lp.find((p) => p.kind === "intro" || p.kind === "section-intro");
    const summary = lp.find((p) => p.kind === "summary" || p.kind === "section-summary");
    const objectives = intro ? learningObjectives(intro.md) : [];
    const ideas = summary ? keyIdeas(summary.md) : [];
    const terms = cards.filter((c) => c.lesson === lesson.id && hasDefinition(c.raw ?? c.back));
    const stems = questions.filter((q) => q.lesson === lesson.id && !q.pa);
    const fixits = clusters.filter((c) => (c.lessons ?? []).includes(lesson.id));
    const title = lesson.number ? `Lesson ${lesson.number}: ${lesson.title}` : `${lesson.sectionTitle ?? ""} overview`.trim();

    const parts = [`<h1>${esc(title)}</h1>`];
    if (objectives.length)
      parts.push(`<h2>Learning objectives</h2><ul>${objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>`);
    if (terms.length)
      parts.push(`<h2>Key terms</h2><ul class="terms">${terms.map((c) => `<li><b>${esc(c.front)}</b>: ${esc(shorten((c.raw ?? c.back).split("\n").find((l) => !/^(Example|Formula):/.test(l)), 220))}</li>`).join("")}</ul>`);
    if (ideas.length)
      parts.push(`<h2>Key ideas</h2><ul>${ideas.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`);
    if (fixits.length)
      parts.push(`<h2>Easy to confuse</h2><p>Look-alike terms from this lesson that tripped you up on the pre-assessment:</p><ul>${fixits.map((c) => `<li><a href="#/c/${courseId}/fix/${c.id}">${esc(c.title)}</a></li>`).join("")}</ul>`);
    if (stems.length)
      parts.push(`<h2>What the quiz asked</h2><ul class="quizlines">${stems.map((q) => `<li>${esc(shorten(q.q))}</li>`).join("")}</ul>`);
    const full = lp.map((p) => `<h3>${esc(pageTitle(p))}</h3>${marked.parse(demote(p.md.replace(/^#\s.*\n/, ""), 2))}`).join("");
    parts.push(`<details class="fulltext"><summary>Full lesson text</summary>${full}</details>`);

    guides.push({ id: lesson.id, title, objectives: [lesson.section], lesson: lesson.id, kind: "lesson", html: parts.join("") });
  }
  return guides;
}
