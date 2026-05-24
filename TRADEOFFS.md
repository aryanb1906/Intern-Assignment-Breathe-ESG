# Tradeoffs

1. I did not build an async job queue. In a real ingestion pipeline that would be necessary for larger uploads, but for a four-day prototype it would add moving parts without changing the review logic.

2. I did not implement PDF OCR for utility bills. The assignment allowed a CSV export or portal scrape, and CSV is the most defensible first slice because it keeps the source shape explicit and testable.

3. I did not integrate real SAP, Concur, or utility APIs. Those integrations are environment-specific and credential-heavy, while the point of the exercise is to prove data modeling, normalization, and analyst workflow judgment.
