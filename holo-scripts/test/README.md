# Fight Script Examples

This folder contains ready-to-edit examples for the refactored patrol and combat flow built around `holo-scripts/FightOn.ts`.

## Files

- `fight.example.fighter.ts`
  Basic combat fleet example. Use this for fleets that only travel, fight, repair, and return.

- `fight.example.combat-miner.ts`
  Hybrid mining/combat fleet example. Use this for fleets that can fight and then continue operating without switching to another fleet.

- `fight.example.combat-miner-switcher.ts`
  Parent mining fleet example with switcher behavior. Use this when one miner fleet should trigger multiple combat fleets in response to hostiles.

- `fight.example.kamikaze.ts`
  Aggressive combat example for disposable or sacrificial fleets.

- `fight.example.fighter-switcher.ts`
  Combat switcher example for fleets that rotate or swap combat presence through external fleet assignments.

## How to use

1. Open one of the example files.
2. Replace the placeholder fleet names.
3. Replace the sector coordinates.
4. Add protected profile keys if needed.
5. For switcher examples, add combat escort fleet names or ids.
6. Run the script the same way you run the other holo test scripts in this repository.

## Notes

- The examples use `createDefaultFightOptions()` from `src/Model/Patrol`.
- You can override role behavior through `roleHooks`.
- You can override enemy prioritization through `ratingFormula`.
- You can customize switch behavior through `switcherPolicy` and `switcherConfig`.
- `CombatMinerSwitcher` now uses a switcher state machine and runtime state managed in `src/Model/Patrol`.

## Recommended starting points

- Start with `fight.example.fighter.ts` if you only need combat.
- Start with `fight.example.combat-miner.ts` if the same fleet should mine and fight.
- Start with `fight.example.combat-miner-switcher.ts` if one mining parent fleet should dispatch multiple combat fleets.
