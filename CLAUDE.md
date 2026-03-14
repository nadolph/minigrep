# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
cargo build          # Build the project
cargo run -- <query> <filename>   # Run minigrep
cargo test           # Run all tests
cargo test <name>    # Run a single test by name (e.g. cargo test case_sensitive)
```

## Architecture

This is a Rust CLI tool (the minigrep example from the Rust Book) split into two files:

- `src/main.rs`: Entry point. Parses args via `Config::new`, calls `run`, and exits with error codes on failure.
- `src/lib.rs`: Library crate containing `Config` struct, `run` function, and `search`/`search_case_insensitive` functions with tests.

**Config** is constructed from `std::env::Args` and reads the `CASE_INSENSITIVE` environment variable to toggle case sensitivity (`CASE_INSENSITIVE=1 cargo run -- query file.txt`).

**run** opens the file, reads it to a string, and prints matching lines to stdout.
