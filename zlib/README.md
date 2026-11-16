# zlib from ghūl

Compression and decompression through zlib, called directly on the llvm target.
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

## layout

| file | contents |
| --- | --- |
| `src/zlib.ghul` | the `@extern` declarations, `ZStream`, and `compress` and `decompress` |
| `main.ghul` | the demonstration |
| `run.sh` | builds and runs the example, and compares its output with `run.expected` |

## running it

```sh
ghul run --target llvm
./run.sh
```

### the musl static archive

The llvm target links zlib statically against musl. `ghul-project.json` expects
the archive at `build/libz.a`. To build it, download zlib 1.3.1 from
<https://zlib.net> and compile its library sources with a musl toolchain
(`musl-gcc`, `zig cc -target x86_64-linux-musl`, or gcc in an Alpine container):

```sh
mkdir -p build
for f in adler32 crc32 deflate inflate inffast inftrees trees zutil compress uncompr; do
    musl-gcc -O2 -fno-stack-protector -c zlib-1.3.1/$f.c -o build/$f.o
done
ar rcs build/libz.a build/*.o
```

## continuous integration

CI doesn't build or run this example. It is for the llvm target only, and the
repository's CI image doesn't have the musl archive. Run `./run.sh` locally
after a change.
