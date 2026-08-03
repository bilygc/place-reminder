#!/usr/bin/env bash
# scripts/test-count-guard.sh
#
# Fails the build if the total number of Jest test cases (not files) has
# dropped compared to the committed baseline, without that drop being
# reflected in the baseline itself as part of this diff.
#
# Root cause (2026-08, ATO-8): a ticket asked dev to remove input
# validation from signIn(). dev correctly removed the guard clauses, but
# also deleted the 4 regression tests that covered them — reasoning that
# tests for removed behavior no longer applied. Nothing in the pipeline
# caught this: build-verify's test step only checks exit code (green,
# because the failing tests were gone, not fixed), the Security Gate is
# scoped to security findings only, and Impact Analysis had literally
# pre-authorized "tests must be updated/removed" without requiring
# equivalent coverage to replace what was removed.
#
# This script closes that gap structurally: a dropped test count is a
# hard fail unless a human explicitly updates the baseline file in the
# same commit, leaving an explicit, reviewable trail instead of a silent
# coverage loss.
#
# Usage: called from build-verify.sh, not run standalone in CI without
# context — relies on jest's --json output.

set -uo pipefail

BASELINE_FILE="scripts/test-count-baseline.txt"

if [ ! -f "$BASELINE_FILE" ]; then
  echo "No baseline file found at $BASELINE_FILE — creating one now."
  echo "0" > "$BASELINE_FILE"
fi

BASELINE_COUNT=$(cat "$BASELINE_FILE" | tr -d '[:space:]')

echo "Running Jest with --json to get exact test count..."
JEST_JSON_OUTPUT=$(npx jest --ci --json --silent 2>/dev/null)

if [ -z "$JEST_JSON_OUTPUT" ]; then
  echo "ERROR: Could not capture Jest JSON output. Is Jest installed and configured?"
  exit 1
fi

CURRENT_COUNT=$(echo "$JEST_JSON_OUTPUT" | node -e "
  let data = '';
  process.stdin.on('data', d => data += d);
  process.stdin.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log(parsed.numTotalTests);
    } catch (e) {
      console.error('Failed to parse Jest JSON output:', e.message);
      process.exit(1);
    }
  });
")

if [ -z "$CURRENT_COUNT" ]; then
  echo "ERROR: Could not determine current test count from Jest output."
  exit 1
fi

echo "Baseline test count: $BASELINE_COUNT"
echo "Current test count:  $CURRENT_COUNT"

if [ "$CURRENT_COUNT" -lt "$BASELINE_COUNT" ]; then
  echo ""
  echo "FAIL: Test count dropped from $BASELINE_COUNT to $CURRENT_COUNT."
  echo ""
  echo "This usually means tests were deleted, not just refactored."
  echo "If this drop is intentional (e.g. removing tests for genuinely"
  echo "removed functionality), a human must explicitly update"
  echo "$BASELINE_FILE to $CURRENT_COUNT in this same PR, with a note in"
  echo "the PR description explaining why coverage is intentionally lower."
  echo ""
  echo "dev/ux: do NOT edit $BASELINE_FILE yourself to make this pass."
  echo "That defeats the purpose of this gate. Report the drop back to"
  echo "the orchestrator instead and let a human decide."
  exit 1
fi

if [ "$CURRENT_COUNT" -gt "$BASELINE_COUNT" ]; then
  echo ""
  echo "NOTE: Test count increased ($BASELINE_COUNT -> $CURRENT_COUNT)."
  echo "This PASSES, but the baseline file was NOT auto-updated — build-verify"
  echo "is read-only by design. dev/ux must update $BASELINE_FILE to"
  echo "$CURRENT_COUNT as part of their commit when adding tests, the same"
  echo "way they'd commit any other file change. If you see this note"
  echo "repeatedly for the same PR, the baseline update was likely missed."
fi

echo "PASS: Test count guard satisfied."
exit 0