# Tranco Benchmark 74V6X

## Fixed benchmark

The benchmark uses the first 1,000 domains from Tranco list `74V6X`.

The list was generated on 06 September 2026 and aggregates the Crux, Farsight, Majestic, Radar, and Umbrella rankings for 08 August 2026 through 06 September 2026. Tranco combines the source rankings with the Dowdall rule and retains pay-level domains.

The benchmark file is:

`experiments/tranco-74V6X-top1000.csv`

Source: https://tranco-list.eu/list/74V6X

Reference:

Victor Le Pochat, Tom Van Goethem, Samaneh Tajalizadehkhoob, Maciej Korczyński, and Wouter Joosen. 2019. "Tranco: A Research-Oriented Top Sites Ranking Hardened Against Manipulation," Proceedings of the 26th Annual Network and Distributed System Security Symposium (NDSS 2019). https://doi.org/10.14722/ndss.2019.23386

## Purpose

The Tranco rank is an independent sampling frame. It is not an AI visibility, retrieval, citation, quality, or readiness score.

The benchmark is intended to measure the renderer reconstruction across a broad and externally defined population of high-ranking public domains.

## Benchmark runner

Run the benchmark with:

```bash
node bin/chatgpt-render-benchmark.mjs \
  --file experiments/tranco-74V6X-top1000.csv \
  --out experiments/results/tranco-74V6X-render.jsonl
```

Optional controls:

```text
--timeout <ms>       Per URL fetch/render timeout. Default: 10000.
--concurrency <n>    Parallel workers. Default: 4.
```

The runner records successful renders and errors separately. Successful rows include renderer measurements. Errors retain the domain, rank, URL, timestamp, elapsed time, and error message.

## Reproducibility

Every result set must retain:

* Tranco list ID
* Tranco generation date
* benchmark input file
* benchmark execution timestamp
* renderer identifier
* renderer configuration used for the run

A later Tranco snapshot constitutes a new benchmark version. Existing snapshots remain valid historical reference points.
