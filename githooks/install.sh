#!/bin/sh
# Point this repo at githooks/ so pre-commit and pre-push run locally.
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$DIR/.." && pwd)
git -C "$ROOT" config core.hooksPath githooks
echo "Installed git hooks for $ROOT"
echo "  core.hooksPath=githooks"
echo "  pre-commit: scans staged files"
echo "  pre-push:   scans commits about to be pushed"
