// ─── Firestore, in memory ────────────────────────────────────────────────────
//
// What the demo talks to instead of the server: the same calls the data layer
// makes — `doc`, `getDocs`, `writeBatch`, `where` — answered from a map that
// lives as long as the page. `firebase/firestoreApi` sends each call here when
// the page is the demo, so `firebase/firestore.ts` runs unchanged on top of it.
//
// Only what the app uses is here, and it behaves as Firestore does where the
// app can tell the difference:
//
// - Writes land at once and their promises resolve, as a write to the local
//   cache does; the screens' optimistic edits are then confirmed exactly as
//   they are against the server.
// - An update of a document that is not there fails, and a batch is all or
//   nothing.
// - `updateDoc` reads dotted keys as paths into nested maps (`workspace.key`),
//   takes a `FieldPath` with pairs of arguments after it, and `deleteField()`
//   removes the field; `serverTimestamp()` becomes the time of the write.
// - Dates are stored as `Date`s, which every reader takes (`firestoreToDate`),
//   and anything with `toDate()` — a Firestore `Timestamp` — is turned into one.
// - What goes in and what comes out are copies, so a screen editing a row it
//   was handed cannot change the store behind the data layer's back.
//
// Not here, because nothing calls it: `orderBy`, `limit`, `onSnapshot`,
// transactions, collection groups, `set` with merge.
//
// Where it is knowingly more forgiving than production, so the demo is no place
// to reproduce a bug of that kind:
//
// - Deleting a document that is not there succeeds, as Firestore itself does —
//   but the security rules refuse it in production, and one refused delete
//   fails its whole batch (see `syncDebtCash`). Nothing here enforces rules.
// - `in` with an empty list simply matches nothing, where Firestore refuses the
//   query; and query answers come back in the order documents were stored, not
//   by document id.

type Data = Record<string, unknown>;

/** Firestore's errors carry a `code`, which the app reads. */
function firestoreError(code: string, message: string) {
  return Object.assign(new Error(message), { code, name: "FirebaseError" });
}

// ─── References ──────────────────────────────────────────────────────────────

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Twenty characters, the shape of Firestore's own ids. */
function autoId(): string {
  const bytes = new Uint8Array(20);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join("");
}

function joinPath(segments: unknown[]): string {
  const parts = segments.flatMap((s) => String(s).split("/"));
  if (parts.some((p) => p === "")) throw firestoreError("invalid-argument", `Invalid path: "${segments.join("/")}" has an empty segment.`);
  return parts.join("/");
}

export class MemoryCollectionReference {
  readonly type = "collection";
  readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  get id(): string {
    return this.path.split("/").pop()!;
  }
}

export class MemoryDocumentReference {
  readonly type = "document";
  readonly path: string;
  constructor(path: string) {
    this.path = path;
  }
  get id(): string {
    return this.path.split("/").pop()!;
  }
  get parent(): MemoryCollectionReference {
    return new MemoryCollectionReference(this.path.slice(0, this.path.lastIndexOf("/")));
  }
}

/** `collection(db, "transactions")`. The first argument — the Firestore instance — is not looked at. */
export function collection(_parent: unknown, ...segments: string[]): MemoryCollectionReference {
  const path = joinPath(segments);
  if (path.split("/").length % 2 !== 1) throw firestoreError("invalid-argument", `"${path}" is a document path, not a collection.`);
  return new MemoryCollectionReference(path);
}

/**
 * `doc(db, "users", uid)`, `doc(collectionRef, id)`, or `doc(collectionRef)`
 * for a new document under a fresh id — which is how `newDocId` makes one.
 */
export function doc(parent: unknown, ...segments: string[]): MemoryDocumentReference {
  if (parent instanceof MemoryCollectionReference) {
    const id = segments.length === 0 ? autoId() : joinPath(segments);
    return new MemoryDocumentReference(`${parent.path}/${id}`);
  }
  const path = joinPath(segments);
  if (path.split("/").length % 2 !== 0) throw firestoreError("invalid-argument", `"${path}" is a collection path, not a document.`);
  return new MemoryDocumentReference(path);
}

// ─── Special values ──────────────────────────────────────────────────────────

