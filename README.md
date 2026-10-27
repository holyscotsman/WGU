# WGU Study

Study site on Netlify: pick a course, then study guides, practice quizzes, missed-question review, timed mock exam, spaced-repetition flashcards, two games (speed round, term match) and per-objective progress. Everything sits behind one password; progress syncs through Netlify Blobs.

## How content flows

```
courseware PDFs (local only) --scripts/ingest--> content/courses/<id>/ --npm run build--> netlify/content (bundled into the `data` function)
```

Course data is **not** in the public `dist/`. The `data` function serves it only to a logged-in session.

Correct answers come only from the courseware: the ingester reads which choice was selected in a graded "Correct" quiz printout and keeps the courseware's own explanation. Questions without a graded result are skipped and reported.

### Ingest a course

```
python3 scripts/ingest/autoconfig.py <courseware_dir> content/courses/<id> <CODE> "<Title>"   # sections/lessons layout
python3 scripts/ingest/ingest_course.py <courseware_dir> content/courses/<id>
npm run validate && npm run build
```

Needs `poppler-utils` (`pdftotext`, `pdftoppm`) and Python with Pillow and numpy. `ingest.json` in each course folder lists the files; edit it to reorder or remap objectives. Replace the generated section objectives in `course.json` with official competency statements.

Not supported yet: pre-assessment exams and the module-quiz layout used by D075 (inline "Correct!" labels).

## Deploy (Netlify)

1. Make this GitHub repository **private**, then delete the three "Courseware-derived content" lines in `.gitignore` and commit `content/courses/*`. Netlify builds from git, so the content must be in the repo.
2. Import the repo in Netlify (settings come from `netlify.toml`).
3. Set `APP_PASSWORD` and `SESSION_SECRET` (32+ random chars, e.g. `openssl rand -base64 48`).

Local: `npm install && npx netlify dev`.

## Notes

- Do not publish WGU courseware in a public repo. Until the repo is private the generated content stays untracked.
- Device conflicts resolve per question, card and game record by latest write.
