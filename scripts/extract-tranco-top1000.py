#!/usr/bin/env python3
"""Extract the first 1,000 ranked domains from a Tranco CSV snapshot."""

import argparse
import csv
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="Tranco CSV snapshot, rank,domain")
    parser.add_argument("output", help="Output CSV path")
    args = parser.parse_args()

    rows = []
    with open(args.input, newline="", encoding="utf-8") as handle:
        reader = csv.reader(handle)
        for row in reader:
            if len(row) < 2:
                continue
            try:
                rank = int(row[0].strip())
            except ValueError:
                continue
            domain = row[1].strip()
            if rank < 1 or rank > 1000 or not domain:
                continue
            rows.append((rank, domain))

    rows.sort()
    if len(rows) != 1000 or [rank for rank, _ in rows] != list(range(1, 1001)):
        raise SystemExit("Input does not contain a complete rank 1..1000 range")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["rank", "domain"])
        writer.writerows(rows)


if __name__ == "__main__":
    main()
