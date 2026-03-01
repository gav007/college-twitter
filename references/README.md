# References (Agent-Only)

This folder contains reference material for agents.

## Precedence Order (Highest to Lowest)

1. `./AGENTS.md` (canonical agent workflow and verification protocol)
2. `./specs/*.md` (binding product and implementation specs)
3. `./CONSTRAINTS.md` (summary of non-negotiable rules derived from specs)
4. `./RUNBOOK.md` and `./TESTING.md` (how to run and verify)
5. `./references/*` (reference-only; not a spec)

If anything in `references/` conflicts with `AGENTS.md` or `specs/`, ignore the reference and follow the specs.

## What Belongs Here

- Non-binding guides that help execution (file maps, checklists, common failure modes)
- External research notes that should NOT change the requirements

## What Does Not Belong Here

- New requirements
- Alternative architectures for the current build
- Anything that would cause a second "source of truth"

## Notes

- `X_ALGO_AGENT_GUIDE.md` is intentionally reference-only and is not required to build the College Twitter app described in `specs/`.