class Sentinel {
  readonly kind: "serverTimestamp" | "deleteField";
  constructor(kind: "serverTimestamp" | "deleteField") {
    this.kind = kind;
  }
}

export const serverTimestamp = () => new Sentinel("serverTimestamp");
export const deleteField = () => new Sentinel("deleteField");

/** `new FieldPath("syncDeletes", key)`: a path whose parts may hold dots of their own. */
export class MemoryFieldPath {
  readonly segments: string[];
  constructor(...segments: string[]) {
    if (segments.length === 0 || segments.some((s) => !s)) throw firestoreError("invalid-argument", "A field path needs non-empty names.");
    this.segments = segments;
  }
}

const hasToDate = (value: unknown): value is { toDate: () => Date } => !!value && typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function";

const isPlainObject = (value: unknown): value is Data => !!value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;

// ─── Values in and out ───────────────────────────────────────────────────────

/** A value as it is kept: sentinels resolved, Timestamps made Dates, everything copied. */
function toStored(value: unknown, now: Date, where: string): unknown {
  if (value === undefined) throw firestoreError("invalid-argument", `Unsupported field value: undefined (found in field ${where}).`);
  if (value instanceof Sentinel) {
    if (value.kind === "serverTimestamp") return new Date(now);
    throw firestoreError("invalid-argument", `deleteField() can only be used with update() (found in field ${where}).`);
  }
  if (value instanceof Date) return new Date(value.getTime());
  if (hasToDate(value)) return value.toDate();
  if (Array.isArray(value)) return value.map((item, i) => toStored(item, now, `${where}[${i}]`));
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toStored(v, now, `${where}.${k}`)]));
  return value;
}

/** A copy for a reader, so nothing it does reaches the store. */
function copyOut<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(copyOut) as T;
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copyOut(v)])) as T;
  return value;
}

function storedDocument(data: unknown, now: Date): Data {
  if (!isPlainObject(data)) throw firestoreError("invalid-argument", "Document data must be an object.");
  return toStored(data, now, "") as Data;
}

// ─── The store ───────────────────────────────────────────────────────────────

/** Collection path → document id → its fields. */
const store = new Map<string, Map<string, Data>>();

/** Whether anything has been written since the store was last filled — see `memoryTouched`. */
let touched = false;

function table(path: string): Map<string, Data> {
  let rows = store.get(path);
  if (!rows) store.set(path, (rows = new Map()));
  return rows;
}

const splitRef = (ref: MemoryDocumentReference) => ({ collectionPath: ref.parent.path, id: ref.id });

function readDocument(ref: MemoryDocumentReference): Data | undefined {
  const { collectionPath, id } = splitRef(ref);
  return store.get(collectionPath)?.get(id);
}

function writeDocument(ref: MemoryDocumentReference, data: Data | undefined) {
  const { collectionPath, id } = splitRef(ref);
  if (data === undefined) table(collectionPath).delete(id);
  else table(collectionPath).set(id, data);
}

/**
 * Empties the store and fills it again: collection name → id → fields. The
 * fields go through the same conversion as a write.
 */
export function resetMemoryFirestore(seed: Record<string, Record<string, Data>> = {}) {
  store.clear();
  touched = false;
  const now = new Date();
  for (const [collectionPath, rows] of Object.entries(seed)) {
    for (const [id, data] of Object.entries(rows)) table(collectionPath).set(id, storedDocument(data, now));
  }
}

/**
 * Whether a write has gone through since the store was filled: the visitor has
 * made the account their own, and filling it again would throw that away.
 */
export const memoryTouched = () => touched;

/** A copy of one collection's documents, by id — for tests and checks. */
export function memoryCollection(collectionPath: string): Record<string, Data> {
  return Object.fromEntries([...(store.get(collectionPath) ?? new Map<string, Data>()).entries()].map(([id, data]) => [id, copyOut(data)]));
}

// ─── Updates ─────────────────────────────────────────────────────────────────

type FieldChange = [path: string[], value: unknown];

const pathOf = (field: unknown): string[] => {
  if (field instanceof MemoryFieldPath) return field.segments;
  if (typeof field === "string" && field.split(".").every(Boolean)) return field.split(".");
  throw firestoreError("invalid-argument", `Invalid field path: ${String(field)}`);
};

