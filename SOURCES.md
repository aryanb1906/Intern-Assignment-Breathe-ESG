# Sources

## SAP

- Real-world format researched: SAP ECC-style flat exports and common reporting CSV patterns.
- What I learned: teams often receive semi-structured exports with German headers, plant codes, date formatting differences, and mixed units rather than a clean API payload.
- Sample data shape: I used a CSV with fuel rows and procurement rows, including a diesel generator entry, a fleet fuel entry in gallons, a procurement spend row in USD, and a negative fuel row to exercise suspicious-row heuristics.
- What breaks in production: multilingual column names, module-specific schemas, and unclear source codes that need lookup tables before analysts can trust them.

## Utility electricity

- Real-world format researched: portal CSV exports from facility utility billing workflows.
- What I learned: billing periods do not always line up with calendar months, and meter-level fields matter because peak and off-peak usage can explain variance.
- Sample data shape: I used meter IDs, billing start/end dates, peak/off-peak kWh, tariff, and facility code. The prototype normalizes to kWh and Scope 2.
- What breaks in production: regional tariff rules, meter hierarchies, and utility-specific billing logic that a single CSV schema cannot capture fully.

## Corporate travel

- Real-world format researched: Concur/Navan-style exports that separate flights, hotels, and ground transport.
- What I learned: trips often need distance estimation from airport codes, and category drives the emission factor more than the raw spend alone.
- Sample data shape: I used flight rows with airport codes, a hotel row with nights, and a ground-transport row with explicit distance.
- What breaks in production: missing airport codes, itinerary fragmentation, rail and taxi edge cases, and the need for region-specific or vendor-specific emission factor logic.
