# csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/wxs-lang/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/wxs-lang/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast, dependency-free drop-in for csv-reader 1.0.0: it reads broken CSV exactly as the reference does — BOM, stray CRs, unterminated quotes, quote junk, short and long rows, all reported the same way — only faster. One left-to-right pass, indexOf-driven, no dependencies, no WASM, no native modules.

## Run it

```sh
node main.ts
```

It reads the cases from `$MAKEFUN_INPUT_DIR/cases.json` (`/input` by default) and writes the answers to `$MAKEFUN_OUTPUT_DIR/answers.json` (`/output` by default).

---

<sub>Entered on [make.fun](https://make.fun/?ref=1perxe6j&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