/**
 * The changes an update describes. `{ "workspace.key": v }`, or a field and a
 * value followed by more pairs — `updateDoc(ref, new FieldPath(...), v, ...)`.
 */
function changesOf(dataOrField: unknown, rest: unknown[]): FieldChange[] {
  if (dataOrField instanceof MemoryFieldPath || typeof dataOrField === "string") {
    const pairs: FieldChange[] = [[pathOf(dataOrField), rest[0]]];
    if (rest.length % 2 !== 1) throw firestoreError("invalid-argument", "updateDoc() needs a value for every field.");
    for (let i = 1; i < rest.length; i += 2) pairs.push([pathOf(rest[i]), rest[i + 1]]);
    return pairs;
  }
  if (!isPlainObject(dataOrField)) throw firestoreError("invalid-argument", "updateDoc() needs an object of changes.");
  return Object.entries(dataOrField).map(([key, value]) => [pathOf(key), value]);
}

/** The document with the changes made — a new object; the one passed in is left alone. */
function applyChanges(current: Data, changes: FieldChange[], now: Date): Data {
  const next = copyOut(current);
  for (const [path, value] of changes) {
    let node: Data = next;
    for (const key of path.slice(0, -1)) {
      const child = node[key];
      if (!isPlainObject(child)) {
        // Deleting under a field that is not a map deletes nothing.
        if (value instanceof Sentinel && value.kind === "deleteField") {
          node = {};
          break;
        }
        node[key] = {};
      }
      node = node[key] as Data;
    }
    const last = path[path.length - 1];
    if (value instanceof Sentinel && value.kind === "deleteField") delete node[last];
    else node[last] = toStored(value, now, path.join("."));
  }
  return next;
}

// ─── Writes ──────────────────────────────────────────────────────────────────

type Write = { kind: "set"; ref: MemoryDocumentReference; data: Data } | { kind: "update"; ref: MemoryDocumentReference; changes: FieldChange[] } | { kind: "delete"; ref: MemoryDocumentReference };

function assertDocRef(ref: unknown): asserts ref is MemoryDocumentReference {
  if (!(ref instanceof MemoryDocumentReference)) throw firestoreError("invalid-argument", "Expected a document reference made by the demo's doc().");
}

/**
 * Applies writes all together or not at all: each is worked out against what
 * the ones before it left, and the store is only touched once every one of
 * them has gone through.
 */
function commitWrites(writes: Write[]) {
  const now = new Date();
  const staged = new Map<string, { ref: MemoryDocumentReference; data: Data | undefined }>();
  const current = (ref: MemoryDocumentReference) => (staged.has(ref.path) ? staged.get(ref.path)!.data : readDocument(ref));

  for (const write of writes) {
    if (write.kind === "set") staged.set(write.ref.path, { ref: write.ref, data: storedDocument(write.data, now) });
    else if (write.kind === "delete") staged.set(write.ref.path, { ref: write.ref, data: undefined });
    else {
      const existing = current(write.ref);
      if (!existing) throw firestoreError("not-found", `No document to update: ${write.ref.path}`);
      staged.set(write.ref.path, { ref: write.ref, data: applyChanges(existing, write.changes, now) });
    }
  }
  for (const { ref, data } of staged.values()) writeDocument(ref, data);
  if (writes.length > 0) touched = true;
}

/** A failed write rejects, as Firestore's does, rather than throwing at the caller. */
function settle<T>(work: () => T): Promise<T> {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(error);
  }
}

export function setDoc(ref: unknown, data: unknown, options?: unknown): Promise<void> {
  return settle(() => {
    assertDocRef(ref);
    if (options !== undefined) throw firestoreError("unimplemented", "setDoc() options are not supported by the demo store.");
    commitWrites([{ kind: "set", ref, data: data as Data }]);
  });
}

export function updateDoc(ref: unknown, dataOrField: unknown, ...rest: unknown[]): Promise<void> {
  return settle(() => {
    assertDocRef(ref);
    commitWrites([{ kind: "update", ref, changes: changesOf(dataOrField, rest) }]);
  });
}

