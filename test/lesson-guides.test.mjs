import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLessonGuides, learningObjectives, keyIdeas, pageTitle } from "../scripts/lib/lessonGuides.mjs";

test("page titles read 'Lesson 2.3 ...' and never carry section ids", () => {
  assert.equal(pageTitle({ title: "S7 2.3 Change Management", page: "2.3", kind: "page", lesson: "s7-l2" }), "Lesson 2.3 Change Management");
  assert.equal(pageTitle({ title: "S7 2 Summary", kind: "summary", lesson: "s7-l2" }), "Lesson 2 summary");
});

test("learning objectives are read from bullets under their heading only", () => {
  const md = "# T\n\n## Learning Objectives\n\nLead-in:\n\n- Describe A.\n- Describe B.\n\n## Overview\n\n- not an objective";
  assert.deepEqual(learningObjectives(md), ["Describe A.", "Describe B."]);
});

test("learning objectives also work without bullets or with a singular heading", () => {
  assert.deepEqual(learningObjectives("# T\n\n## Learning Objectives\n\nDescribe A.\n\nExplain B.\n\n## Next\n"), ["Describe A.", "Explain B."]);
  assert.deepEqual(learningObjectives("# T\n\n## Learning Objective\n\nConsider the following learning objectives as you move through the lesson:\n\n- Describe C.\n"), ["Describe C."]);
});

test("key ideas come from the summary text, capped", () => {
  const md = "# S\n\n## Summary\n\n" + Array.from({ length: 12 }, (_, i) => `This is a complete summary sentence number ${i + 1} about projects.`).join(" ");
  assert.equal(keyIdeas(md).length, 8);
});

test("a lesson guide has the requested sections in order and keeps full text collapsed", () => {
  const lessons = [{ id: "s1-l1", section: "s1", number: 1, title: "Basics", sectionTitle: "Section 1" }];
  const pages = [
    { lesson: "s1-l1", kind: "intro", title: "S1 1 Introduction", md: "# I\n\n## Learning Objectives\n\n- Describe a project.\n" },
    { lesson: "s1-l1", kind: "page", page: "1.1", title: "S1 1.1 What a project is", md: "# P\n\n## Heading\n\nBody text." },
    { lesson: "s1-l1", kind: "summary", title: "S1 1 Summary", md: "# S\n\nProjects are temporary efforts with a defined start and end." },
  ];
  const questions = [{ id: "q1", lesson: "s1-l1", q: "Which is true of projects?" }, { id: "p1", lesson: "s1-l1", q: "PA", pa: {} }];
  const cards = [{ front: "Project", back: "A temporary effort.", lesson: "s1-l1" }, { front: "Loop", back: "Example: x", lesson: "s1-l1" }];
  const [g] = buildLessonGuides({ lessons, pages, questions, cards, clusters: [{ id: "c", title: "Fix", lessons: ["s1-l1"] }], courseId: "c722" });
  const order = ["Learning objectives", "Key terms", "Key ideas", "Easy to confuse", "What the quiz asked", "Full lesson text"].map((h) => g.html.indexOf(h));
  assert.ok(order.every((i, k) => i > (order[k - 1] ?? -1)), `sections out of order: ${order}`);
  assert.ok(g.html.includes("<details"));
  assert.ok(!g.html.includes("PA"), "pre-assessment questions are not listed as quiz questions");
  assert.ok(!g.html.includes("<b>Loop</b>"), "example-only cards are not key terms");
  assert.match(g.html, /Lesson 1\.1 What a project is/);
});
