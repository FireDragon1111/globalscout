# GlobalScout formulas — prototype v1

Everything in this demo is synthetic. These are transparent screening heuristics,
not a trained talent model, a transfer recommendation or validated predictive formulas.
The planted high-performing players test whether the pipeline detects its inputs;
they do not establish accuracy on real football data.

## Inputs and measurement contract

Grain: one player-match appearance, with unique player_id + match_no. One synthetic
season has 20 appearances per player, 264 players and 5,280 player-match rows.
Two explicit roles, two age bands and three fictional leagues yield 12 cohorts.
Each cohort has 21 eligible peers and one deliberately low-minute player.
All financial figures are fictional euros, wages are annual gross estimates;
contract_months is measured at the common synthetic snapshot date.

Match counts must come from consistent provider definitions. The demo generates
already-labelled counts; it does not derive actions from tracking feeds or scrape sites.
For a future adapter, retain source IDs, event IDs, timestamp, provider definition
version, pitch orientation, position-in-match, on-pitch minutes and provenance.
Split multi-role or multi-league seasons into comparable segments before ranking.

Candidate action definitions for a future event adapter (not universal standards):
- Progressive pass/carry: completed action reduces straight-line distance to the
  centre of the opponent goal by >=10 metres; exclude set pieces. Use metres on
  a standardized 105 x 68 pitch, attacking toward x=105. Keep provider-native
  progression definitions separate if incompatible.
- Line break: completed pass crosses >=2 opponent defensive lines. Requires
  provider-tagged lines or a validated tracking-based line identification method.
  Do not infer from pass distance alone.
- Pressing recovery: the pressing player's own team recovers within 5 seconds,
  in the opponent final third (x>=70m); attribute once to the initiating presser.
- Take-on success: provider-labelled successful dribble past an opponent / attempts.
- Pressure retention: pressured receptions after which the team retains possession
  for >=3 seconds or completes the next action / all pressured receptions.
  Provider pressure labels and event sequencing are necessary.
- Defensive duel efficiency: defensive duels won / defensive duels attempted.
  Exclude attacking/aerial duels unless a separate metric explicitly includes them.

## Implemented calculations

### Exposure and rolling form

`per90 = 90 * SUM(events) / SUM(minutes)`

Calculate from pooled counts and minutes, never the mean of match per-90 values.
Calculate season, last 5, last 10 and previous 5 appearances. Last 5 and previous 5
do not overlap. A team match missed by a player is absent from this demo rather
than treated as zero performance. Season metrics use all observed appearances.

`change_p90 = last5_p90 - previous5_p90`

`change_percent = 100 * change_p90 / previous5_p90`

If the prior rate is zero, percentage change is null. Label all form changes
descriptive; no p-value or significant improvement claim is supported.

### Defensive opportunity adjustment

`PAdj_duels_won90 = 90 / SUM(minutes) * SUM(duels_won_match * 0.5 / opponent_possession_match)`

This scales activity to a 50% opponent-possession reference, not duel quality.
Team possession should be measured while the player is on the pitch. Demo inputs
are fictional; allowed team possession range is 10–90% to reject extreme/invalid
denominators. It is a chosen proportional adjustment, not StatsBomb's exact formula.
Raw duel wins and attempts remain inspectable. Duel efficiency is not possession adjusted.
Do not multiply passing percentages or every metric by possession.

### Cohorts and evidence gates

Exact cohort: `(season, league, precise_role, age_band)`.
U23 means age <23 at the common snapshot; other players are 23+.
Baseline peers need >=450 minutes. At least 20 eligible players per cohort are
required; the script refuses undersized cohorts rather than silently broadening.
Low-minute players receive diagnostic metrics but no priority score or alerts.
The 450-minute and 20-peer cutoffs are provisional operating choices, not evidence
of statistical reliability. Match/attempt dependence limits effective sample size.

### Shrinkage for limited exposure

For count rates, build a minutes-weighted baseline from other eligible cohort
players (leave the player out of their own shrinkage baseline):

`mu = SUM(peer_rate90 * peer_minutes) / SUM(peer_minutes)`

`r = minutes / (minutes + 900)`

`shrunk_rate90 = r * observed_rate90 + (1-r) * mu`

