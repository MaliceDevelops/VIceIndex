# Phase 1 — Discovery report

**Game build:** Grand Theft Auto VI, Xbox Series ("Scarlett"), package version **1.0.2.1** (from `MicrosoftGame.Config` / `appxmanifest.xml`)
**GAME_DIR:** local game folder (path set in `.env`) — 108 files, ~208.5 GiB
**Date:** 2026-11-24 · **Access:** read-only. Nothing was written to GAME_DIR, and nothing was extracted to disk. All decompression happened in memory.

> Confidence labels: **high** = verified directly (decoded and cross-checked). **medium** = consistent evidence, not fully proven. **low** = inference or guess; treat as unknown.

---

## TL;DR

1. **Archives are `RPF9`**, a new version (GTA V used RPF7, RDR2 RPF8). **The table of contents (TOC) is encrypted, but the file data is not.** It is plain zlib, so files can be read by finding and decompressing zlib streams without decrypting anything. What we lose is **file names and paths**. Files have to be identified by their content. *(high)*
2. **Large files are stored as consecutive 64 KB zlib chunks.** Joining consecutive chunks rebuilds them. Every XML file rebuilt this way in `common.rpf` closed its root tag correctly. *(high for XML, medium for binary)*
3. Four inner formats are readable today:
   - **Plain XML** (`common.rpf`, ~110 root types)
   - **RBF0** (self-describing binary with field names in clear)
   - **Text tables** (hash → string, keys are standard Rockstar `joaat` hashes, 13 languages)
   - **PSO (`PSIN`) without an embedded schema**: field names are *not* in the files.
4. **None of the GTA V hint field names appear as readable text anywhere scanned:** not `fInitialDriveMaxFlatVel`, not `CWeaponInfo`/`TimeBetweenShots`, nothing. Their 32-bit hashes don't appear either, beyond random-collision levels. *(high for readable text; the hash result is inconclusive for PSO, see Blockers)*
5. **There are better-than-hinted vehicle numbers in readable form.** `CVehiclePerformanceMaps` gives per-vehicle top speed, 0–20/0–60, 60–0 braking, turn radius and lateral g. `CVehicleBaseRatingsAndEstimatesMap` gives road/off-road speed, handling, acceleration, brake and strength ratings, plus quarter-mile estimates. That covers **~285 vehicles** as `source: file` numbers, with no derivation from handling needed. *(high that values are in the file; units unconfirmed, see §5)*
6. **Display names will join.** 274 of 286 vehicle model keys resolve to a label in every language's text table. *(high)*
7. **Raw weapon stats are not located yet.** The weapon info-panel UI data (RBF0) holds **literal values**:
   - damage, accuracy, handling and range bars on what looks like a 0–10 scale
   - **magazine size** as an integer (assault rifle 30, revolvers 5–6)
   - fire style and caliber as text labels

   Raw per-shot damage and fire delay are not located. *(medium for the panel values, low for raw stats)*
8. **The game executable `game_scarlett_master.exe` is referenced by the manifest but is not in the folder.** In past RAGE titles the PSO schemas lived in the executable, so the PSO data (including what looks like the per-class vehicle definition files) can't be decoded with real field names from this folder alone. *(medium)*

---

## 1. File inventory by type

