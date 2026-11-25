# CLAUDE.md — GTA 6 Datamined Stats Site

## What this project is
A fan-made, web-based companion site for Grand Theft Auto VI whose whole pitch is **real numbers pulled from the game's data files, not estimates**. Every other GTA 6 site is publishing guesses or GTA 5 figures. We publish file-derived values, label them honestly, and build "top everything" leaderboards on top of them.

Two halves:
1. `/extract` — local scripts that read my own legally owned game files and output clean JSON. **Never runs in CI, never deployed.**
2. `/web` — the public site (Next.js + TypeScript, static generation) that reads only from `/data`.

## Hard rules (do not break these, ever)
1. **Label every number honestly.** Each stat has a `source` field: `file` (raw value from data), `derived` (computed from file values with a documented formula), or `tested` (measured in-game by a human). Never present a `derived` number as `tested`.

## Workflow
### Phase 1 — Discovery (do this before writing any parser)
- Walk `GAME_DIR` read-only. Inventory file types, sizes, and which are plain text / XML / readable binary vs. encrypted/opaque.
- Write findings to `extract/DISCOVERY.md`: format, what it seems to contain, confidence level.
- GTA 6 formats may differ from GTA V. Use the GTA V field names below as **hints for what to look for**, not assumptions. Report actual field names found.
- Do not proceed to parsing until I review DISCOVERY.md.

### Phase 2 — Parsers
- One parser per category in `extract/parsers/<category>.ts` (TypeScript, Node). Pure functions: raw file → typed objects.
- Validate output with zod schemas in `extract/schemas/`. Fail loudly on unexpected shapes.
- Join display names from localization/text tables so the site shows "Pegassi Zorrusso", not `zorrusso`.
- Output to `data/<category>.json`, sorted, stable key order (clean git diffs between game patches).
- Write `data/_meta.json`: game version/patch, extraction date, record counts.

### Phase 3 — Derived stats & leaderboards
- Formulas live in `extract/derive.ts` with a comment explaining each one, and are mirrored in plain English on the site's `/methodology` page.
- Produce `data/leaderboards.json` (see Leaderboards below).

### Phase 4 — Site
- Next.js App Router, static export, TypeScript, Tailwind. Fast and SEO-first: one static page per vehicle/weapon/property at `/vehicles/[slug]`, etc., with title "[Name] Top Speed & Stats – GTA 6".
- Sortable/filterable tables, side-by-side compare (up to 4), leaderboard pages, shareable stat-card images rendered from our own design (OG images via `@vercel/og` or satori — our layout, no game art).
- JSON-LD structured data on detail pages. Sitemap + robots.
- Progress tracker for collectibles saved to localStorage (wrapped in try/catch). No accounts for v1.
- Donation link (Ko-fi) in header and footer. No paywalled content.

## Data to extract — by category
GTA V names given as hints (`handling.meta`, `vehicles.meta`, `weapons.meta`, etc.). Find the GTA 6 equivalents.

### 1. Vehicles — handling (GTA V hint: handling.meta)
| Field (GTA V name) | What it means | Used for |
|---|---|---|
| fMass | Weight (kg) | Durability, ramming |
| fInitialDragCoeff | Air drag | Top speed (real) |
| fDownforceModifier | Downforce | Cornering at speed |
| fInitialDriveMaxFlatVel | Theoretical max speed | **Top speed** (derived) |
| fInitialDriveForce | Engine power | **Acceleration** |
| nInitialDriveGears | Gear count | Acceleration curve |
| fDriveBiasFront | 0 = RWD, 1 = FWD, between = AWD | Drivetrain label |
| fDriveInertia | Rev speed | Acceleration feel |
| fClutchChangeRateScaleUpShift / DownShift | Shift speed | Acceleration |
| fBrakeForce, fBrakeBiasFront, fHandBrakeForce | Braking | **Braking** rank |
| fSteeringLock | Max steer angle | Handling |
| fTractionCurveMax / Min / Lateral | Grip | **Handling/grip** rank |
| fLowSpeedTractionLossMult | Wheelspin off the line | Launch |
| fTractionLossMult | Grip loss off-road | **Off-road** rank |
| fSuspensionForce, CompDamp, ReboundDamp, Raise | Suspension | Off-road, stability |
| fAntiRollBarForce | Body roll | Handling |
| fCollisionDamageMult, fDeformationDamageMult, fEngineDamageMult | Damage taken | **Durability** rank |
| fWeaponDamageMult | Damage from bullets | **Bulletproof-ness** |
| fPetrolTankVolume | Fuel tank | Trivia |
| nMonetaryValue | Base value | Value calcs |
| strModelFlags / strHandlingFlags | Behavior flags | Special traits (e.g. KERS, offroad abilities) |

