# Unit spot check: vehicles (game 1.0.2.1)

Every unit-bearing vehicle stat ships as `unit: "unconfirmed"`, `confidence: "low"` until a human measures it in-game. Five vehicles of different types, with the **raw values from the files** (`common.rpf` → `CVehiclePerformanceMaps` / `CVehicleBaseRatingsAndEstimatesMap`).

**Vehicle types are inferred**, not parsed: from the display name, and from Squalo being in the watercraft performance file. Class data exists (RBF0 UI panels) but isn't extracted yet.

## What to measure (in priority order)

| # | Field | Measure in-game | Candidate readings of the raw number |
|---|---|---|---|
| 1 | `topSpeed` | Top speed on a long flat road, or open water for the boat | m/s? Airport Bus 26.47 → 95 km/h / 59 mph · Squalo 19.30 → 69 km/h / 43 mph · Zorrusso 66.74 → 240 km/h / 149 mph · FCR 1000 54.55 → 196 km/h / 122 mph · Hauler 29.26 → 105 km/h / 65 mph |
| 2 | `accelZeroSixty` | Stopwatch from standstill to 60 on the speedometer | Seconds, probably. Is the "60" mph or km/h? (Zorrusso 3.5, Hauler 35.4) |
| 3 | `brakingSixtyZero` | Full brake from 60 to a stop: note **distance and time** | Metres? (Zorrusso 18.2 → 60 ft if metres) Feet? Seconds? |
| 4 | `estimatesRoad.fStandingQuarterTime` | Stopwatch over a quarter mile (≈ 402 m) from standstill | Seconds? (Zorrusso 11.2) |
| 5 | `estimatesRoad.fStandingQuarterSpeed` | Speed at the end of that quarter mile | m/s? (Zorrusso 54.49 → 196 km/h / 122 mph) |

Not practical to measure by hand, so they stay `low` until we have another source: `turnRadius`, `maxGforce*`, `idlePitchAngle`, `buoyancyOffsetZ`, `fAvgLatTraction`, corner speed. Ratings (`ratings*`, `fStrengthRating`) are unitless; their scale is unknown (road ratings here run 143–782).

## Raw values

`0` and `inf` are shown as written in the file. In `data/vehicles.json`, `inf`, and `0` in measurement fields, become `null` ("not measured"). `—` = the vehicle has no entry in that file.

| Field (file path) | Airport Bus (`airbus`) | Squalo (`squalo`) | Zorrusso (`zorrusso`) | FCR 1000 (`fcr`) | Hauler (`hauler`) |
|---|---:|---:|---:|---:|---:|
| `topSpeed` | 26.469957 | 19.299129 | 66.737206 | 54.554569 | 29.260109 |
| `accelZeroTwenty` | 3.783 | 2.417 | 0.917 | 1.116 | 3.666 |
| `accelZeroSixty` | 0 | 0 | 3.517 | 4.533 | 35.383003 |
| `brakingSixtyZero` | 51.390209 | 0 | 18.2356 | 22.751955 | 66.003403 |
| `turnRadius` | 11.296629 | 0 | 4.411359 | 1.991432 | 6.750121 |
| `maxGforceLateral` | 0.130884 | 0 | 1.918987 | 1.688413 | 0.261062 |
| `maxGforceSteering` | 0.1 | 0 | 0.47 | 0.26 | 0.11 |
| `idlePitchAngle` | -0.000686 | 0.003292 | 0.001216 | 0.004911 | 0.011369 |
| `buoyancyOffsetZ` | 0 | 0.291778 | 0 | 0 | 0 |
| `takeOffSpeed` | 0 | 0 | 0 | 0 | 0 |
| `estimatesRoad.fTopSpeed` | 30.092571 | — | 68.202438 | 57.559963 | 29.736942 |
| `estimatesRoad.fCornerSpeed` | 26.38582 | — | 57.576946 | 51.460197 | 28.268353 |
| `estimatesRoad.fAccelerationTime` | 32.867554 | — | 2.777137 | 3.280062 | 37.264198 |
| `estimatesRoad.fBrakingTime` | 2.534799 | — | 1.411196 | 1.565156 | 2.91632 |
| `estimatesRoad.fStandingQuarterTime` | 23.139683 | — | 11.203668 | 11.692345 | 23.01886 |
| `estimatesRoad.fStandingQuarterSpeed` | 26.38582 | — | 54.491058 | 52.065117 | 25.312479 |
| `estimatesRoad.fAvgLatTraction` | 0.935332 | — | 2.105546 | 2.004536 | 1.03458 |
| `estimatesOffroad.fTopSpeed` | 12.980095 | — | 21.130226 | 12.628137 | 12.877886 |
| `estimatesOffroad.fCornerSpeed` | 13.3395 | — | 18.600622 | 12.630577 | 13.521482 |
| `estimatesOffroad.fAccelerationTime` | inf | — | 4.2818 | inf | inf |
| `estimatesOffroad.fBrakingTime` | inf | — | 2.026827 | inf | inf |
| `estimatesOffroad.fStandingQuarterTime` | 34.793941 | — | 21.519512 | 33.401276 | 34.597115 |
| `estimatesOffroad.fStandingQuarterSpeed` | 12.098617 | — | 20.96508 | 12.532269 | 12.202312 |
| `estimatesOffroad.fAvgLatTraction` | 0.596021 | — | 0.846054 | 1.408142 | 0.87303 |
| `ratingsRoad.fOverallRating` | 188.272232 | — | 749.531982 | 681.287048 | 196.712875 |
| `ratingsRoad.fSpeedRating` | 214.960358 | — | 758.079895 | 597.34375 | 211.164215 |
| `ratingsRoad.fHandlingRating` | 214.965424 | — | 710.598755 | 658.647644 | 237.411682 |
| `ratingsRoad.fAccelerationRating` | 143.253418 | — | 782.167969 | 747.125366 | 146.37883 |
| `ratingsRoad.fBrakesRating` | 414.2341 | — | 744.049683 | 670.859619 | 360.042847 |
| `ratingsOffroad.fOverallRating` | 122.91507 | — | 301.089539 | 119.47348 | 124.717766 |
| `ratingsOffroad.fSpeedRating` | 78.113159 | — | 164.883255 | 75.195564 | 77.259544 |
| `ratingsOffroad.fHandlingRating` | 252.865662 | — | 380.011108 | 236.910706 | 257.010712 |
| `ratingsOffroad.fAccelerationRating` | 26.055895 | — | 290.533142 | 34.140846 | 27.072977 |
| `ratingsOffroad.fBrakesRating` | 10 | — | 584.657776 | 10 | 10 |
| `fStrengthRating` | 0.300018 | — | 0.300018 | 0.4 | 0.300018 |

## Recording results

For each field you confirm, note the vehicle, the in-game reading and the unit. Once a unit is confirmed, the parser can set `unit` for that field and raise `confidence`. Values a human measured directly get `source: "tested"`.