export function deleteDoc(ref: unknown): Promise<void> {
  return settle(() => {
    assertDocRef(ref);
    commitWrites([{ kind: "delete", ref }]);
  });
}

export function addDoc(parent: unknown, data: unknown): Promise<MemoryDocumentReference> {
  return settle(() => {
    if (!(parent instanceof MemoryCollectionReference)) throw firestoreError("invalid-argument", "addDoc() needs a collection made by the demo's collection().");
    const ref = doc(parent);
    commitWrites([{ kind: "set", ref, data: data as Data }]);
    return ref;
  });
}

export class MemoryWriteBatch {
  private writes: Write[] = [];
  private committed = false;

  private add(write: Write) {
    if (this.committed) throw firestoreError("failed-precondition", "A write batch can no longer be used after commit() has been called.");
    this.writes.push(write);
    return this;
  }

  set(ref: unknown, data: unknown, options?: unknown) {
    assertDocRef(ref);
    if (options !== undefined) throw firestoreError("unimplemented", "set() options are not supported by the demo store.");
    return this.add({ kind: "set", ref, data: data as Data });
  }

  update(ref: unknown, dataOrField: unknown, ...rest: unknown[]) {
    assertDocRef(ref);
    return this.add({ kind: "update", ref, changes: changesOf(dataOrField, rest) });
  }

  delete(ref: unknown) {
    assertDocRef(ref);
    return this.add({ kind: "delete", ref });
  }

  commit(): Promise<void> {
    return settle(() => {
      if (this.committed) throw firestoreError("failed-precondition", "A write batch can only be committed once.");
      this.committed = true;
      commitWrites(this.writes);
    });
  }
}

// The Firestore instance it is called with is not looked at.
export const writeBatch = () => new MemoryWriteBatch();

// ─── Queries ─────────────────────────────────────────────────────────────────

type Operator = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not-in" | "array-contains" | "array-contains-any";

export class MemoryFilter {
  readonly path: string[];
  readonly op: Operator;
  readonly value: unknown;
  constructor(path: string[], op: Operator, value: unknown) {
    this.path = path;
    this.op = op;
    this.value = value;
  }
}

export class MemoryQuery {
  readonly type = "query";
  readonly collectionPath: string;
  readonly filters: MemoryFilter[];
  constructor(collectionPath: string, filters: MemoryFilter[]) {
    this.collectionPath = collectionPath;
    this.filters = filters;
  }
}

const OPERATORS = new Set<string>(["==", "!=", "<", "<=", ">", ">=", "in", "not-in", "array-contains", "array-contains-any"]);

export function where(field: unknown, op: string, value: unknown): MemoryFilter {
  if (!OPERATORS.has(op)) throw firestoreError("invalid-argument", `Invalid query operator: ${op}`);
  return new MemoryFilter(pathOf(field), op as Operator, value);
}

export function query(base: unknown, ...constraints: unknown[]): MemoryQuery {
  const filters = constraints.map((c) => {
    if (!(c instanceof MemoryFilter)) throw firestoreError("unimplemented", "Only where() is supported by the demo store.");
    return c;
  });
  if (base instanceof MemoryCollectionReference) return new MemoryQuery(base.path, filters);
  if (base instanceof MemoryQuery) return new MemoryQuery(base.collectionPath, [...base.filters, ...filters]);
  throw firestoreError("invalid-argument", "query() needs a collection or a query made by the demo store.");
}

function fieldAt(data: Data, path: string[]): { found: boolean; value: unknown } {
  let node: unknown = data;
  for (const key of path) {
    if (!isPlainObject(node) || !(key in node)) return { found: false, value: undefined };
    node = node[key];
  }
  return { found: true, value: node };
}

/** Dates and Timestamps compare by their time; other values as they are. */
const comparable = (value: unknown): unknown => (value instanceof Date ? value.getTime() : hasToDate(value) ? value.toDate().getTime() : value);

/** Firestore only orders values of one type against each other: a date is never "less than" a number. */
function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (value instanceof Date || hasToDate(value)) return "time";
  return typeof value;
}

