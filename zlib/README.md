# zlib from ghūl

Compression and decompression through zlib, called directly on the llvm target.
The binding is a library, `ghul-zlib`, that any llvm program can depend on, and
`main.ghul` is a program that uses it. The program is linked dynamically
against the system's zlib, so nothing has to be built first.
zlib keeps the address of its `z_stream` from one call to the next, so the
stream has to stay at one address for as long as zlib uses it. The stream and
the buffers it points into are pinned on one `Ghul.Interop.PINNER`:

```ghul
use default
use Zlib

let data = Text.Encoding.utf8.get_bytes("hello, hello, hello")

let compressed = compress(data, 9, 64)
let restored = decompress(compressed.bytes, 64)

write_line(Text.Encoding.utf8.get_string(restored.bytes))
```

`main.ghul` compresses 8800 bytes, expands them again 64 bytes at a time, prints
the Adler-32 checksum that zlib keeps in the stream, and shows the error zlib
reports for data that isn't in the zlib format. `run.expected` is its output.

## how it works

`ZStream` declares `struct z_stream_s` from `zlib.h` with `@layout("c")`, so its
fields are laid out as C lays them out, with the padding C puts after each
4-byte field. `PINNER.pin_struct` copies a `ZStream` into memory that stays at
one address until the pinner is disposed. Its `address` is what each call into
zlib takes, and its `value` reads the stream back after zlib has changed it:
how much input is left, how much room is left in the output buffer, and the
checksum.

The input and output buffers are pinned with `PINNER.pin` on the same pinner,
because the stream holds their addresses between calls. The pinner is disposed
after `deflateEnd` or `inflateEnd`, so zlib never holds an address that has
been released.

## the library

`ghul-zlib/` is a library project. Its manifest declares the C library it binds
under `llvm.native`:

```json
"llvm": {
    "native": {
        "zlib": {
            "soname": "libz.so.1",
            "version": "^1.2.11",
            "file-version": true,
            "libraries": ["z"],
            "install": { "debian": "zlib1g", "fedora": "zlib", "alpine": "zlib" }
        }
    }
}
```

A program that depends on `ghul-zlib` gets that declaration with it. When the
program is built, `ghul` finds the system's zlib, checks it is `libz.so.1` at
1.2.11 or later, and links it, so the program's own manifest says nothing about
zlib. `version()` answers the version the program is running against, which
can be newer than the one it was built against.

A program in another repository depends on the library straight from this one:

```json
"dependencies": {
    "ghul-runtime": { "version": ">=42.7.0" },
    "ghul-zlib": { "git": "https://github.com/ghul-lang/ghul-examples", "branch": "main", "directory": "zlib/ghul-zlib" }
},
"llvm": { "link-mode": "dynamic" }
```

The program here depends on it by path, as `"ghul-zlib": { "path": "ghul-zlib" }`.

## layout

| file | contents |
| --- | --- |
| `ghul-zlib/ghul-project.json` | the library's manifest, declaring zlib under `llvm.native` |
| `ghul-zlib/src/zlib.ghul` | the `@extern` declarations, `ZStream`, `compress`, `decompress` and `version` |
| `ghul-project.json` | the program's manifest: it depends on `ghul-zlib` and is linked dynamically |
| `main.ghul` | the demonstration |
| `run.sh` | builds and runs the example, and compares its output with `run.expected` |

## running it

```sh
ghul run --target llvm
./run.sh
```

### linking

The program sets `"llvm": { "link-mode": "dynamic" }`, so it is linked against
the system's glibc and zlib rather than statically against musl. Only zlib's
runtime package is needed, which nearly every Linux has installed already
(`zlib1g` on Debian and Ubuntu): not its development package, and no C
compiler. The program then needs zlib wherever it runs.

To link statically instead, so the program runs on any Linux, set `link-mode`
to `static` and give the build a zlib archive compiled for musl, in a directory
named in `llvm.library-paths`. `ghul` refuses the distribution's own `libz.a`,
which is built for glibc. To build one from zlib's sources with a musl
toolchain (`musl-gcc`, `zig cc -target x86_64-linux-musl`, or gcc in an
Alpine container):

```sh
mkdir -p build
for f in adler32 crc32 deflate inflate inffast inftrees trees zutil compress uncompr; do
    musl-gcc -O2 -fno-stack-protector -c zlib-1.3.1/$f.c -o build/$f.o
done
ar rcs build/libz.a build/*.o
```

## continuous integration

CI doesn't build or run this example: it is for the llvm target only, which
the repository's CI doesn't build. Run `./run.sh` locally after a change.
