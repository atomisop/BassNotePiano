#!/bin/zsh
# Runs the baseline matrix one capture at a time (no parallel lanes). Usage: scripts/glass-revamp/baseline.sh <TASK> <before|after>
cd "$(dirname "$0")/../.."
T=${1:-GL-00-01}; P=${2:-before}
S="node scripts/glass-revamp/shots.mjs $T $P"
SP=(/dashboard /roadmap /practice /lessons /friends /account /billing/plans /billing/history /mail /profile /about /streak /leaderboard)
SL=(/dashboard /lessons /account /billing/plans)
AP=(/admin /admin/today /admin/payments /admin/users /admin/schedule /admin/support /admin/pricing /admin/security /admin/data /admin/activity /admin/settings /admin/messages)
G=(/ /pricing /login /register /classes /shop /terms /privacy)
eval "$S --role guest --theme dark --axe $G"
eval "$S --role guest --theme light $G"
eval "$S --role student --theme dark --axe $SP"
eval "$S --role student --theme light --axe $SL"
eval "$S --role admin --theme dark --axe $AP"
eval "$S --role student --theme dark --browser webkit --sizes 1440x900,390x844 /dashboard /lessons"
eval "$S --role guest --theme dark --browser webkit --sizes 1440x900,390x844 / /pricing /login"
eval "$S --role guest --theme dark --browser firefox --sizes 1440x900,390x844 / /pricing /login"
echo BASELINE-DONE
