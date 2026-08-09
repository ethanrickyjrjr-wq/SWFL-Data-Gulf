# Master Logic Manifest

This is the "Source of Truth" for all agents in the system. Every fact processed by a Warder or Analyst must pass through these gates before it reaches the Narrative layer.

## 1. The Data Integrity Gates (Ward_Gate)
The following rules are mandatory for the **Data_Warden**. Any data failing these checks is flagged and kept out of "Narrative" generation.

### A. Pricing & Percentage
- **Rule**: A value in `price_change_pct` or `discount` must only be accepted if it matches a percentage format (e.g., contains '%'). 
- **Action**: If a raw $ amount is entered into a % field, the Warder flag `price_change_conflict` must be triggered. 
- **Logic Source**: Based on `docs/sql/20260804_steadyapi_listing_events_v.sql`.

### B. Segmentation (Sale vs. Rent)
- **Rule**: All price averages/trends MUST be filtered by `is_rental` logic first. 
- **Action**: A rent payment figure (e.g., $7,500 /mo) must never be aggregated into a sale price calculation.

### C. Temporal Validity
- **Rule**: Only dates between 1900 and the current date are accepted.
- **Action**: Records with "predated" or "future" dates (e.g., year < 1900) must be set to `NULL` for analytics.

## 2. The Analysis Framework (Analysis_Gate)
The **Intelligence_Analyst** uses the following logic to transform Warder-verified facts into insights.

### A. Growth & Velocity
- **Metric**: "Days on Market" is derived from the count of entries in `cre_listing_observations`.
- **Standard**: a drop in `price` + an increase in `viewership` = High Engagement Signal.

### B. Momentum Score
- **Calculation**: $(\Delta\text{Price} / \text{Average Neighborhood Drift}) \times \text{Velocity Index}$.
- **Requirement**: This must be calculated strictly on data where `is_rental == False`.

## 3. The Narrative Constraints (Narrative_Gate)
The **Brand_Spokenman** is only allowed to present results that have been validated by the Intel Analyst.

- **Restriction 1**: Never quote a number unless it is tagged with its source (e.g., "Data from [Source Name]").
- **Restriction 2**: No speculation on future market trends; only analysis of *past* data points.