The 900-minute prior strength is configurable in the script and uncalibrated.
It is a stabilization heuristic, not a posterior confidence measure.

For take-on, pressure-retention and duel-efficiency proportions:

`p_peer = SUM(peer_successes) / SUM(peer_attempts)`

`shrunk_proportion = (successes + 20 * p_peer) / (attempts + 20)`

The 20-attempt prior is a provisional Beta-style smoothing rule. Raw proportions
are null for zero attempts; a zero-attempt player is represented by the peer prior
after smoothing, not by an observed 0% success rate. Completely unobserved cohort
rate metrics are rejected, not imputed as measured performance.

### Outlier z-scores and empirical percentiles

Use shrunk metrics from eligible players in the same cohort:

`z = (shrunk_value - cohort_mean) / cohort_sample_sd`

`percentile = 100 * (number_below + 0.5 * number_equal) / cohort_n`

The sample SD uses n-1; if SD=0, z=0 and equal values receive percentile 50.
Ties receive midranks. A cohort of 21 has maximum percentile 97.62, not 100.
Z is a descriptive standardized deviation, not a normality assumption or p-value.
Percentiles describe local peers, not global quality. All eight current metrics
are oriented higher-is-more; volume can indicate style rather than quality.

### Role-weighted performance score (0–100)

`performance = SUM(weight_metric * percentile_metric)`

| Metric | Ball-playing CB | Progressive CM |
|---|---:|---:|
| Progressive passes /90 | .25 | .20 |
| Progressive carries /90 | .05 | .20 |
| Line-breaking completions /90 | .25 | .15 |
| Pressing recoveries /90 | .05 | .10 |
| PAdj defensive duels won /90 | .10 | .05 |
| Take-on success proportion | .05 | .10 |
| Pressure-retention proportion | .10 | .15 |
| Duel-win proportion | .15 | .05 |

Each column sums to one. Weights encode a proposed scouting preference, not learned
football truth. Progressive passes and line breaks are correlated; validate weights
and sensitivity before operational use. The composite is a score, not itself a
percentile. It excludes goals, chance creation and several defensive risks, so it
is limited to these two illustrative roles rather than all player positions.

### Affordability, fit and contract opportunity (0–100)

`affordability = 100 - 0.5 * (value_percentile + annual_wage_percentile)`

Use the same eligible cohort for financial percentiles. Missing market value/wages
must block this score in a real adapter; never replace unknowns with zero cost.
This measures cheapness relative to peers, not proven undervaluation.

`club_fit_proxy = 100 * SUM(weight_metric * MIN(1, metric_percentile / 75))`

Illustrative target: a club seeking >=75th local-cohort percentile on each metric,
with the same role weights. Targets are floors, so exceeding them is not penalized.
No actual club profile has been supplied. This proxy omits formation, tactical
context, footedness, off-ball behavior and league transferability.

`contract_opportunity = 100 * (1 - MIN(months_remaining, 36) / 36)`

Shorter contracts increase this negotiation-opportunity proxy. They do not
guarantee availability, lower transfer fees or better player quality.

### Recruitment priority and alerts

`priority = .55*performance + .20*affordability + .15*club_fit_proxy + .10*contract_opportunity`

Only eligible players receive a priority score. This is an interpretable screening
ordering, not a probability, predicted price increase or calibrated value estimate.
Across leagues it orders relative local dominance and affordability; it cannot
establish equal playing strength across leagues. Compare candidates in their cohorts.

Provisional rule alerts (not statistical discoveries):
1. Progression watchlist: age <23, performance >=85, and at least one of passes,
   carries or line breaks at >=95th cohort percentile.
2. Performance/affordability: performance >=85 and affordability >=75.
3. Form watch: progressive-pass /90 increases >=25% against previous five,
   with >=300 minutes in each window and positive previous baseline.

These thresholds demonstrate operation; they need historical validation and scout
review. Repeated threshold scans cause false alerts. No automatic outreach, weekly
scheduler or repeated alert delivery is enabled. A real scheduled worker should
alert on a newly crossed condition, persist player/rule/as-of IDs, and deduplicate.

## Formulas prepared for future data, not calculated by this demo

