# Generated upstream snapshots

This directory contains downloaded index snapshots from `Mar-7th/StarRailRes`, kept under an explicit Git revision for reproducibility. The upstream repository is licensed under AGPL-3.0; consult its license and attribution requirements before redistributing these generated files or a hosted bundle.

The snapshot is source material only. The derived files are deliberately split by coverage:

- `basic-characters.json`: level-80 base stats plus a basic attack, marked `abstracted`;
- `direct-characters.json`: the conservative subset of direct damage, common Bounce multi-hit damage, plus simple shield/heal/cleanse/advance/stat-support and probabilistic DoT conversions; basic attacks carry the canonical 10 toughness points and broad targets are explicit (`all_enemies`/`all_allies`);
- `light-cone-catalog.json`: level-80 light-cone base stats plus the conservative subset of passive modifiers parsed from the pinned TurnBasedGameData text/parameter dump; parsed mechanics remain `abstracted`, and unparsed mechanics remain `unsupported`;
- `relic-set-catalog.json`: static two/four-piece properties, with conditional mechanics `abstracted`;
- `coverage-report.json`: per-character direct/compiled/unsupported status and upstream effect-type counts.

The pinned `turnbasedgamedata/<revision>/en/` snapshot additionally contains a
derived `break-damage.json`, a 91-entry source-pinned avatar panel/skill-ID
catalog, source-pinned enemy templates, and three explicitly selected 4.4 stage
wave definitions. Those enemy/scene definitions preserve
client IDs and source revisions, but executable enemy skills, level scaling,
phase configs, and live-mode scoring remain `abstracted` until client traces are
captured.

None of these derived files is a claim of client 1:1 parity. Runtime semantics still require controlled client observations and calibration.
