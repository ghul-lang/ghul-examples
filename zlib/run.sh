#!/usr/bin/env bash
# Runs the example on llvm and checks it prints run.expected. Needs ghul-cli and
# build/libz.a built for musl (see README.md).
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p build
ghul run --target llvm > build/llvm.out 2>&1 || true

if diff -u run.expected build/llvm.out; then
    echo "llvm: same"
else
    echo "llvm: differs"
    exit 1
fi
