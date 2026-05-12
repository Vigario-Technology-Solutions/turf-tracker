# Turf Tracker — Specification

**Status:** v2 — web app target, field-tool first
**Target user:** Tyler (single grower → small multi-user household), 3-property operation, may extend to others
**Updated:** 2026-05-02

---

## Changelog from v1

- Reframed primary use mode from "desk planner with logging" → **field decision tool first**, with logging and history as the data engine that powers it
- Implementation switched from Google Sheets → **Next.js + Prisma + Better-Auth + Serwist** PWA
- Generalized `properties` + `zones` model into a unified `areas` primitive (an area = anything with sq ft and a soil test: lawn, bed, tree drip-line, etc.)
- Added "What's Next?" recommendation engine as a first-class concept, not a phase 4 polish item
- Added auth/multi-user from day 1
- Resolved open questions §10 v1 → moved to a new "Decisions" section

---

## 1. Purpose

A mobile-first PWA that answers **"what should I do right now in this area?"** for any cultivated piece of ground — lawn, bed, tree, garden — using your soil test data, your product library, and your application history to compute exact rates at the moment of decision.

**Primary mode (field tool):** standing in the backyard with a sprayer or spreader, three taps to get exact dosage with side-effect warnings and one-tap logging.

**Secondary mode (history & planning):** the log feeds the recommender — every past application + every irrigation event + the current soil test → a constantly-updated "next best action" per area. You learn from history because the system uses it to make tomorrow's decision better, not because you read dashboards.

The lens is always **"what's next?"** never "what did I do?" — even the history view exists to answer the next-action question better.

---

## 2. In scope (v1)

Ordered by priority — earlier items must land first:

1. **Field calculator** — pick area + product + target rate → exact amount of product, carrier volume, all-nutrient delivery breakdown, side-effect warnings, one-tap log
2. **Area registry** — name, sq ft, parent grouping (property), irrigation source, current soil test, application history. Universal primitive: lawn zone, vegetable bed, rose bed, individual tree (canopy drip line). No special-casing of "lawn" vs "garden"
3. **Soil test ingestion** — manual entry of MySoil-style results; auto-derive ESP/SAR/Ca:Mg, flag deficiencies/excesses, generate per-area nutrient targets
4. **Product library** — granular AND liquid forms; full guaranteed analysis (NPK + secondary + micros + Na); package size + cost; manufacturer rate; tags for hard warnings (`contains_p`, `contains_b`, `contains_na`, `acidifying`)
5. **Application math**
   - **Granular:** target lb of nutrient per 1k → product lb per 1k → total lb for the area → spreader setting hint
   - **Liquid:** target lb of nutrient per 1k → fl oz of product → fl oz per gal of carrier → tank fill instructions for the area
6. **Application log** — every application stored with full nutrient delivery snapshot, weather, applied-by user, optional photo
7. **Irrigation log** — runtime per zone → inches → gallons → Na deposited; cumulative salt-balance per area
8. **"What's Next?" recommender** — per area, surface the top 1–3 recommended actions ranked by urgency. Rules-based v1 (see §6.7)
9. **Auth + multi-user** — Better-Auth from day 1; email/password + magic link; per-area permissions (owner / contributor / viewer)
10. **PWA + offline-capable** — Serwist; field entries queue when offline and sync on reconnect

## 3. Out of scope (v1)

- Pest/disease tracking
- Mowing log (different cadence, separate tool later if needed)
- Equipment maintenance log
- Photo OCR for soil test PDF → structured data (manual entry for now; defer)
- Weather API integrations (manual ET₀ entry for now; CIMIS/NWS later)
- ML-based recommendations (rules-based until rules clearly insufficient)
- Native iOS/Android apps (PWA covers it)
- Public marketplace / sharing of products or rules between users (single-household scope)
- Multi-year graphing (deferred until ≥3 soil tests exist for the same area)

## 4. User profile & confirmed constraints

Reference: `C:\Users\tyler\.claude\projects\C--Users-tyler\memory\user_lawn_garden.md`

Hard constraints baked into v1 logic:

- **Severely sodic soil** (Na ~285 ppm, ESP est. 25–35%); **240 ppm Na tap**; whole-property R/O is cost-prohibitive
- **High soil P** (74 ppm vs 5–11 optimal) — `contains_p` is a hard warning, not a soft one
- **High soil B** (0.74 ppm) — `contains_b` is a hard warning
- **pH 6.37** — flag any acidifying product (elemental S etc.)
- **Salt influx > reclamation capacity** by ~2.7×; gypsum is *defensive maintenance only*
- **Bermudagrass at 0.5–0.75" target cut** (currently stuck at 1" rotary)
- Working agronomy vocabulary — UI shows real units, no dumbing down

These are the *current user's* constraints. The data model is generic — when another user joins (family, etc.) they bring their own soil tests and the constraints rederive.

---

## 5. Data model

### 5.1 `users` (Better-Auth managed)

Standard Better-Auth user shape. Extended with:

| Column | Type | Notes |
| --- | --- | --- |
| `display_name` | string | |
| `default_property_id` | FK nullable | What the app opens to |
| `unit_system` | enum | `imperial` (default) / `metric` |
| `currency` | enum | `USD` (default) |