| Ext | Count | Size | Format (magic) | Readable? | What it holds | Relevant? |
|---|---:|---:|---|---|---|---|
| `.rpf` | 22 | 150.2 GiB | **RPF9** (`39 46 50 52` = "9FPR") | TOC **encrypted**; payload **zlib, readable** | Everything: data, scripts, maps, audio, anims | **Yes:** `common.rpf`, `data.rpf` (see §2) |
| `.ttpf` | 57 | 57.9 GiB | **RDS5** ("TTDB" texture-streaming packs) | Index plain; payload zlib-compressed texture blocks | Streamed textures: terrain, maps, peds/tattoos, props, vehicles, weapons/liveries, UI | **No** (images; never used) |
| `.xvd` | 1 | 332 MiB | `msft-xvd` @0x200 | Encrypted/signed (Microsoft) | `gameos.xvd`: the Xbox Game OS image, not game data | No |
| `.dll` | 16 | 4.6 MiB | PE | Readable | Third-party runtime: MSVC CRT, AMD FidelityFX upscaler, RAD Bink 2, XCurl, libHttpClient, Xbox BVH builder | No |
| `.png` | 5 | 2.9 MiB | PNG | Readable | Store logos/splash (**game art: never use**) | No |
| `.bin` | 2 | 0.8 MiB | `Catalog000.bin`: PE64 with one high-entropy section; `microsoft_gameconfig.bin`: Windows registry hive (`regf`) | Catalog opaque; hive readable | Xbox package catalog; binary copy of the game config | No |
| `.xml` | 2 | 17 KiB | XML | Readable | `appxmanifest.xml` (package identity, version), `layout_*.xml` (packaging chunk layout) | **Yes, for `_meta.json`** (version 1.0.2.1) |
| `.config` | 1 | 2.5 KiB | XML | Readable | `MicrosoftGame.Config`: TitleId `7952987A`, version `1.0.2.1`, exe name | **Yes, for `_meta.json`** |
| `.pri` | 1 | 1.1 KiB | `mrm_pri2` | Readable | Windows resource index | No |
| `.alignmentchunk` | 1 | 1 B | — | — | Packaging padding | No |

**Missing on purpose or by accident:** `game_scarlett_master.exe` (named in `MicrosoftGame.Config`, `appxmanifest.xml` and `layout_*.xml`). Also `data/lang/<language>_final.rpf`: `common.rpf`'s content manifest lists 13 of these, but there are no such top-level files. The text tables were found inside `data.rpf`, so these are probably nested archives there *(medium)*.

---

## 2. RPF archives, one by one

Header fields read for every archive (see §3). "Payload" = what decompressing the zlib streams showed. Coverage = how much of the file was actually scanned.

| Archive | Size | Entries¹ | Key tag¹ | Payload contents | Coverage | Relevance |
|---|---:|---:|---|---|---:|---|
| `common.rpf` | 6.3 MiB | 418 | `da72573e` | **318 plain XML files** (+ continuation chunks): game config/tuning (§5) | 100 % | **Key archive** |
| `data.rpf` | 459 MiB | 699 | `d5c19f6b` | 2,281 PSO · 1,263 RBF0 (UI screens, info panels, subtitles) · **text tables** (13 languages) · 87 Scaleform `GFX` · RAGE resources · 41 nested RPF9 | 100 % | **Key archive** |
| `script.rpf` | 4.2 MiB | 2 | `c0a92754` | 1,012 PSO-wrapped blobs, no readable strings | 100 % | Scripts. Opaque (mission payouts/prices would likely be here) |
| `pack/story000/story000_script.rpf` | 74 MiB | 4 | `c0a92754` | 2,309 PSO-wrapped blobs, no readable strings | 100 % | Story scripts. Opaque |
| `packs.rpf` | 4.5 GiB | 172 | `d98004d5` | Mostly resources; 101 PSO; 1 RBF0 | ~17 % | Unknown; worth a full scan |
| `pack/story000/story000.rpf` | 18.6 GiB | 763 | `d5c19f6b` | Mostly resources (map/model data), nested RPF9 | ~4 % | Unknown; worth a full scan |
| `levels.rpf` | 70.9 GiB | 2,078 | `d98004d5` | Map/world resources; 35 PSO in sample | ~1 % | Probable home of placements/coordinates *(low)* |
| `pack/core_restofworld/core_restofworld.rpf` | 1.2 GiB | 39 | `d5c19f6b` | Nested RPF9, resources, 6 PSO, 3 RBF0 | 100 % | Low |
| `pack/story000_restofworld/…rpf` | 189 MiB | 39 | `d5c19f6b` | Resources, 3 PSO | 100 % | Low |
| `pack/shared_minigame000/…rpf` | 773 MiB | 68 | `d5c19f6b` | Resources, 73 PSO, 2 XML | 100 % | Minigames; low |
| `pack/core_restofworld001/…rpf` | 773 KiB | 6 | `d98004d5` | Resources | 100 % | No |
| `anim.rpf` | 4.1 GiB | 265 | `d98004d5` | Animation resources | ~18 % | No |
| `audio.rpf` | 26.6 GiB | 103 | `c0a92754` | Audio banks (`RSC8`), readable sound names (`AMB_STREAM_*`, `audio:/sfx/…`) | ~3 % | Maybe radio metadata *(low)* |
| `movies.rpf` | 8.2 GiB | 515 | `da72573e` | Bink 2 video; not zlib | ~9 % | No |
| `navmeshes.rpf` | 6.2 GiB | 29 | `d98004d5` | Navmesh resources | ~12 % | No |
| `shaders.rpf` | 393 MiB | 3 | `da72573e` | Shader blobs (readable shader names) | 100 % | No |
| `textures.rpf` | 184 MiB | 22 | `d5c19f6b` | Texture resources | 100 % | No |
| `pack/core_bvh4/core_bvh4.rpf` | 7.7 GiB | 1,286 | `d98004d5` | Ray-tracing BVH resources | ~10 % | No |
| `pack/shared_minigame000_bvh4/…rpf` | 59 MiB | 13 | `d98004d5` | BVH | 100 % | No |
| `pack/story000_bvh4/story000_bvh4.rpf` | 5.5 KiB | 4 | `da72573e` | Small XML | 100 % | No |
| `pack/core_licenses/core_licenses_data.rpf` | 13 KiB | 4 | `d98004d5` | XML (licences) | 100 % | No |
| `appdata0.rpf` | 8.7 KiB | 2 | `da72573e` | Payload high-entropy, **not** zlib, so probably encrypted | 100 % | Unknown, tiny |