function same(a: unknown, b: unknown): boolean {
  if (typeOf(a) !== typeOf(b)) return false;
  const x = comparable(a);
  const y = comparable(b);
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((item, i) => same(item, y[i]));
  if (isPlainObject(x) && isPlainObject(y)) {
    const keys = Object.keys(x);
    return keys.length === Object.keys(y).length && keys.every((k) => k in y && same(x[k], y[k]));
  }
  return x === y;
}

function ordered(a: unknown, b: unknown, test: (x: number | string, y: number | string) => boolean): boolean {
  const kind = typeOf(a);
  if (kind !== typeOf(b) || !["number", "string", "time"].includes(kind)) return false;
  return test(comparable(a) as number | string, comparable(b) as number | string);
}

function matches(data: Data, filter: MemoryFilter): boolean {
  const { found, value } = fieldAt(data, filter.path);
  const target = filter.value;
  if (!found) return false;
  switch (filter.op) {
    case "==":
      return same(value, target);
    case "!=":
      return value !== null && !same(value, target);
    case "<":
      return ordered(value, target, (x, y) => x < y);
    case "<=":
      return ordered(value, target, (x, y) => x <= y);
    case ">":
      return ordered(value, target, (x, y) => x > y);
    case ">=":
      return ordered(value, target, (x, y) => x >= y);
    case "in":
      return Array.isArray(target) && target.some((t) => same(value, t));
    case "not-in":
      return value !== null && Array.isArray(target) && !target.some((t) => same(value, t));
    case "array-contains":
      return Array.isArray(value) && value.some((v) => same(v, target));
    case "array-contains-any":
      return Array.isArray(value) && Array.isArray(target) && value.some((v) => target.some((t) => same(v, t)));
  }
}

// ─── Snapshots ───────────────────────────────────────────────────────────────

/** Every answer is the store's own word: nothing here is ever "from the cache". */
const METADATA = Object.freeze({ fromCache: false, hasPendingWrites: false });

export class MemoryDocumentSnapshot {
  readonly ref: MemoryDocumentReference;
  readonly metadata = METADATA;
  private readonly fields: Data | undefined;
  constructor(ref: MemoryDocumentReference, fields: Data | undefined) {
    this.ref = ref;
    this.fields = fields;
  }
  get id() {
    return this.ref.id;
  }
  exists(): boolean {
    return this.fields !== undefined;
  }
  data(): Data | undefined {
    return this.fields === undefined ? undefined : copyOut(this.fields);
  }
  get(field: unknown): unknown {
    if (this.fields === undefined) return undefined;
    return copyOut(fieldAt(this.fields, pathOf(field)).value);
  }
}

export class MemoryQuerySnapshot {
  readonly docs: MemoryDocumentSnapshot[];
  readonly metadata = METADATA;
  constructor(docs: MemoryDocumentSnapshot[]) {
    this.docs = docs;
  }
  get size() {
    return this.docs.length;
  }
  get empty() {
    return this.docs.length === 0;
  }
  forEach(callback: (doc: MemoryDocumentSnapshot) => void) {
    this.docs.forEach(callback);
  }
}

export function getDoc(ref: unknown): Promise<MemoryDocumentSnapshot> {
  return settle(() => {
    assertDocRef(ref);
    return new MemoryDocumentSnapshot(ref, readDocument(ref));
  });
}

function run(source: unknown): MemoryDocumentSnapshot[] {
  const q = source instanceof MemoryCollectionReference ? new MemoryQuery(source.path, []) : source;
  if (!(q instanceof MemoryQuery)) throw firestoreError("invalid-argument", "Expected a collection or a query made by the demo store.");
  const rows = store.get(q.collectionPath) ?? new Map<string, Data>();
  return [...rows.entries()]
    .filter(([, data]) => q.filters.every((f) => matches(data, f)))
    .map(([id, data]) => new MemoryDocumentSnapshot(new MemoryDocumentReference(`${q.collectionPath}/${id}`), data));
}

export function getDocs(source: unknown): Promise<MemoryQuerySnapshot> {
  return settle(() => new MemoryQuerySnapshot(run(source)));
}

export function getCountFromServer(source: unknown): Promise<{ data: () => { count: number } }> {
  return settle(() => {
    const count = run(source).length;
    return { data: () => ({ count }) };
  });
}
