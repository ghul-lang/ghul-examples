# SQLite from ghūl

One SQLite API that runs on .NET, wasm and llvm. A program written against
`Sqlite.Connection`, `Sqlite.Statement` and `Sqlite.Row` runs unchanged on all
three targets; only the functions underneath differ.

```ghul
use IO.Std.write_line
use Sqlite.Connection

let database = Connection(":memory:")

database.exec("create table t (id integer primary key, name text)")

let insert = database.prepare("insert into t (name) values (?)")
insert.bind(1, "alice").run()
insert.dispose()

let query = database.prepare("select id, name from t")

for row in query.rows do
    write_line("{row.integer(0)} {row.text(1)}")
od

query.dispose()
database.dispose()
```

`main.ghul` is a longer demonstration: every column type, blobs, `NULL`,
the number of changed rows, and a `SqliteException` for a failed statement.
`run.expected` is its output on every target.

## layout

| file | contents |
| --- | --- |
| `src/sqlite.ghul` | the portable API, written only against `Sqlite.Raw` |
| `src/raw-dotnet.ghul` | `Sqlite.Raw` on .NET: `@extern` calls into `libsqlite3.so.0` |
| `src/raw-llvm.ghul` | `Sqlite.Raw` on llvm: `@extern` calls linked with a static `libsqlite3.a` |
| `src/raw-wasm.ghul` | `Sqlite.Raw` on wasm: `@extern` calls supplied by `host/sqlite-externs.mjs` |
| `host/sqlite-externs.mjs` | the wasm layer, written over Node's `node:sqlite` |
| `ghul-project.json` | the wasm and llvm build, through `ghul` |
| `sqlite.ghulproj` | the .NET build, through MSBuild |
| `run-all.sh` | builds and runs all three and compares each with `run.expected` |

The per-target files are marked `@IF.dotnet()`, `@IF.llvm()` and `@IF.wasm()`,
so every build is given all the files and each one compiles only its own layer.

The layers differ because the targets pass values differently. The
[`@extern` section of targets.md](https://github.com/ghul-lang/ghul/blob/main/docs/targets.md)
describes how each target calls an extern function and which types can cross.
In short:

- .NET calls the library through P/Invoke, so text and blobs come back as
  pointers that `raw-dotnet.ghul` reads with `Marshal`.
- llvm calls the C functions directly. `result = "copy"` makes the runtime copy
  the text a function returns; a blob is copied out with `memcpy`.
- wasm cannot pass references or arrays across the boundary, so database and
  statement handles are numbers, results of `open` and `prepare` are read back
  with a second call, and blobs cross as hex text.

## running it

The .NET SDK 10, `ghul` (the ghul-cli tool) and Node.js 22.5 or later are
needed. `libsqlite3.so.0` must be installed for the .NET target.

```sh
dotnet run --project sqlite.ghulproj    # .NET
ghul run --target wasm                  # wasm, through Node
ghul run --target llvm                  # llvm
./run-all.sh                            # all three, compared with run.expected
```

### the musl static archive

The llvm target links SQLite statically against musl. `ghul-project.json`
expects the archive at `build/libsqlite3.a`. To build it, download the SQLite
amalgamation from <https://sqlite.org/download.html> and compile `sqlite3.c`
with a musl toolchain (`musl-gcc`, `zig cc -target x86_64-linux-musl`, or gcc
in an Alpine container):

```sh
mkdir -p build
musl-gcc -O2 -fno-stack-protector -D_FORTIFY_SOURCE=0 -fno-builtin \
    -DSQLITE_THREADSAFE=0 -DSQLITE_OMIT_LOAD_EXTENSION -DSQLITE_DISABLE_LFS \
    -c sqlite3.c -o build/sqlite3.o
ar rcs build/libsqlite3.a build/sqlite3.o
```

`SQLITE_THREADSAFE=0` suits a program that doesn't share a connection between
threads.

## continuous integration

CI builds the .NET layer with the rest of the examples, so a change that no
longer compiles is caught. CI doesn't run the example: the llvm target needs
the musl archive above, and the repository's CI image has neither it nor Node's
`node:sqlite`. Run `./run-all.sh` locally after a change.