¹ Field meanings are inferred; see §3.

### `.ttpf` (RDS5) packs by folder

| Folder | Files | Size |
|---|---:|---:|
| terrain | 12 | 24.2 GiB |
| maps | 10 | 14.1 GiB |
| props | 6 | 5.7 GiB |
| peds (incl. `decorations_*`) | 10 | 5.6 GiB |
| interiors | 4 | 3.3 GiB |
| weapons (incl. `weapon_liveries`) | 2 | 2.0 GiB |
| vehicles | 3 | 1.8 GiB |
| ui | 4 | 0.8 GiB |
| vfx · lighting · graphics · `textures_loose` | 6 | 0.4 GiB |

11 of the 57 live under `pack/*/data/ttdb/`. These are all texture data (BCn-looking blocks after zlib). **Out of scope:** no game art.

---

## 3. Container formats

### RPF9 header (first 0x30 bytes, plain)

| Offset | Type | Observed | Meaning | Confidence |
|---|---|---|---|---|
| 0x00 | char[4] | `9FPR` | Magic "RPF9" (little-endian) | high |
| 0x04 | u32 | e.g. `0x11060` | Offset where file data starts | high (zlib starts at this offset in `story000_bvh4`) |
| 0x08 | u32 | e.g. `0xF510` | Size of something in the TOC | low |
| 0x0C | u32 | e.g. `0x5870` | Size of something in the TOC (names?) | low |
| 0x10 | u64 | random-looking | Per-archive ID/hash | low |
| 0x18 | u32,u32 | `0x47A00`, `0x150` (same in all 22) | Constants (version/platform?) | low |
| 0x20 | u16,u16 | `3..7`, `1` | Unknown | low |
| 0x24 | u32 | 2 … 2,078 | Entry count | medium |
| 0x28 | u32 | one of 4 values | **Key selector**: only `d98004d5`, `da72573e`, `d5c19f6b`, `c0a92754` occur | medium |
| 0x2C | u32 | `0x00090F0X` | Unknown | low |