### 2. Vehicles — identity (GTA V hint: vehicles.meta, carvariations, carcols)
- model ID, display name, manufacturer, class (super, sports, muscle, off-road, etc.), type (car/bike/boat/heli/plane), seats, real-life inspiration (manual field, we fill this ourselves).
- Spawn info: where/when it appears, population group, rarity, whether it's buyable vs. street-only vs. mission-only.
- Customization: mod kit options and upgrade effects (engine/brakes/transmission/armor % increases), paint/livery count (counts only, no images).

### 3. Vehicles — economy (GTA V hint: shop/website data)
- Purchase price, which in-game store/site sells it, sale/resale value, unlock condition.

### 4. Weapons (GTA V hint: weapons.meta)
| Field | Meaning | Used for |
|---|---|---|
| Damage | Per-shot damage | **Damage** rank |
| DamageType / FireType | Bullet, explosive, melee, etc. | Grouping |
| TimeBetweenShots | Delay between shots | **Fire rate** (RPM = 60 / TBS) |
| ClipSize, MaxAmmo | Magazine, ammo cap | Sustained fire |
| ReloadTime / AnimReloadRate | Reload speed | DPS |
| WeaponRange, LockOnRange | Range | **Range** rank |
| DamageFallOffRangeMin/Max, DamageFallOffModifier | Damage drop over distance | Damage at range |
| HeadShotDamageModifierPlayer | Headshot multiplier | **Headshot** rank |
| BulletsInBatch, BatchSpread | Pellets (shotguns) | Shotgun damage |
| AccuracySpread, RecoilShakeAmplitude | Accuracy, recoil | Accuracy rank |
| Penetration, Force | Penetration, knockback | Trivia/ranks |
| Components | Attachments and their stat modifiers | Loadout builder |
| Price / unlock | Store price, where/how unlocked | Value |

### 5. Player & combat baselines
- Player max health, armor tiers, damage modifiers, stamina, any skill/ability stats and how they scale. Needed for **time-to-kill** derivations.

### 6. Collectibles & locations
- Each collectible: category, x/y/z coordinates, region, unlock condition, reward. Also: stunt jumps, hidden items, safehouses, stores, mod shops, activities.
- Coordinates only. We plot them on **our own drawn base map**, never an extracted map image.

### 7. Missions & activities
- Mission list (story/side), giver, payout, gold/bonus objectives, unlock order, activity list.

### 8. Properties & businesses
- Price, location, garage slots, storage, income rate, upkeep, upgrade costs. → ROI and payback time.

### 9. Economy & markets
- In-game stock market: companies, base prices, volatility/behavior rules if readable. Clothing/item prices (names and prices only).

### 10. World systems (great for viral "hidden mechanics" posts)
- Wanted levels: response units per star, search times, escalation rules.
- Wildlife/fishing/hunting: species, rarity, weights, values.
- Radio: station names, track titles, artists (text only, no audio).

## Leaderboards ("Top everything")
Each leaderboard shows the top 10 + a full sortable list, states its formula, and tags every value with `source`.

**Vehicles**
- Fastest top speed (overall + per class)
- Quickest acceleration
- Best handling / grip
- Best braking
- Best off-road
- Most durable (mass + damage mults)
- Most bulletproof (fWeaponDamageMult)
- Best value (performance score ÷ price)
- Rarest street spawns
- Best per drivetrain (RWD/AWD/FWD)

**Weapons**
- Highest damage per shot
- Highest DPS (with reloads included)
- Fastest fire rate
- Fastest time-to-kill vs. full health + armor
- Longest effective range
- Best headshot multiplier
- Best accuracy / lowest recoil
- Best value

**Economy**
- Best property/business ROI
- Fastest payback time
- Highest-paying missions/activities

**Composite "performance score" (vehicles):** a normalized 0–100 per stat (top speed, accel, handling, braking) within class, averaged with weights documented on `/methodology`. Keep weights in one config file so I can tune them.

## Data schema conventions
- Every record: `id` (stable slug), `name`, `category`, `stats{}`, `source` per stat, `patch` (game version first seen), `updatedAt`.
- Units: store metric internally, display mph + km/h, kg + lb.
- Missing values are `null`, never 0 or a guess.

## How I want you to work
- Small steps. Show me the plan before big changes.
- Read-only on `GAME_DIR` always.
- When uncertain what a field means, say so and mark it `confidence: "low"` instead of guessing.
- Write tests for parsers and derived formulas (vitest) using small hand-made fixtures, **not** copies of real game files.