### 5.2 `properties`

A grouping of areas under one address — useful for organizing the 3-house operation.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | cuid | |
| `name` | string | "Home", "Dad's house", "Rental" |
| `address` | string | Optional |
| `created_by` | FK users | |
| `notes` | text | |

### 5.3 `property_members`

Multi-user permissions per property (granular per-area can come later).

| Column | Type | Notes |
| --- | --- | --- |
| `property_id` | FK | |
| `user_id` | FK | |
| `role` | enum | `owner` / `contributor` / `viewer` |

### 5.4 `areas`

**The universal primitive.** Lawn zone, vegetable bed, rose bed, individual tree — same shape.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | cuid | |
| `property_id` | FK | |
| `name` | string | "Backyard", "Tomato bed 2", "Front orange tree" |
| `area_sq_ft` | int | Stored ONCE, never re-typed at the spreader |
| `area_type` | enum | `turf` / `bed` / `tree` / `ornamental` / `mixed` — mostly for filtering UI |
| `crop_or_species` | string | "Bermudagrass — Tifway 419", "Tomato", "Valencia orange" |
| `irrigation_source` | enum | `tap` / `well` / `mixed` / `rain` / `drip` / `none` |
| `water_na_ppm` | float | Default from property water source |
| `current_soil_test_id` | FK nullable | |
| `notes` | text | |

Optional sprinkler-specific fields if `area_type = turf`:

| Column | Type | Notes |
| --- | --- | --- |
| `precip_rate_in_per_hr` | float | Catch-cup measured or spec |
| `head_type` | enum | `rotor` / `spray` / `MP` / `drip` |

### 5.5 `soil_tests`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | cuid | |
| `area_id` | FK | A test belongs to an area, not a property — areas can have different soil |
| `test_date` | date | |
| `lab` | string | "MySoil", "UC Davis", county ext, etc. |
| `lab_report_id` | string | External ID from the lab |
| `pH` | float | |
| `n_ppm`, `p_ppm`, `k_ppm`, `s_ppm`, `ca_ppm`, `mg_ppm`, `na_ppm`, `fe_ppm`, `mn_ppm`, `zn_ppm`, `cu_ppm`, `b_ppm` | float | All nullable (different labs report different sets) |
| `om_pct` | float | Organic matter % if reported |
| `cec_meq_100g` | float | If reported |
| `notes` | text | |

Derived (computed in app, not stored):

- `esp_est`, `sar_est`, `ca_mg_meq_ratio`
- Per-nutrient `vs_optimal` — `low` / `optimal` / `high` based on a per-area-type reference table

### 5.6 `products`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | cuid | |
| `created_by` | FK users | Each user maintains their own library; can be marked `shared_within_household` |
| `brand`, `name` | string | |
| `form` | enum | `granular_pelletized` / `granular_powder` / `liquid_concentrate` / `liquid_RTU` / `water_soluble_powder` |
| `n_pct`, `p2o5_pct`, `k2o_pct` | float | Guaranteed analysis (oxide form for P, K — converted at calc time) |
| `ca_pct`, `mg_pct`, `s_pct`, `na_pct` | float | |
| `fe_pct`, `mn_pct`, `zn_pct`, `cu_pct`, `b_pct` | float | |
| `density_lb_per_gal` | float | Required for liquids |
| `pkg_size_value` + `pkg_size_unit` | float + enum (`lb` / `oz_wt` / `gal` / `fl_oz`) | |
| `pkg_cost_usd` | float | |
| `mfg_rate_value` + `mfg_rate_unit` + `mfg_rate_per` | composite | "0.5 fl oz per 1000 sq ft" |
| `tags` | string[] | Hard warnings: `contains_p`, `contains_b`, `contains_na`, `acidifying`, `pgr`, `surfactant`, `humic`, etc. |
| `notes` | text | |

Initial seed for current user (optional pre-population helper):

- Diamond K 97% gypsum
- K-Mag / Sul-Po-Mag (langbeinite)
- Simple Lawn Solutions 15-0-15 (liquid, 32 oz/gal)
- Simple Lawn Solutions seaweed + humic
- Epsom salt
- Primo Maxx (PGR)
- Hydretain (surfactant)

### 5.7 `applications`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | cuid | |
| `area_id` | FK | |
| `product_id` | FK | |
| `applied_at` | datetime | Defaults to now in the field flow |
| `applied_by` | FK users | |
| `amount_value` | float | |
| `amount_unit` | enum | `lb` / `oz_wt` / `fl_oz` / `gal` |
| `carrier_water_gal` | float nullable | For liquids |
| `target_nutrient_lb_per_1k` | float nullable | What the user was aiming for (for retrospective accuracy) |
| `weather_temp_f` | float nullable | |
| `weather_notes` | text | |
| `cost_usd_snapshot` | float | Calculated at time of entry, stored to preserve point-in-time cost |
| `delivered_n_lb`, `delivered_p_lb`, `delivered_k_lb`, `delivered_ca_lb`, `delivered_mg_lb`, `delivered_s_lb`, `delivered_fe_lb`, `delivered_mn_lb`, `delivered_zn_lb`, `delivered_cu_lb`, `delivered_b_lb`, `delivered_na_lb` | float | Snapshot, not recomputed — preserves history if product analysis changes later |
| `photo_url` | string nullable | Optional |
| `notes` | text | |