- **TOC (0x40 → data start) is encrypted.** Entropy is ~7.99 bits/byte, and no strings are present. Two different archives with the same key tag begin with *identical* ciphertext, so the encryption is deterministic per key, like ECB mode or a fixed IV *(medium)*. We have not tried to decrypt it, and doing so isn't needed to read the data.
- **Payload is plain zlib** (`78 DA` / `78 9C` / `78 01`), mostly in 64 KB output chunks. The exceptions are `movies.rpf` (raw Bink) and `appdata0.rpf` (high-entropy, not zlib).
- **Nested RPF9 archives** occur inside other archives (e.g. at the data start of `core_restofworld.rpf`).

### RDS5 (`.ttpf`)
Magic `RDS5`, entry count at 0x04, then an index of packed 8-byte entries (offset/size-like), then zlib-compressed texture blocks. The index is not encrypted. *(medium; not explored further because it's out of scope)*

---

## 4. Inner formats found after decompression

| Format | Where | Readable? | Notes | Confidence |
|---|---|---|---|---|
| **XML** (`.meta`) | `common.rpf` (318 files), a few in packs | **Yes, fully** | Classic RAGE meta XML with `<Item key=…>` and `value="…"` attributes. Large files span several chunks and join cleanly. | high |
| **RBF0** | `data.rpf` (1,263), a few elsewhere | **Yes**: struct and field names are stored as strings, and values are typed (e.g. float64 meter values) | Mostly UI: `rage__fwuiPrefab`, `UIScreen`, info panels, `CMovieSubtitleContainer`, a couple of tunables. RDR2 also used this format. | high |
| **Text tables** | `data.rpf`: 12,791 tables (one ~36k-label global table per language plus thousands of small mission tables) | **Yes**: hash-keyed entries pointing to UTF-8 strings | Keys are **joaat(label)**, stored little-endian. Format fully decoded (see [`lib/textTable.ts`](lib/textTable.ts)), and all 12,791 tables parse. Hash slots of kind 1 are direct; some languages (e.g. Italian, Russian) also use another slot kind that isn't understood yet, so those slots are skipped rather than guessed. **English has none of them.** English is identified by content (the global table that is 98% ASCII). | high |
| **PSO** (`PSIN` … `CHKS`) | `data.rpf` (2,281), scripts (3,300+), packs | **Structure only** | **No `PSCH` (schema) or `PMAP` section.** The header is a table of `(struct-name hash, size)` blocks padded with `0xAA`. Field names are not stored anywhere in the file. | high (that the schema is absent) |
| **RAGE resources** | All large archives | Partly (pointer-based, base `0x50000000`) | Maps, models, navmesh, audio (`RSC8`), text tables. | medium |
| **Scaleform GFX** | `data.rpf` (87) | n/a | UI movies | high |
| **Bink 2** | `movies.rpf` | n/a | Video | high |

---

## 5. Mapped against CLAUDE.md categories

Field names below are the **actual names found** in the files.

### 1. Vehicles: handling
| Found | Where | Format | Records | Confidence |
|---|---|---|---:|---|
| **`CVehiclePerformanceMaps`**: `topSpeed`, `accelZeroTwenty`, `accelZeroSixty`, `brakingSixtyZero`, `turnRadius`, `maxGforceLateral`, `maxGforceSteering`, `idlePitchAngle`, `buoyancyOffsetZ`, `takeOffSpeed` | `common.rpf` | XML | 251 + 34 (two files; the second appears to be boats) | high: values are present. **Units unconfirmed:** m/s fits a bus (`airbus` 26.5 ≈ 95 km/h) but gives ~198 km/h for `blade500` (in the boat group), which seems high. Times look like seconds. **`0.000000` appears where a metric doesn't apply** (e.g. a bus's 0–60), so it must become `null`, not 0. |
| **`CVehicleBaseRatingsAndEstimatesMap`**: `estimatesRoad`/`estimatesOffroad` {`fTopSpeed`, `fCornerSpeed`, `fAccelerationTime`, `fBrakingTime`, `fStandingQuarterTime`, `fStandingQuarterSpeed`, `fAvgLatTraction`}; `ratingsRoad`/`ratingsOffroad` {`fOverallRating`, `fSpeedRating`, `fHandlingRating`, `fAccelerationRating`, `fBrakesRating`}; `fStrengthRating` | `common.rpf` | XML | 252 | high for presence; **meaning medium** (rating scale unknown; the literal `inf` = not measured, so `null`) |
| **`CTyreDataSet`**: road/off-road `fPeakSlipAngle`, `fAdhesionLimitAngle`, `fLateralFrictionMult`, `fPeakSlipRatio`, `fAdhesionLimitRatio`, `fLongitudinalFrictionMult`, `fPeakForceCoefficient`, `fSlidingForceCoefficient`; penalties `fMaterialTractionLoss`, `fMaterialRollingDragGain` | `common.rpf` | XML | 40 tyre types | high |
| **Per-class vehicle definition files** (boats, off-road, sports/super, bikes, utility, trucks, vans), each referencing 8–40 vehicle model hashes, plus one resource referencing 280 vehicles | `data.rpf` around offset `0x1c066000–0x1c130000` and `0x1c36f440` | PSO (schema-less) and a resource | ~13 files | **medium** that these are the `vehicles.meta`/`handling.meta` equivalents; **field meanings unknown** |
| GTA V `handling.meta` fields (`fMass`, `fInitialDriveMaxFlatVel`, `fDriveBiasFront`, `fBrakeForce`, `fTractionCurveMax`, `fWeaponDamageMult`, `strHandlingFlags`, …) | **not found** as readable text in any archive | — | — | high (for readable formats) |

