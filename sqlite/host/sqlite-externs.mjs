// The wasm side of the SQLite binding: the functions src/raw-wasm.ghul
// declares @extern, answered from Node's built-in node:sqlite. Only numbers,
// BigInts and strings cross, so each database and statement is a number this
// module keeps a table of, and the step-by-step C API is replayed over
// node:sqlite's run and iterate.
import { DatabaseSync } from "node:sqlite";

const handles = new Map();
let next_handle = 1;
let last_open_error = "";
let opened = 0;
let prepared = 0;

const SQLITE_OK = 0, SQLITE_ERROR = 1, SQLITE_MISUSE = 21, SQLITE_CANTOPEN = 14, SQLITE_ROW = 100, SQLITE_DONE = 101;

function keep(value) {
    const handle = next_handle++;
    handles.set(handle, value);
    return handle;
}

function handle_number(handle) {
    return typeof handle === "bigint" ? Number(handle) : handle;
}

function get(handle) {
    return handles.get(handle_number(handle));
}

function failed(db, error) {
    db.error = error.message;
    return error.errcode ?? SQLITE_ERROR;
}

function hex_to_bytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(2 * i, 2), 16);
    }
    return bytes;
}

function bytes_to_hex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function current(statement, index) {
    return statement.row?.[handle_number(index)] ?? null;
}

export const sqlite_externs = {
    sqlite_open(path) {
        try {
            opened = keep({ database: new DatabaseSync(path), error: "not an error", changes: 0 });
            return SQLITE_OK;
        } catch (error) {
            last_open_error = error.message;
            opened = 0;
            return SQLITE_CANTOPEN;
        }
    },
    sqlite_opened() { return BigInt(opened); },
    sqlite_close_v2(db) {
        get(db)?.database.close();
        handles.delete(handle_number(db));
        return SQLITE_OK;
    },
    sqlite_errmsg(db) { return get(db)?.error ?? last_open_error; },
    sqlite_exec(db, sql) {
        const entry = get(db);
        try {
            entry.database.exec(sql);
            return SQLITE_OK;
        } catch (error) {
            return failed(entry, error);
        }
    },
    sqlite_prepare(db, sql) {
        const entry = get(db);
        try {
            const statement = entry.database.prepare(sql);
            statement.setReadBigInts(true);
            statement.setReturnArrays(true);
            prepared = keep({ db: entry, statement, columns: statement.columns(), parameters: [], rows: null, row: null });
            return SQLITE_OK;
        } catch (error) {
            prepared = 0;
            return failed(entry, error);
        }
    },
    sqlite_prepared() { return BigInt(prepared); },
    sqlite_bind_int64(statement, index, value) { get(statement).parameters[index - 1] = value; return SQLITE_OK; },
    sqlite_bind_double(statement, index, value) { get(statement).parameters[index - 1] = value; return SQLITE_OK; },
    sqlite_bind_text(statement, index, value) { get(statement).parameters[index - 1] = value; return SQLITE_OK; },
    sqlite_bind_null(statement, index) { get(statement).parameters[index - 1] = null; return SQLITE_OK; },
    sqlite_bind_blob_hex(statement, index, hex) { get(statement).parameters[index - 1] = hex_to_bytes(hex); return SQLITE_OK; },
    sqlite_step(handle) {
        const s = get(handle);
        try {
            if (s.columns.length === 0) {
                if (s.done) return SQLITE_MISUSE;
                s.db.changes = Number(s.statement.run(...s.parameters).changes);
                s.done = true;
                return SQLITE_DONE;
            }
            s.rows ??= s.statement.iterate(...s.parameters);
            const next = s.rows.next();
            if (next.done) {
                s.row = null;
                return SQLITE_DONE;
            }
            s.row = next.value;
            return SQLITE_ROW;
        } catch (error) {
            return failed(s.db, error);
        }
    },
    sqlite_reset(handle) {
        const s = get(handle);
        s.rows?.return?.();
        s.rows = null;
        s.row = null;
        s.done = false;
        return SQLITE_OK;
    },
    sqlite_finalize(handle) { handles.delete(handle_number(handle)); return SQLITE_OK; },
    sqlite_column_count(handle) { return get(handle).columns.length; },
    sqlite_column_type(handle, index) {
        const value = current(get(handle), index);
        if (value === null) return 5;
        if (typeof value === "bigint") return 1;
        if (typeof value === "number") return 2;
        if (typeof value === "string") return 3;
        return 4;
    },
    sqlite_column_name(handle, index) { return get(handle).columns[handle_number(index)]?.name ?? null; },
    sqlite_column_int64(handle, index) { const v = current(get(handle), index); return v === null ? 0n : BigInt(v); },
    sqlite_column_double(handle, index) { const v = current(get(handle), index); return v === null ? 0 : Number(v); },
    sqlite_column_text(handle, index) { const v = current(get(handle), index); return v === null ? null : String(v); },
    sqlite_column_blob_hex(handle, index) {
        const v = current(get(handle), index);
        return v === null ? null : v instanceof Uint8Array ? bytes_to_hex(v) : bytes_to_hex(new TextEncoder().encode(String(v)));
    },
    sqlite_changes(db) { return get(db).changes; },
};

// The manifest's wasm.externs wants each function as a named export.
export const { sqlite_open, sqlite_opened, sqlite_close_v2, sqlite_errmsg, sqlite_exec, sqlite_prepare, sqlite_prepared, sqlite_bind_int64, sqlite_bind_double, sqlite_bind_text, sqlite_bind_null, sqlite_bind_blob_hex, sqlite_step, sqlite_reset, sqlite_finalize, sqlite_column_count, sqlite_column_type, sqlite_column_name, sqlite_column_int64, sqlite_column_double, sqlite_column_text, sqlite_column_blob_hex, sqlite_changes } = sqlite_externs;
