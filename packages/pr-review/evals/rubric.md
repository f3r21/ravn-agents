# Judge rubric: does a review finding describe the ground-truth defect?

You are grading one pair: a ground-truth defect (what a later fix PR corrected in this code) and one
finding a code reviewer wrote about the same code before that fix existed. Answer only whether the
finding identifies the same defect. You are not grading the finding's quality, tone or severity.

The file and line check has already passed: the finding points at or near the defect's lines.
Proximity alone is not a match.

## PASS (`match: true`) when all hold

1. The finding names the same faulty behaviour or the same faulty rule as the ground truth, even in
   different words. Example: ground truth "renders children only when status is success, so a
   background refetch error hides cached data"; finding "the error branch replaces loaded content
   when a refetch fails while data is cached". Same defect.
2. Acting on the finding would lead an engineer to the fix the ground truth describes, or to an
   equivalent one.

## FAIL (`match: false`) when any holds

- The finding describes a different problem on the same lines (for example, a naming issue, a
  missing test, or a different bug in the same function).
- The finding is so generic that it would apply to any code there ("consider error handling here",
  "this could be fragile").
- The finding mentions the symptom area but states the opposite cause, or says the code is fine.

## Output

Reason in two or three sentences first, then give `match`. When unsure after reasoning, answer
`false`: a match must be recognisable to the engineer who wrote the fix.