### 5.8 `irrigation_events`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | cuid | |
| `area_id` | FK | |
| `event_at` | datetime | |
| `runtime_min` | int | |
| `inches_applied` | float | Computed from runtime × precip rate |
| `gallons` | float | Computed |
| `na_lb_deposited` | float | Computed and stored as snapshot |
| `is_leaching_cycle` | bool | |
| `recorded_by` | FK users | |
| `notes` | text | |

### 5.9 Lookup tables (reference data)

Following the vis-daily-tracker convention: every lookup follows the shape `{ id, code, name, sortOrder, active }`. `code` is the stable string identifier (what `src/lib/constants.ts` references); `name` is the display label. Schema migrations are schema-only — all lookup rows live in `prisma/seed/` as idempotent upserts (`upsert by code`). UI renders option lists from DB-driven props, never hardcoded arrays.

Lookup tables for v1:

- `area_types` — turf, bed, tree, ornamental, mixed
- `area_type_kc_defaults` — default crop coefficients per area type per growing-season phase
- `irrigation_sources` — tap, well, mixed, rain, drip, none
- `product_forms` — granular_pelletized, granular_powder, liquid_concentrate, liquid_RTU, water_soluble_powder
- `product_tags` — contains_p, contains_b, contains_na, acidifying, pgr, surfactant, humic, etc.
- `application_units` — lb, oz_wt, fl_oz, gal
- `recommendation_rules` — registry of rule_ids the engine knows about, with display names + default priority

FK IDs surfaced as constants in `src/lib/constants.ts` (e.g. `AREA_TYPE_TURF`, `PRODUCT_FORM_LIQUID_CONCENTRATE`). Never hardcode raw integers anywhere in app code — same guardrail as vis-daily-tracker.

### 5.10 `recommendations` (cache only — derived state)

**Source of truth is the computation**, not the row. Stored only for read-perf and to support snooze/dismiss state. Recomputed lazily on read or eagerly on write events (new application, new soil test, new irrigation event).

Implements the `Status<V, K>` / `Diagnostic<K>` primitive (vis-daily-tracker `docs/pipe-tree/status-diagnostics.md`):

```ts
type AreaStatus = {
  status: "ok" | "attention" | "urgent"           // single rollup value (V)
  statusDescription: string                        // one-line summary
  diagnostics: AreaDiagnostic[]                    // typed, per-rule
  diagnosticCounts: Record<DiagnosticKind, number> // rollup by kind
}

type AreaDiagnostic = {
  kind: DiagnosticKind                             // K — discriminated union
  priority: "urgent" | "recommended" | "informational"
  summary: string
  computedAt: Date
  ruleId: string
  payload?: Record<string, unknown>                // rule-specific (target_lb, etc.)
  dismissedUntil?: Date | null
}

type DiagnosticKind =
  | "leaching_due"
  | "nutrient_below_target"
  | "gypsum_maintenance_due"
  | "pgr_cycle_due"
  | "soil_test_stale"
  | "salt_balance_negative"
  | "application_overlap"
```

Rationale (cribbed from vis-daily-tracker): no boolean rollups (`isComplete`, `needsWork`, etc.) — consumers that want "is this OK" check `status === "ok"`; consumers that want "why not" iterate `diagnostics`; consumers that want per-kind counts read `diagnosticCounts`. Adding a new rule means adding a new `DiagnosticKind` variant and a pure rule function — never modifying existing rule code. Industry lineage: Kubernetes conditions + LSP diagnostics.

The `recommendations` table caches this shape per area. The recomputation function `computeAreaStatus(areaId)` lives in `src/lib/rules/` — pure, deterministic, unit-tested per rule.

---

## 6. Calculations & rules

### 6.1 Water demand (ET-based)

```
weekly_target_in = ET0_in_per_week × Kc × leaching_factor
```

- `ET0`: user-entered weekly value, default lookup from CIMIS station table
- `Kc` per area type + season:
  - Bermuda dormant: 0.0
  - Bermuda green-up: 0.6
  - Bermuda active: 0.8–0.9
  - Bermuda pre-dormancy: 0.5
  - Vegetable bed defaults: 1.0–1.15 active
  - Tree (mature): 0.5–0.7
- `leaching_factor`: 1.0 baseline / 1.15 monthly leaching / 1.3 reclamation push

### 6.2 Sprinkler runtime per area

```
runtime_min = (target_inches / precip_rate_in_per_hr) × 60
```

### 6.3 Sodium deposition (the salt clock)

```
na_lb_per_inch_per_1k = water_na_ppm × 0.00052
season_na_lb = Σ(weekly_target_in × area_sq_ft / 1000 × na_lb_per_inch_per_1k)
```

Derivation: 1 inch over 1,000 sq ft = 623.4 gal × 3.785 L/gal = 2,360 L. At 1 mg/L = 2,360 mg = 0.0052 lb. Linear in concentration.

### 6.4 Granular application math

```
product_lb_per_1k = need_lb_per_1k / (product_pct_X / 100)
total_product_lb = product_lb_per_1k × area_sq_ft / 1000
```

### 6.5 Liquid application math

