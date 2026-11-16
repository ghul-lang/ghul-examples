#!/usr/bin/env bash
# Runs the example on llvm and checks it prints run.expected. Needs ghul-cli and
# the system's zlib, which nearly every Linux has installed (see README.md).
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p build
ghul run --target llvm > build/llvm.out || true

if diff -u run.expected build/llvm.out; then
    echo "llvm: same"
else
    echo "llvm: differs"
    exit 1
fi