### 2. Vehicles: identity
| Found | Where | Confidence |
|---|---|---|
| Model keys (e.g. `zorrusso`, `dominatorclassic`, `airbus`): the `key` in the maps above | `common.rpf` XML | high |
| **Display names**: label = joaat(model name), and 274/286 resolve in every language | `data.rpf` text tables | high |
| **Vehicle info panel** (RBF0): `VEHICLESPEC_<X>_BASE_SPEC`, racing class, secondary class (e.g. `…_VAL_BIKE`), era (`PROG_VEHICLES_ERA_2010_CURRENT`), brand logo (manufacturer), mod-shop specialist, unlock type (`uiUnlockEvaluatorDiscoverable`), unique preset vehicles (`vehiclepreset_*`) | `data.rpf` RBF0 | medium |
| **In-game stat bars** `SPEED`, `ACCELERATION`, `ASPHALT_HANDLING`, `OFFROAD_HANDLING`, `STRENGTH` as literal float64 values (e.g. 3.5, 4.3, 6.7, apparently on a 0–10 scale). `TOP_SPEED` here is bound to the player's own `FastestSpeed` stat, not a spec value. | `data.rpf` RBF0 | medium |
| Spawn info: data file types `VEHICLEGEN_OVERVIEW_FILE`, `CAR_PARKS_FILE`, `POPSCHED_FILE`, `CParkingSplines`, `CVehiclePoints` (32 files) are referenced | `common.rpf` manifest | low (not inspected) |
| Seats, vehicle type (car/bike/boat…), mod-kit % upgrades, paint/livery counts | **not found** yet | — |

### 3. Vehicles: economy
**Not found.** No prices in any readable file. Likely in scripts (opaque) or PSO. *(low)*