```
# Step 1: total nutrient X needed for the area
total_nutrient_lb = need_lb_per_1k × (area_sq_ft / 1000)

# Step 2: total product needed (in lb)
total_product_lb = total_nutrient_lb / (product_pct_X / 100)

# Step 3: convert to fluid volume
total_product_fl_oz = total_product_lb × 128 / (density_lb_per_gal)

# Step 4: dilution into carrier
carrier_total_gal = user_input  # how much spray volume they want to mix
product_fl_oz_per_gal_carrier = total_product_fl_oz / carrier_total_gal
```

Output to user: "Mix `total_product_fl_oz` of product into `carrier_total_gal` gallons of water. Spray entire area."

If the spray volume per 1k sq ft is below the manufacturer's minimum (often 1 gal/1k for foliars), warn and suggest doubling carrier.

### 6.6 Nutrient unit conversions (bake into all math)

- `K = K2O × 0.83`
- `P = P2O5 × 0.436`
- Soil tests usually report elemental; product labels report oxide. Always normalize to elemental internally.

### 6.7 "What's Next?" rules engine (v1, rules-based)

Per area, evaluate every rule on each app open / every 6h. Each rule produces 0 or 1 `recommendations` row.

| Rule ID | Condition | Output |
| --- | --- | --- |
| `leaching_due` | days_since_last_leaching_cycle ≥ 30 | "Run a leaching cycle (1.5–2× normal volume) — last was {date}" |
| `nutrient_below_target` | for each {N,K,Ca,Mg,S,Mn,Zn}: ytd_delivered_lb_per_1k < (season_target × elapsed_fraction) − tolerance | "Apply ~X lb of {best $/lb product} to catch up on {nutrient}" |
| `gypsum_maintenance_due` | days_since_last_gypsum ≥ 180 (defensive cadence) | "Defensive gypsum maintenance pass due — ~25 lb/1k" |
| `pgr_cycle_due` | active growing season AND days_since_last_pgr ≥ 21 | "Primo Maxx app due (every 21 days during active growth)" |
| `soil_test_stale` | months_since_test ≥ 12 | "Soil test is {N} months old — re-test recommended" |
| `salt_balance_negative` | ytd_na_deposited > ytd_displaceable_na × 1.5 | "Salt deposition outpacing Ca delivery by Xx — consider gypsum or leaching" |
| `temperature_window` | upcoming forecast > 90°F next 3 days AND target product is foliar | "Postpone foliar app — heat stress window incoming" *(needs weather integration; deferred)* |
| `application_overlap` | proposed app within 48h of incompatible product (e.g. PGR + foliar fert) | "⚠ Last applied {product} {hours}h ago — possible incompatibility" |
| `mowing_pending_after_app` | proposed app needs to dry/be watered in AND next mow imminent | informational only |

Rules can be added without schema changes — they're code, not data.

### 6.8 Side-effect warnings (at calculation time, before logging)

Block-level warnings displayed before "Confirm + Log":

| Condition | Severity | Message |
| --- | --- | --- |
| `product.tags includes contains_p` AND area.soil_test.p_ppm > optimal_max | 🚫 hard | "Product contains P — soil P already {x}× optimal" |
| `product.tags includes contains_b` AND area.soil_test.b_ppm > optimal_max | 🚫 hard | "Product contains B — soil B already high" |
| `product.tags includes contains_na` | ⚠ soft | "Product contains Na — adds to salt load" |
| `product.tags includes acidifying` AND area.soil_test.pH < 7.0 | ⚠ soft | "Acidifying product — soil pH already {x}" |
| `ytd_n_lb_per_1k + this_app_n > season_max_n` | ⚠ soft | "Annual N would exceed {max} lb/1k" |

Hard warnings require explicit "I know, do it anyway" confirmation. Soft warnings are inline informational.

### 6.9 Cost per nutrient delivered

```
cost_per_lb_X = (pkg_cost / pkg_size_lb) / (pct_X / 100)
```

Used to rank product options in the "I want to apply X" picker — cheapest source per nutrient first.

---

## 7. Workflows

### 7.1 The killer flow — field application (mobile)

```
┌─────────────────────────────────────┐
│  Backyard – 3,318 sq ft        [⌄] │  ← persistent area chip; tap to switch
├─────────────────────────────────────┤
│  What's next?                       │
│  • 🟡 K below target — apply ~6 lb  │
│    K-Mag                            │
│  • 🔴 Leaching cycle 4 days overdue │
│  ─────────────────────────────────  │
│  Or apply something else:           │
│  [ Search products… ]               │
│  Recent: 30-0-10 · Gypsum · K-Mag   │
└─────────────────────────────────────┘
```

User picks "30-0-10":

