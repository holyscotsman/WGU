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
python3 scripts/ingest/ingest_course.py <courseware_dir> content/courses/<id>                  # PDFs -> guides, questions, cards
python3 scripts/ingest/postprocess.py content/courses/<id>                                     # clean, de-dupe, lessons, card scrub
npm run validate && npm run build && npm test
```

Needs `poppler-utils` (`pdftotext`, `pdftoppm`) and Python with Pillow and numpy (plus `openpyxl` for study-guide workbooks).

Per-course files in `content/courses/<id>/`:

| File | Purpose |
|---|---|
| `course.json` | id, code, title, objectives (one per section), `lessonGuides: true` to build one guide per lesson |
| `lessons.json` | lesson ids (`s5-l2`) and titles; `-l0` is the section overview |
| `ingest.json` | which courseware files to read; `questionOverrides` for hand-checked repairs where a page footer hides part of a question |
| `explanations.json` | hand-written explanations (marked `explanationSource: "added"`) where the courseware's is missing, thin or wrong |
| `preassessment/attemptN.json` | a pre-assessment attempt: questions with a `pa` block plus topic `clusters`; `attemptN.extra.json` holds the miss patterns |

Quiz answers come only from the selected, graded answer in the courseware printouts. Where a footer overlay hides a radio button, the answer is taken from the courseware's own explanation and the question carries `answerBasis: "explanation"`.

Not supported yet: the module-quiz layout used by D075 (inline "Correct!" labels).

## Run locally (free, no Netlify credits)

Install Node.js LTS once, get the code (GitHub Desktop clone, or Download ZIP), then run the launcher:

- macOS: double-click `start.command` (first time: right-click, Open) or run `bash start.command` in Terminal.

It checks Node, pulls updates when the folder is a git clone, installs, builds, asks for a password once (saved in `.local.env`, never committed), starts the site at http://localhost:8888 and opens Chrome. Progress is saved in the hidden `.netlify` folder; keep it when moving to a new copy.

## Deploy (Netlify)

1. Keep this GitHub repository **private**: `content/courses/*` holds courseware-derived text and Netlify builds from git.
2. Import the repo in Netlify (settings come from `netlify.toml`).
3. Set `APP_PASSWORD` and `SESSION_SECRET` (32+ random chars, e.g. `openssl rand -base64 48`).

Local: `npm install && npx netlify dev`.

## Notes

- Do not make this repository public: it contains WGU courseware text.
- Device conflicts resolve per question, card and game record by latest write.

## Deploys and credits

Netlify builds every push to the connected branch. Add `[skip ci]` to a commit message to push without triggering a build, and use **Trigger deploy** in Netlify when you want a version live. `netlify.toml` also skips builds when a push only touches docs or the launcher.

## Tests

`npm test` runs unit tests for the study logic (readiness, next up, practice and exam selection, pre-assessment mastery), the lesson guide builder and the server-side progress merge.
