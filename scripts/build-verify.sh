#!/usr/bin/env bash
# scripts/build-verify.sh
#
# Fixed, non-negotiable verification sequence for the build-verify agent.
# This script exists because OpenCode 1.18.5's permission.bash allowlist
# does not reliably restrict which commands an agent can run when any
# "deny" pattern is present in the same block (a catch-all "*": deny
# causes the bash tool to be dropped from the schema entirely, and
# without it, allow-only patterns provide no real enforcement).
#
# Real enforcement therefore lives HERE: build-verify's frontmatter only
# needs enough bash access to invoke this single script. It has no reason
# to run any other command, because this script is the only thing its
# task prompts ever ask it to run.
#
# Exit code is the single source of truth for orchestrator's pass/fail
# decision. 0 = pass, non-zero = fail (see the exit codes below).

set -uo pipefail

FAILED=0
SUMMARY=()

echo "=== 1/3: Typecheck (tsc --noEmit) ==="
if npx tsc --noEmit; then
  SUMMARY+=("Typecheck: PASS")
else
  SUMMARY+=("Typecheck: FAIL")
  FAILED=1
fi

echo ""
echo "=== 2/3: Lint (npm run lint) ==="
if npm run lint; then
  SUMMARY+=("Lint: PASS")
else
  SUMMARY+=("Lint: FAIL")
  FAILED=1
fi

echo ""
echo "=== 3/3: Tests (npm run test -- --ci) ==="
if npm run test -- --ci; then
  SUMMARY+=("Tests: PASS")
else
  SUMMARY+=("Tests: FAIL")
  FAILED=1
fi

echo ""
echo "=== Build Verification Summary ==="
for line in "${SUMMARY[@]}"; do
  echo "- $line"
done

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "RESULT: FAIL"
  exit 1
else
  echo ""
  echo "RESULT: PASS"
  exit 0
fi