```
┌─────────────────────────────────────┐
│  Apply: SLS 30-0-10 (liquid)        │
│  to: Backyard – 3,318 sq ft         │
├─────────────────────────────────────┤
│  Target rate?                       │
│  ( ) Soil test recommended:         │
│      0.4 lb N / 1k                  │
│  ( ) Bag rate: 0.5 lb N / 1k        │
│  (●) Custom: [ 0.4 ] lb [ N ] /1k   │
│                                     │
│  Carrier:                           │
│  [ 2 ] gal water                    │
│                                     │
│  ▼ Compute                          │
├─────────────────────────────────────┤
│  Mix 13.3 fl oz of product          │
│  into 2 gal water                   │
│                                     │
│  Delivers:                          │
│    N:  1.33 lb (0.40 lb/1k)  ✓     │
│    K:  0.44 lb (0.13 lb/1k)        │
│    P:  0     ✓                      │
│    Na: 0     ✓                      │
│                                     │
│  ⚠ YTD N would be 3.2 lb/1k         │
│    (ceiling 4–6 for low-cut)        │
│                                     │
│  Cost: $4.21                        │
│                                     │
│  [   ✓ Confirm + Log   ] [ Edit ]   │
└─────────────────────────────────────┘
```

Three taps from app open to confirmed log. Math + warnings done. This is the value prop in a screenshot.

### 7.2 Onboard a new area

1. Pick parent property (or create one)
2. Name + sq ft + type + irrigation source
3. (Optional) Add soil test now or later
4. Done — area available for applications immediately

### 7.3 Onboard a new soil test

1. Pick area
2. Enter test date + lab + values (form mirrors MySoil fields)
3. System auto-shows: ESP/SAR, deficiencies, excesses, suggested season targets
4. Set as `current_soil_test_id` for the area
5. Recommendations recompute

### 7.4 Onboard a new product

1. Brand + name + form
2. Guaranteed analysis (NPK + secondary + micros)
3. Density (if liquid), package size + cost, mfg rate
4. Tags auto-suggested from analysis (e.g. p2o5_pct > 0 → suggest `contains_p`)
5. Saved to user's library; visible to property contributors if `shared_within_household`

### 7.5 Log irrigation

1. Pick area + runtime
2. System computes inches, gallons, Na deposited
3. Mark as leaching cycle if applicable
4. Salt balance + recommendations recompute

### 7.6 Plan ahead (desk mode, secondary)

- View any area → see season's YTD nutrient inputs vs targets, salt balance, application timeline
- "What's coming?" view: next 2 weeks' recommended actions across all areas, sorted by urgency
- Cost rollup per property / per area

---

## 8. Implementation

### 8.1 Stack

| Layer | Choice | Reasoning |
| --- | --- | --- |
| Framework | **Next.js 16 (App Router)** | Single repo, server actions for mutations, RSC for read-heavy dashboard, route handlers for any external API |
| ORM | **Prisma** | Confirmed user preference, plays well with Next.js + Postgres |
| Database | **Postgres** | Already running locally for vis-daily-tracker |
| Auth | **Better-Auth** | Modern, replaces aging next-auth. Supports email/password, magic links, sessions, multi-user out of the box |
| PWA / SW | **Serwist** | Modern PWA toolkit, replaces deprecated next-pwa. Required for offline-capable field entry |
| UI | **Tailwind + shadcn/ui** | Fast iteration, mobile-first responsive, no design overhead |
| Forms / validation | **React Hook Form + Zod** | Type-safe end-to-end with Prisma-generated types |
| State | **Zustand** for client UI; server state via Next.js cache + revalidation | Avoid premature complexity |
| Charts | **Recharts** or **Tremor** | Salt-balance trend, YTD nutrient bars |

### 8.2 Offline behavior (Serwist)

- All read views cached after first load (areas, products, soil tests, recommendations)
- Field application form works fully offline
- Submissions queue locally → synced on reconnect via background sync
- Conflict resolution: last-write-wins for the v1 (multi-user collisions in same area within seconds are unlikely for this use case)

### 8.3 Auth model (Better-Auth)

- Email + password + magic link
- Per-user session
- Properties have `property_members` for shared access
- Role-based permissions:
  - `owner`: full CRUD on property, areas, applications, products
  - `contributor`: can log applications + irrigation, can't edit area definitions or delete history
  - `viewer`: read-only
- Products belong to the user who created them; opt-in `shared_within_household` makes them visible to any property contributor

### 8.4 Deployment posture

**RPM-as-artifact, standardized on `TylerVigario/website`'s contract.** A tagged commit on `main` is built by CI on a self-hosted GitHub Actions runner (running on the prod host) into a signed `turf-tracker-<version>-1.fc43.x86_64.rpm`, copied into `/srv/dnf-repo-public/` (served at `https://repo.tylervigario.com/`), and attached to the GitHub Release. Consumers install it with `sudo dnf --refresh upgrade turf-tracker`. turf-tracker is a *public* package — it goes to the WAN-facing repo, not the LAN-only `http://repo.lan/` (`/srv/dnf-repo-private/`, reserved for Tyler-business apps).

Full source-side contract: [`docs/deployment.md`](deployment.md). That's the spec the production deploy script consumes. The canonical rationale for any section there is in [`tylervigario/docs/deployment.md`](../../tylervigario/docs/deployment.md) — turf-tracker mirrors its structure and only the values differ. This section captures the high-level posture; detail lives in the linked docs.

**Why RPM-as-artifact and not build-on-prod or `output: "standalone"`:** the prior pivots each ran into a structural failure class. Standalone produced four consecutive bad releases in the sister project (v2.80.0–v2.83.0); build-on-prod simplified things but put the npm registry, GitHub, and Prisma's engine CDN in the deploy critical path on every cutover. RPM-as-artifact bakes everything into a signed file once, ships it through the same dnf repo that the rest of the household's services already use, and makes rollback a `dnf downgrade`.

