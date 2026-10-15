#!/bin/sh
# Activates the downloaded skill collections by linking each skill into ~/.claude/skills.
# The sources are already cloned in ~/.claude/skill-sources. Safe to run again: existing names are skipped.
cd "$HOME/.claude/skill-sources" || exit 1
link() {
  src="$1"; name=$(basename "$src")
  if [ -e "$HOME/.claude/skills/$name" ]; then echo "skip (exists): $name"; return; fi
  ln -s "$PWD/$src" "$HOME/.claude/skills/$name" && echo "linked $name"
}
for f in addyosmani_agent-skills/skills/*/ vercel-labs_agent-skills/skills/*/; do
  [ -f "$f/SKILL.md" ] && link "${f%/}"
done
for n in frontend-design webapp-testing; do link "anthropics_skills/skills/$n"; done
for f in $(find mattpocock_skills/skills -name SKILL.md -not -path '*deprecated*' -not -path '*in-progress*' | xargs -n1 dirname); do link "$f"; done
for n in insecure-defaults differential-review property-based-testing mutation-testing fp-check audit-context-building code-improver sharp-edges variant-analysis; do
  p=$(find trailofbits_skills/plugins -type d -path "*/skills/$n" | head -1)
  if [ -n "$p" ]; then link "$p"; else echo "not found: $n"; fi
done
