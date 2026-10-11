# Synkrolyn transcript drop

Place a real transcript at `evals/synkrolyn/transcript.jsonl`. Do not commit a synthetic stand-in for that file. The synthetic pair under `evals/fixtures/` is only for the behavior checks.

Write a baseline from that transcript:

```bash
node scripts/kodaelus-eval.mjs evals/synkrolyn --write-baseline
```

The command writes `evals/synkrolyn/baseline.json` beside the transcript. It records measured category shares. It does not invent shares, and it does not write the file when the directory has no transcript.

Later runs fail when a category share is greater than that baseline share times 1.10. If `baseline.json` is absent, the category gate is skipped.

`npm run eval:transcripts` scans `evals` and skips child directories named `fixtures`. A direct `node scripts/kodaelus-eval.mjs evals/fixtures` still evaluates the synthetic pair and exits non-zero while `bad.jsonl` fails its checks.

## Hypotheses

These figures are source-note estimates, not measurements. Confidence is about 50%. Do not treat them as results.

- Re-read points: a cut of 15-20 of 27.
- Search points: a cut of 10-13 of 18.
- Edit points: a cut of 7-10 of 21.
- Reasoning points: a cut of 6-10 of 26.
- Unique tokens: about 40-55% fewer.
- Re-send bill: about 250-410M tokens against 2.7M unique.