### 4. Weapons
| Found | Where | Confidence |
|---|---|---|
| **Weapon info panel** (RBF0): `PROG_WEAPONS_DAMAGE`, `RANGE`, `FIRING_RATE`, `ACCURACY`, `HANDLING`, `MAGAZINE`, `CALIBER`; fire style (semi, full auto, 3-round, pump, break, bolt); manufacturers (Hawk & Little, Vom Feuer, Shrewsbury, Girardi, Wortham, Scorpio, Hillinger, Fortune, Fairview, Duke, Deever, ADB, Zhangwu, Schlamm, Kozlov, Klose, Goodwin, Mason, BZI); 127 `PROG_WEAPONS_UNIQUE_*` items | `data.rpf` RBF0 + text | medium (labels); **low** (whether the meters hold literal values, as the vehicle ones do; not checked) |
| Loadouts → `WEAPONSPEC_*` IDs (e.g. `WEAPONSPEC_REVOLVER_MAGNUM_DEFAULT`), 1,090 loadout names | `common.rpf` `CPedInventoryLoadOutManager` | high |
| Ammo types (`AMMO_PISTOL`, `AMMO_RIFLE`, `AMMO_HVYRIFLE`, `AMMO_GPMG`, `AMMO_LAUNCHED_SPEAR`, …) and per-ammo damage rules | `common.rpf` `CDamageDataManager` (5 files) | high |
| AI accuracy tuning | `common.rpf` `CPedAccuracyManager` | high |
| Raw per-shot `Damage`, `TimeBetweenShots`, `ClipSize`, reload, range, fall-off, headshot multiplier | **not found** (probably schema-less PSO) | low |

### 5. Player and combat baselines
| Found | Where | Confidence |
|---|---|---|
| `sPedDamageModifiers`: `fHeadshotCritHitBonus` (0.5), `fCriticalHitDamageCoefficient` (1.4), `fGlancingBlowDamageCoefficient` (0.83), `fHeartDamageCoeff` (2.0), `fThroatDamageCoeff` (4.0), `fSpineDamageCoeff`, crit/glancing distances, … | `common.rpf` XML | high |
| `CHealthConfigInfo`: downed/bleed-out timers, melee knock-out thresholds, `WritheFromBulletDamageTheshold`, `FireVulnerability` | `common.rpf` XML | high |
| `CEnergyConfigInfos`, `CDamageDataManager` modifiers (melee, blocking, animals) | `common.rpf` XML | high |
| Player progression stats in the UI (e.g. `CharLucia`, `NumLevelUps`, `PROG_STAT_L_WELLB_*` well-being stats) | `data.rpf` RBF0 | medium |
| Player max health / armour tier values | **not found** yet | — |