**Required runtime on the deploy host:** Fedora 43 + `nodejs24` parallel-install package + an external Postgres. The host must be subscribed to the public dnf repo (`https://repo.tylervigario.com/`) with the signing key trusted (bootstrap is `rpm --import` + a `.repo` drop-in served from the repo itself — see deployment.md). Apache (or any reverse proxy) is an operator choice; the RPM ships a snippet at `/usr/share/turf-tracker/apache-snippet.conf` that operators `Include` from their own vhost but it does not declare a hard dependency on `httpd`.

**Required env at runtime:** [`src/lib/required-env.json`](../src/lib/required-env.json). Validated at startup by [`src/lib/runtime-config.ts`](../src/lib/runtime-config.ts).

```json
["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "AUTH_PASSWORD_PEPPER"]
```

**Optional env at runtime:** `CIMIS_API_KEY` (Phase 4 ET₀ auto-fetch), `SMTP_*` (Better-Auth magic-link transport), `SENTRY_DSN`.

**`/api/health`** — `200 {"status":"ok"}` when the DB is reachable, `503` when not. Schema-agnostic (`SELECT 1`).

**Shutdown contract** — `server.js` traps SIGTERM/SIGINT: drain in-flight HTTP (30s cap), disconnect Prisma, flush Sentry, `process.exit(0)`. systemd's `KillSignal=SIGTERM` is correct for this contract. Clean exit-0 means any operator-installed `OnFailure=` drop-in (the RPM doesn't ship one) only fires on actual failure, not on `systemctl stop` or `systemctl restart`.

**Migrations + seed** — operator-driven via `sudo turf upgrade`. Two systemd oneshots (`turf-tracker-migrate.service`, `turf-tracker-seed.service`) and no `[Install]` on either; they sit dormant until `turf upgrade` invokes them with `systemctl start`. `Type=oneshot` blocks until `ExecStart` completes, enforcing migrate → seed → `try-restart` ordering without explicit `Requires=`. `%posttrans` only does `daemon-reload` + an informational next-step message branched on first-install vs upgrade-with-opt-in vs upgrade-without-opt-in — no schema work, no service restart from rpm. Opt into auto-orchestration with `sudo systemctl enable --now turf-tracker-upgrade.path` (Path unit watches `/usr/share/turf-tracker/package.json` and triggers `turf-tracker-upgrade.service`, which runs `turf upgrade`). Mirrors the canonical Fedora pattern (`postgresql-setup --upgrade` as a discrete operator step). Migrations stay forward-compatible across one release; rollbacks via `dnf downgrade` install older files but never roll schema back.