**Metric-specific league translation:** on a held-out dataset of players moving
between leagues, fit, for each count metric and role,
`log(rate90 + epsilon) = player_effect + age_curve + season_effect + league_effect + team_context`.
Then translate `rate_target = MAX(0, EXP(log(rate_source + epsilon) + league_effect_target - league_effect_source) - epsilon)`.
Learn epsilon/regularization and validate temporal holdouts. For success proportions
use a binomial/logit model with attempt denominators instead. Selection bias,
role changes and sparse transitions require uncertainty estimates and coverage checks.
No coefficients are supplied; league adjustment is OFF. UEFA rankings are not
global player-metric multipliers. Do not claim Tier-1–4 comparability from them.

**Pressure passing above expectation:** given calibrated per-pass completion
probabilities q_i, `above_expected_pp = 100 * (SUM(completed_i) - SUM(q_i)) / N_attempts`.
The expected model needs pressure, geometry, pass type, recipient and contextual
data, fitted on training seasons and calibrated out of sample. Report attempts and
uncertainty; do not generate expected probabilities with the language model.

**Carry distance into the box:** sum tracking-path distances for carries ending in
the attacking penalty area (x>=88.5, 13.84<=y<=54.16 on 105x68), then multiply by
90/minutes. With event endpoints only, straight-line distance is a labelled lower
bound and must remain a separate metric. No distance is inferred in this demo.

**Central/wide take-ons:** split attempts by a declared channel map, e.g. central
third of pitch width 22.67<=y<=45.33; compute wins/attempts separately. Preserve
attempt counts; this partition is a design choice, not a universal channel definition.

**Value-to-output:** keep performance score alongside cost rather than divide
arbitrary percentiles by money. A future residual model can estimate
`discount = predicted_log_market_value - observed_log_market_value`, using
performance, age, role, league, minutes and contract duration on training data.
Positive residual means below model estimate, not guaranteed transfer arbitrage.
Needs current, licensed comparable financial data and held-out calibration.

**Early-exposure watch:** add verified career top-flight minutes <1000 as an
additional filter. Lower-league season minutes cannot establish career exposure;
this field is unavailable and the demo does not claim to implement that filter.

## Insight generation

All numeric results and rule alerts are calculated locally before Sarvam sees
them. `--sarvam` makes one `sarvam-105b` chat-completion call with the top synthetic
player's evidence. The prompt requires a synthetic label, supplied facts only,
local-cohort interpretation, caveats and no invented forecasts. AI prose is an
interpretation and should be reviewed against `scored_players.json`.
No model-generated prose can alter the scores or trigger rules.

## Run and inspect

`globalscout_demo.py` generates local synthetic results without an API request.
`globalscout_demo.py --sarvam` additionally requests one scouting summary, reading
SARVAM_API_KEY from the environment or the adjacent .env. No added dependencies
are needed beyond the Sarvam SDK already installed. Use the available Python
executable; the standard python command is not currently configured on this PC.

Outputs under demo_results/: synthetic_players.csv, synthetic_player_matches.csv,
rankings.csv, scored_players.json, demo_report.md and, with --sarvam,
sarvam_summary.txt. Inputs use a fixed random seed. Numeric output is reproducible;
model prose may vary. tests.py checks formulas and failure cases without API calls.

## Sources and limits

- StatsBomb's explanation supports per-90 normalization, position-specific
  comparisons and considering possession opportunity; it also distinguishes style
  from quality. Our smoothing, formulas, weights and thresholds are our own
  provisional design, not endorsed or calibrated by StatsBomb:
  https://blogarchive.statsbomb.com/articles/soccer/understanding-statsbomb-radars/
- Sarvam Chat Completions documentation supports the SDK/model integration:
  https://docs.sarvam.ai/api/token-factory/chat-completions
- All numerical evidence comes exclusively from the synthetic generator in
  globalscout_demo.py; no data from the sample Streamlit site was accessed or used.

Before real recruitment use: acquire permitted consistent feeds, audit coverage and
identity joins, calibrate priors/weights/league effects, test historical alert
precision and false positives on later seasons, examine role and league subgroup
performance, and validate with independent scouting assessments. Missing wages,
tracking or expected models remain unknown rather than invented.