### 6. Collectibles and locations
| Found | Where | Confidence |
|---|---|---|
| Collectible families in the progression UI: sports trading cards (baseball, basketball, football, soccer, wrestling), photo sets (`…SPACELAUNCH`, `…SEA_CREATURE`), art (`COL_…_ART`), and more | `data.rpf` RBF0 + text | medium |
| `GameShape__Data__LocationNameLoopkup` (sic): **6,431** named locations (`CustomEntity…` → `LOCATION_*` labels, e.g. Bean Machine, Kingpin Bowling). **No coordinates in this file.** | `common.rpf` XML | high |
| Collectible prop sets `am_ld_collectables`, `container_excon_and_collectibles`, shop interiors (`am_shop_gun`, `…_clothing`, `…_tattoo`, `…_pawn`, …) | `common.rpf` manifest | high (that they're referenced) |
| **x/y/z coordinates** for collectibles, stunt jumps, stores, safehouses | **not found**. Probably in map placement resources in `levels.rpf` (only ~1 % sampled). | low |

### 7. Missions and activities
| Found | Where | Confidence |
|---|---|---|
| **`CMissions`**: **145 missions** with `UniqueMissionIndex`, `MissionId` (e.g. `INT_PROLO`, `FT_AMUCO`, `COM_KBOS_SHOP`), `Description` label (resolves in the text tables, verified), `TextureName` | `common.rpf` XML | high |
| Giver, payout, gold objectives, unlock order | **not found**. Likely in scripts, which are opaque. | low |

### 8. Properties and businesses
**Not found.** `CGarageInitDataList` exists but is empty. Shop interiors are listed, with no prices or income. *(low)*

### 9. Economy and markets
**Not found.** No stock-market or item-price data in readable files. *(low)*

### 10. World systems
| Found | Where | Confidence |
|---|---|---|
| Wildlife: `species.meta` (file referenced), `CAnimalAttackBehaviours`, `CAnimalAnimationContexts`, animal loadouts (alligator, bear, cougar, coyote, deer, …) | `common.rpf` | high (presence) |
| Fishing: `CBaitingInfo` (7 entries), fishing shop, fishing focus-mode VFX | `common.rpf` / `data.rpf` | medium |
| Wanted levels / dispatch | **not found** as such. Related AI tuning exists (`CCombatInfoMgr`, `Relationships__GroupsData`, `LostTargetSearch__Tunables`, ped behaviour flags like `CanArrest`). | low |
| Radio stations and tracks | **not found** yet. `audio.rpf` has readable sound names; the text tables probably hold station names (not searched). | low |
| TV playlists `CTVPlaylistContainer`, weather, time cycle | `common.rpf` | high (presence; low value) |

### Caution: legacy RDR2 data
Some XML in `common.rpf` looks like RDR2 carry-over: `STAGECOACH002X`/`PRISONWAGON` door locks, `CLassoDataManager`, `hrsSimTuneMgr` (horse sim). Shipped files ≠ content in the game. **Don't publish records just because they exist in a file.** Cross-check against the text tables and the UI panels, which only list content the player can reach. *(medium)*

---

## 6. Blockers and open questions

1. **No file names (encrypted TOC).** Files are identified by content: XML root element, RBF0 root struct, PSO block hashes. File boundaries come from runs of 64 KB chunks. This works for XML (every root closed correctly) but needs care for binary files. *(Decision for you: is content-based identification acceptable for Phase 2? I recommend yes. Decrypting the TOC isn't needed for any data found so far.)*
2. **PSO has no schema.** The likely vehicle/handling definitions, weapon definitions and all scripts are schema-less PSO. Their field names can't be recovered from these files, and the executable those schemas normally come from isn't in GAME_DIR. Decoding them by guessing from value ranges would conflict with CLAUDE.md's "never guess" rule unless every field is marked `confidence: "low"`. **I recommend not doing that.** Use the readable sources first.
3. **Raw weapon stats have no readable source yet.** *Checked:* the weapon info-panel RBF0 meters hold literal values (0–10 bars plus integer magazine size), so a weapons leaderboard from display ratings is possible. True per-shot damage and fire delay are still missing.
4. **Sampling gaps.** `levels.rpf` (~1 %), `story000.rpf` (~4 %), `audio.rpf` (~3 %) and `packs.rpf` (~17 %) were only sampled. A full read-only sweep for XML/RBF0/text is a few hours of disk IO.
5. **Units and scales** for the performance maps (m/s? seconds? metres?) and rating scales (0–10?) need one human in-game spot check per field before we label them. Until then, the values are `source: file` with the unit marked `confidence: "medium"`.
6. **Version for `_meta.json`:** `1.0.2.1` from `MicrosoftGame.Config` `<Identity Version>`.

## 7. Suggested Phase 2 order (for your review; nothing built yet)

1. One shared reader: walk the zlib streams in an RPF9 archive, join the 64 KB chunks, and classify each file (XML / RBF0 / text / PSO). Tests use hand-made fixtures.
2. `vehicles`: `CVehiclePerformanceMaps` + `CVehicleBaseRatingsAndEstimatesMap` + `CTyreDataSet` + text-table names + RBF0 info panel (class, era, manufacturer, stat bars). This alone feeds most of the vehicle leaderboards using `source: file` values.
3. `missions` (`CMissions` + names), `combat` baselines (`sPedDamageModifiers`, `CHealthConfigInfo`), `locations` (names only, until coordinates are found).
4. Weapons: decide after the info-panel check (blocker 3).
5. Full read-only sweep of the sampled archives (blocker 4) before deciding categories 3, 6 (coordinates), 8, 9 and 10.

---

### Method (reproducibility)
All probes were small Node scripts that opened GAME_DIR read-only, read byte ranges, and decompressed zlib streams in memory. They did entropy checks, magic-byte scans, zlib carving, string grep, joaat hash matching and XML/RBF0 root listing. No game content was written to the repo. The probe scripts are in [`extract/tools/`](tools/), one purpose per file (see the first-line comment in each). Run them with `node extract/tools/<script>.mjs <archive> …`. They print to stdout only.