**Build pipeline** (driven by `packaging/turf-tracker.spec`'s `%build`, which runs `npm ci && npm run build`):

1. Prebuild: `check:public-env` → `build:seed` → `build:cli` → `build:server`.
2. `next build && serwist build`.
3. Postbuild: real-boot smoke. Spawns `node server.js` on a random loopback port with hermetic stub env, waits for bind, SIGTERM, asserts clean exit-0 within 10s.

The self-hosted runner is Fedora 43 on x86_64 — the same OS/arch as prod — so native bindings (@node-rs/argon2, prisma engines) ship matching prod's glibc exactly. `BuildArch: x86_64`.

**Signing.** The RPM is signed with the `public-signer` subkey of the `server-admin@tylervigario.com` master key (fingerprint `EC7FD18BBAFFA8A05AD0FC2ADE09D5ECD557FA4B`). Master keyring lives at `/etc/server-admin/gnupg/` on the repo host. `github-runner` holds zero key material — the workflow calls `sudo /usr/bin/rpmsign --addsign` via a narrow sudoers rule, and the actual signing runs as root reading `/root/.rpmmacros` (bound to the public-signer subkey for this repo's runner). Compromise scope of `github-runner` is "can sign an RPM at the sudoers-allowed path," not "can take the subkey elsewhere." Consumer trust comes via the `RPM-GPG-KEY-server-admin` pubkey snapshot served from `https://repo.tylervigario.com/`.

**Phased deployment reality:**

- **Phase 1 (done):** localhost only. `npm run dev`.
- **Phase 2 (now):** RPM cuts via `workflow_dispatch` on `release.yml`, prod runs `sudo dnf --refresh upgrade turf-tracker`. This is when the contract becomes load-bearing.
- **Phase 3+:** family/multi-user remote access via the prod host's public origin (`BETTER_AUTH_URL`).

**Backups:** `pg_dump` nightly cron to local disk + Nextcloud-synced folder. Same pattern as vis-daily-tracker.

### 8.5 Repo layout

```
turf-tracker/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                # Initial product + area seed
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (auth)/            # Sign in, sign up, magic link
│   │   ├── (app)/             # Auth-gated app shell
│   │   │   ├── area/[id]/
│   │   │   ├── apply/         # The killer flow
│   │   │   ├── log/
│   │   │   ├── soil-tests/
│   │   │   └── products/
│   │   └── api/               # Route handlers (rare; prefer server actions)
│   ├── components/
│   ├── lib/
│   │   ├── calc/              # All math from §6 (unit-tested)
│   │   ├── rules/             # "What's Next?" rules from §6.7
│   │   └── auth.ts            # Better-Auth setup
│   └── sw/                    # Serwist service worker config
├── tests/
│   └── calc/                  # Vitest unit tests for every formula
└── docs/
    └── SPEC.md                # This file
```

---

## 9. Phased build plan

### Phase 1 — MVP field tool (target: 1–2 weekends)

- Next.js + Prisma + Postgres scaffolded
- Better-Auth wired
- Schema migrated; seed script for current products + areas + soil test
- Area CRUD
- Product CRUD
- Soil test entry + ESP/SAR display
- **Application calculator** (granular AND liquid) with side-effect warnings
- **Log application** (writes snapshot of delivered nutrients + cost)
- Mobile-responsive UI for the apply flow

**Definition of done for Phase 1:** standing in your backyard with phone in hand, you can log a real application from app open in under 30 seconds with correct math.

### Phase 2 — Recommender + irrigation

- "What's Next?" rules engine with the v1 rules from §6.7
- Irrigation event logging
- Salt-balance running total per area
- YTD nutrient delivery per area (cards)

### Phase 3 — PWA + offline

- Serwist service worker
- Offline cache strategy
- Background sync for queued writes
- Install prompt

### Phase 4 — Polish & integrations

- CIMIS API for ET₀ auto-fetch (Hanford / Five Points / Parlier station)
- Photo attach on applications
- Multi-user invites + role management UI
- Cost dashboards (per property, per nutrient)
- Per-area history view

### Phase 5 — Speculative / earned later

- Soil test PDF parser (MySoil, county labs)
- Weather forecast integration (skip irrigation if rain coming, postpone foliar in heat windows)
- Multi-year graphing
- Public/shared product library across users

---

## 10. Decisions (from v1 open questions)

| # | Question | Decision |
| --- | --- | --- |
| 1 | Cloud preference | **Web app, not Sheets**. Next.js + Postgres self-hosted initially. |
| 2 | Properties scope | **All 3 from day 1**, plus generic enough to add more later. |
| 3 | Sprinkler precip rates | Optional per area; calculator works without them by accepting raw inches input. Catch-cup tests can be added later. |
| 4 | Soil-test cadence | User-driven; system flags `soil_test_stale` at 12 months. |
| 5 | Form vs direct entry | Single mobile-first UI; no separate Google Form needed. |
| 6 | Products seed | Yes — seed script populates current products as starting point. |
| 7 | Units | Imperial default; metric per-user toggle later. |
| 8 | Currency | USD only. |
| 9 | CIMIS station | Default to Hanford (#86); user-overridable. |
| 10 | Mowing/equipment log | Out of scope for v1. |

New decisions from this round:

| # | Question | Decision |
| --- | --- | --- |
| 11 | Stack | Next.js 16 + Prisma + Better-Auth + Serwist + Tailwind + shadcn/ui |
| 12 | Deployment | Localhost + Tailscale initially; VPS later if needed |
| 13 | Auth | Better-Auth email/password + magic link, multi-user from day 1 |
| 14 | Areas as primitive | Single `areas` table covers turf zones, beds, trees |
| 15 | "What's Next?" engine | Rules-based v1 (in code), upgrade to ML later if rules insufficient |

---

## 11. Risks

- **Scope sprawl into "evening project" eating lawn time.** Mitigation: Phase 1 is a contract; nothing past §2 ships in v1.
- **Better-Auth and Serwist are newer libs** — possible doc gaps or breaking changes. Both are actively maintained but pin versions and lock the lockfile.
- **Offline conflict resolution** is intentionally simple (last-write-wins). For single-user-per-area in practice, it's fine. If multi-user collisions become real, revisit with a CRDT or version-vector approach.
- **Rules engine becomes a tangle** of special-cases. Mitigation: each rule is its own pure function with explicit inputs/outputs and a unit test. Adding rules should never require touching others.
- **Soil test data variability** — different labs report different fields. Schema allows nulls; UI gracefully omits derived metrics that lack inputs.
- **Per-nutrient cost ranking misleads** when "cheapest" product brings P or B you can't accept. Ranking must filter out hard-warned products before sorting by cost.

## 12. Success criteria for v1

- From phone in the field, `app open → application logged with correct math` in **< 30 seconds**
- Every active area has a current "what's next?" recommendation visible without navigation
- Zero math done by hand for the rest of the season
- Family member with `contributor` role can log applications they did without grower being involved
- At end of season, every area has: total inputs delivered (per nutrient), total cost, total Na deposited, application timeline — with no manual rollup work

---

## 13. Conventions inherited from vis-daily-tracker

These are baked-in expectations, carried over wholesale. Don't re-derive — apply directly.

### 13.1 Project structure

- `src/lib/db.ts` — Prisma client singleton (PrismaPg adapter)
- `src/lib/constants.ts` — every FK ID (lookup row IDs) as a named constant. **Never hardcode raw integers.**
- `src/lib/lookups.ts` — server-side resolver (`getLookups`, `getSerializedLookups`)
- `src/lib/lookup-helpers.ts` — client-safe helpers (`lookupName`, `lookupId`, `LookupRow` type)
- `src/lib/auth/api-auth.ts` — `getApiContext(request)` returning unified `{ source: "session" | "service", userId, role }` (service token path can be deferred until automation lands; session-only is fine for v1)
- `src/lib/auth/guards.ts` — `unauthorized`, `forbidden`, `canAccessOwn`
- `src/lib/calc/` — every formula from §6, pure functions, exhaustively unit-tested
- `src/lib/rules/` — each "What's Next?" rule is its own pure function, one file per rule, registered in an index
- `src/instrumentation.ts` + `src/lib/runtime-config.ts` — fail-fast validation of every `requiredEnv` at startup, surfacing all misconfigs in a single error
- Path aliases: `@/*` → `src/*`, `@generated/*` → `generated/*`

### 13.2 Database discipline

- **Migrations are schema-only.** All lookup rows live in `prisma/seed/` as idempotent upserts (`upsert by code`). Required in every environment including prod (runs as `preStartCommand`).
- **Form state holds FK IDs end-to-end** — no string-name intermediaries. `area.areaTypeId` flows from form → server action → DB without ever being normalized through display names.
- **DB-driven UI labels** — render every option list (product forms, area types, irrigation sources, units) from lookups, not hardcoded arrays.
- **Audit trail discipline** — don't add columns for state the audit log already captures. If "applied → reverted" needs to be tracked, it's an `applications_audit` row, not a `reverted_at` column on the application.
- **Pure query-time derivation for computed state** — recommendations are computed, not stored. The `recommendations` table is a cache, not source of truth.

### 13.3 Tooling

- **Husky pre-commit:** `lint-staged` + `typecheck` + `test`
- **Commit-msg hook:** `commitlint` enforces Conventional Commits, **minimalist 6-type set** — `feat` (minor bump), `fix` / `refactor` (patch), `chore` / `docs` / `test` (skipped from changelog). Fold what you'd reach for elsewhere: `perf` → `refactor`/`fix`, `style` → `chore`, `revert` → `fix`/`chore`, `build` → `chore(build)`, `ci` → `chore(ci)`.
- **Prettier:** 100 col, double quotes, trailing commas, semicolons
- **ESLint:** flat config with type-aware rules
- **TypeScript:** `tsc --noEmit` runs as separate `typecheck` step (not just `next build`)
- **Vitest** for unit tests of `lib/calc/` and `lib/rules/`

### 13.4 Git workflow

- `pull.rebase=true` + `rebase.autoStash=true` set globally
- **No merge commits, no force-push on main, no `--amend` on pushed commits, no `--no-verify`**
- Conventional Commits drive semver tags via the same release workflow as vis-daily-tracker

### 13.5 Backlog

- **GitHub Issues with `high` / `medium` / `low` labels.** No local backlog files (no `TODO.md`, no `BACKLOG.md`).

### 13.6 Spec docs structure

Following vis-daily-tracker's `docs/` layout — split by domain rather than one giant SPEC. Once Phase 1 is past scaffolding, this `SPEC.md` decomposes into:

```
docs/
├── architecture.md          # The 30k-foot view (replaces this file's prose)
├── deployment.md            # Inherits vis-daily-tracker's v2 contract
├── data-model.md            # §5 lifted out
├── calculations.md          # §6 lifted out (formulas + derivations)
├── rules-engine.md          # §6.7 expanded (each rule fully spec'd)
├── workflows.md             # §7 lifted out
├── auth.md                  # User model, roles, multi-user permissions
└── ui/
    ├── apply-flow.md        # The killer screen, fully spec'd
    ├── area-detail.md       # Per-area drill-down
    └── home.md              # The "what's next?" home screen
```

User edits these specs to form opinions. Treat them as reference, not artifacts to maintain reflexively.

### 13.7 CLAUDE.md philosophy

When the project ships, write a `CLAUDE.md` that's vocabulary + guardrails + canonical paths only. **Don't duplicate what's discoverable via grep/glob.** README is for feature showcase + design rationale. Spec docs are for behavior.

### 13.8 Carryforward principle ("wrong-once trumps right-many")

When pre-filling form defaults from prior history (e.g. last application's product, last irrigation's runtime), only carry fields where being wrong costs nothing. Carrying `target_rate` is fine — easy to re-tune. Carrying `area_id` is dangerous — applying to the wrong yard is a real cost.

### 13.9 Topology vs quality split

Same separation pattern vis-daily-tracker uses for inspections: separate "is this product chemically appropriate for this area" (topology — hard warnings, blocks unless overridden) from "is this needed right now" (quality — recommendations, soft suggestions). Keep these axes distinct in code and UI.

---

## 14. Build kickoff checklist

When ready to start Phase 1:

- [ ] `npx create-next-app@latest turf-tracker --typescript --tailwind --app`
- [ ] Add Prisma + Postgres connection (use existing local Postgres instance)
- [ ] Add Better-Auth with email/password adapter
- [ ] Schema → migrate → seed
- [ ] Build area CRUD (the simplest table to get end-to-end working)
- [ ] Build product CRUD
- [ ] Build soil test entry + derived metrics display
- [ ] Build the apply flow (the killer screen) — start with granular only, then add liquid
- [ ] Mobile QA on actual phone via local IP
- [ ] First real-world application logged from the field — done with v1 MVP
