# AOA Agent Reference Guide: X Feed Algorithm Integration

This is reference-only research material. It is NOT a binding spec for this project.
If anything here conflicts with /specs, /specs wins.

Licensing note
Do not copy code or large chunks of upstream text from public X algorithm repos into this project.
We only use high-level ideas and re-implement from scratch.

---

# AOA Agent Reference Guide: X Feed Algorithm Integration

## 1. Purpose and Scope
This guide explains how this repository's recommendation stack works so an AOA agent can safely implement or adapt the same algorithm in a similar base project.

This repo is a partially open-sourced skeleton. It contains core logic and architecture, but several production modules are intentionally missing.

## 2. Fast Mental Model
For each feed request:

1. Build query context (user action sequence + user features).
2. Fetch candidates from two sources in parallel:
   - Thunder (in-network, from followed accounts)
   - Phoenix retrieval (out-of-network ML retrieval)
3. Hydrate candidates in parallel with metadata.
4. Filter candidates sequentially.
5. Score candidates sequentially.
6. Select top-K by score.
7. Run post-selection hydration/filtering.
8. Return final list and launch side effects asynchronously.

## 3. Repository Map and Roles
- home-mixer: Orchestrates the full recommendation pipeline and exposes ScoredPostsService.
- candidate-pipeline: Generic async pipeline framework (traits + execution semantics).
- thunder: Real-time in-memory post store + gRPC service for in-network candidates.
- phoenix: Python JAX/Haiku retrieval/ranking models.

## 4. End-to-End Request Lifecycle

### 4.1 Entry Point
- home-mixer/server.rs: gRPC get_scored_posts.
- Converts proto query to internal ScoredPostsQuery.
- Calls PhoenixCandidatePipeline.execute(query).

### 4.2 Pipeline Composition
- home-mixer/candidate_pipeline/phoenix_candidate_pipeline.rs

Configured stages:
1. Query hydrators
2. Sources
3. Candidate hydrators
4. Pre-scoring filters
5. Scorers
6. Selector
7. Post-selection hydrators
8. Post-selection filters
9. Side effects

### 4.3 Query Hydration (Parallel)
- UserActionSeqQueryHydrator: fetch + aggregate user action sequence.
- UserFeaturesQueryHydrator: fetch muted/blocked/followed/subscribed features.

### 4.4 Sourcing (Parallel)
- PhoenixSource:
  - Disabled when in_network_only=true.
  - Requires hydrated user action sequence.
  - Calls Phoenix retrieval for OON candidates.
- ThunderSource:
  - Calls Thunder gRPC for in-network candidates from following list.

### 4.5 Candidate Hydration (Parallel)
- InNetworkCandidateHydrator: sets in_network.
- CoreDataCandidateHydrator: text/retweet/reply metadata.
- VideoDurationCandidateHydrator
- SubscriptionHydrator
- GizmoduckCandidateHydrator

### 4.6 Pre-Scoring Filters (Sequential)
Order matters:
1. DropDuplicatesFilter
2. CoreDataHydrationFilter
3. AgeFilter
4. SelfTweetFilter
5. RetweetDeduplicationFilter
6. IneligibleSubscriptionFilter
7. PreviouslySeenPostsFilter
8. PreviouslyServedPostsFilter (only when is_bottom_request=true)
9. MutedKeywordFilter
10. AuthorSocialgraphFilter

### 4.7 Scoring (Sequential)
1. PhoenixScorer
   - Calls Phoenix prediction API.
   - Converts top log-probs to probabilities with exp(log_prob).
2. WeightedScorer
   - Computes weighted multi-action score.
   - Applies normalization/offset hooks.
3. AuthorDiversityScorer
   - Penalizes repeated authors in a score-sorted pass.
4. OONScorer
   - Downweights out-of-network candidates.

### 4.8 Selection
- TopKScoreSelector: sort by candidate.score desc, truncate to configured TOP_K.

### 4.9 Post-Selection
- Hydrator: VFCandidateHydrator (calls visibility filtering service).
- Filters:
  - VFFilter
  - DedupConversationFilter

### 4.10 Side Effects
- CacheRequestInfoSideEffect runs after response candidate selection.
- Fire-and-forget async execution.

## 5. Candidate-Pipeline Runtime Contracts (Critical)
Source: candidate-pipeline/candidate_pipeline.rs

1. Parallel stages:
   - query hydrators
   - sources
   - candidate hydrators
   - post-selection hydrators
