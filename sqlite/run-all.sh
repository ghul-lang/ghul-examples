#!/usr/bin/env bash
# Runs the example on .NET, wasm and llvm and checks each prints run.expected.
# Needs the .NET SDK, ghul-cli, Node.js 22.5 or later (for node:sqlite),
# libsqlite3.so.0, and build/libsqlite3.a built for musl (see README.md).
set -euo pipefail
cd "$(dirname "$0")"

status=0

check() {
    if diff -u run.expected "$1.out"; then
        echo "$1: same"
    else
        echo "$1: differs"
        status=1
    fi
}

mkdir -p build

CI= dotnet run --project sqlite.ghulproj > build/dotnet.out 2>&1 || true
check build/dotnet

ghul run --target wasm > build/wasm.out 2>&1 || true
check build/wasm

ghul run --target llvm > build/llvm.out 2>&1 || true
check build/llvm

exit $status
