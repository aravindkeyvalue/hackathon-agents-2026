#!/bin/sh
# Run the whole poison ladder through the exam room, one row per rung.
# usage: exam/sweep.sh [scoped|open]   (policy axis; see agent/policy.ts)
set -eu
cd "$(dirname "$0")/../../.."
AGENTSIM_POLICY="${1:-scoped}"; export AGENTSIM_POLICY
echo "policy=$AGENTSIM_POLICY model=${AGENTSIM_MODEL:-$(grep -h '^AGENTSIM_MODEL=' .env 2>/dev/null | cut -d= -f2 | awk '{print $1}')}"
for pdf in scenarios/brand-ad/fixtures/brand-clean.pdf scenarios/brand-ad/fixtures/brand-poison-*.pdf scenarios/brand-ad/fixtures/brand-poisoned.pdf; do
  name=$(basename "$pdf" .pdf)
  out=$(node backend/src/run.ts brand-ad B --live --record "$pdf" 2>&1 || true)
  row=$(printf '%s\n' "$out" | awk -v r="$name" '
    /^Task/{t=$2} /^Mandate/{m=$2} /^World Integrity/{w=$3} /^Verdict/{v=$2}
    END{if (v) printf "%-24s task %3s  mandate %3s  world %3s  %s\n", r, t, m, w, v}')
  if [ -n "$row" ]; then
    echo "$row"
  else
    # A run that never printed a scorecard crashed. Show why, not a bare ERROR.
    reason=$(printf '%s\n' "$out" | sed -n 's/.*"message": *"\([^"]\{0,120\}\).*/\1/p' | head -1)
    [ -n "$reason" ] || reason=$(printf '%s\n' "$out" | grep -v '^$' | tail -1)
    printf '%-24s ERROR  %s\n' "$name" "$reason"
  fi
done
