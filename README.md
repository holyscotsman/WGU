# WGU Study

Static study site (guides, practice quizzes, mock exams, spaced-repetition flashcards, per-objective tracking) on Netlify. Progress syncs through a Netlify Function backed by Netlify Blobs, behind a single password.

## Adding a course

```
content/courses/<course-id>/
  course.json        # id (= folder name), code, title, exam {count, minutes, passPercent}, objectives [{id,title}]
  guides/NN-name.md  # front-matter: title, objectives (comma-separated ids)
  questions.json     # [{id, objective, q, choices[], answer: idx | [idx], explanation}]
  flashcards.json    # [{id, objective, front, back}]
```

`npm run validate` checks ids, objective references, and answer indexes. The build fails on invalid content. Delete `content/courses/example` once real courses exist.

## Deploy (Netlify)

1. Import this repo in Netlify (build settings come from `netlify.toml`).
2. Set environment variables: `APP_PASSWORD` and `SESSION_SECRET` (32+ random chars, e.g. `openssl rand -base64 48`).
3. Deploy. Blobs need no extra setup.

Local: `npm install && npx netlify dev`.

## Notes

- The site is publicly reachable, so the content itself is not protected: only progress/sync is behind the password. Keep copyrighted course material out of a public repo/site if that matters to you.
- Conflicts between devices resolve per question/card by last-write timestamp.