2. Sequential stages:
   - filters
   - scorers
3. Hydrator/scorer output must preserve length and order.
   - If output length mismatches input length, update is skipped.
4. Filter errors are non-fatal.
   - Pipeline falls back to previous candidate list for that stage.
5. Source/hydrator/scorer failures are logged and pipeline continues.
6. Side effects are spawned and not awaited.
7. Pipeline truncates final candidates to result_size().

Agent rule: never let a hydrator or scorer drop/reorder candidates.

## 6. Thunder (In-Network Source) Mechanics

### 6.1 Storage Model
- thunder/posts/post_store.rs
- In-memory DashMap state:
  - full post map
  - per-user original post deque
  - per-user secondary post deque (replies/retweets)
  - per-user video deque
  - deleted-post marker map
- Retention trimming removes old posts.

### 6.2 Serving Model
- thunder/thunder_service.rs
- gRPC request is concurrency-limited via semaphore.
- Uses spawn_blocking for retrieval/scoring path.
- Returns recency-sorted posts.

### 6.3 Ingestion Model
- tweet_events_listener: legacy format -> emits InNetworkEvent.
- tweet_events_listener_v2: consumes InNetworkEvent -> updates PostStore.

## 7. Phoenix ML Models

### 7.1 Ranking Model
- phoenix/recsys_model.py
- Input is user + history + candidates (hash-derived embeddings and categorical features).
- Transformer output is sliced at candidate positions and projected to action logits.
- Inference probabilities are sigmoid(logits).

### 7.2 Candidate Isolation Mask
- phoenix/grok.py::make_recsys_attn_mask
- Candidate tokens can attend to:
  - user/history tokens
  - themselves
- Candidate tokens cannot attend to other candidates.
This ensures candidate score independence from candidate batch composition.

### 7.3 Retrieval Model
- phoenix/recsys_retrieval_model.py
- Two-tower design:
  - User tower: transformer-encoded normalized user representation.
  - Candidate tower: MLP projection + L2 normalization.
- Retrieval: dot product similarity + jax.lax.top_k.

## 8. Data Contracts You Must Preserve in a Similar Project

### 8.1 Query Fields
At minimum:
- user_id
- locale/app info
- seen/served identifiers
- in_network_only
- request id
- hydrated:
  - user action sequence
  - user features (muted/blocked/followed/subscribed)

### 8.2 Candidate Fields
At minimum:
- ids (tweet_id, author_id, reply/retweet relations)
- text and metadata
- in-network flag
- per-action model scores
- final score
- visibility outcome

### 8.3 Service Dependencies (Abstract Interfaces)
You need adapters/interfaces for:
- retrieval model service
- ranking model service
- in-network post service
- core tweet/entity hydration
- user feature store
- author profile service
- visibility filtering service

## 9. AOA Agent Implementation Blueprint (Port/Integration)

1. Implement a generic pipeline engine first (matching section 5 semantics).
2. Define strict query/candidate schemas with explicit optional fields.
3. Add two minimal sources:
   - in-network source
   - retrieval source
4. Add core hydrators (core data + in-network flag).
5. Add basic filters (duplicates, self-post, age).
6. Add scoring stack in order:
   - model scores
   - weighted combine
   - diversity
   - OON reweight
7. Add selector.
8. Add post-selection visibility filtering.
9. Add async side effects.
10. Add observability and latency budgeting.

## 10. Validation Checklist for Agent Changes
- Does every hydrator/scorer return output length == input length?
- Did any stage accidentally reorder candidates before selection?
- Did you preserve filter and scorer execution order?
- Are source/hydrator/scorer failures non-fatal and logged?
- Are side effects non-blocking?
- Are candidates isolated from each other in ranking attention mask?
- Are OON and diversity adjustments applied after base weighted score?
- Are seen/served and muted/blocked filters still enforced?

## 11. Known Gaps and Caveats in This Repo
- Missing Rust build manifests and several internal modules (clients, params, util, configs).
- Kafka topic/env placeholders are blank in thunder/kafka_utils.rs.
- Repo is architectural/reference quality, not production-runnable as-is.
- Phoenix code demonstrates model structure but does not include trained weights.

## 12. Practical Notes for Similar Base Projects
- Start with deterministic local stubs for external services.
- Keep filter/scorer ordering configurable but fixed by default.
- Make pipeline stage metrics first-class (counts, latencies, drop reasons).
- Preserve graceful degradation behavior to avoid feed hard failures.
