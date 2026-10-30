---
id: m09-jsonb
title: PostgreSQL JSONB
module: m09
level: intermediate
status: reviewed
template: lesson
minutes: 75
prerequisites: [m09-relational-fundamentals, m09-normalization, m09-indexes]
related: [m09-relational-vs-document, m09-query-planning, m09-migrations-evolution, m09-partitioning-sharding]
tags: [hld, database, postgresql, jsonb, gin, semi-structured]
patterns: []
summary: How PostgreSQL stores and queries JSON documents with jsonb — the operators, SQL/JSON path, GIN and expression indexes — and a practical rule for when a field belongs in a column instead.
references:
  - title: "PostgreSQL 17 documentation — JSON types"
    url: https://www.postgresql.org/docs/17/datatype-json.html
  - title: "PostgreSQL 17 documentation — JSON functions and operators"
    url: https://www.postgresql.org/docs/17/functions-json.html
  - title: "PostgreSQL 17 documentation — GIN indexes"
    url: https://www.postgresql.org/docs/17/gin.html
  - title: "Npgsql documentation — JSON mapping"
    url: https://www.npgsql.org/doc/types/json.html
---

Relational tables are perfect when every row has the same shape. Real data is not always that polite: a phone has a colour and storage size, a laptop has RAM and a screen size, a TV has a panel type and a resolution. PostgreSQL's `jsonb` type lets one column hold a JSON document per row, query inside it, and index it. Used well, it removes dozens of nullable columns and painful "attribute" tables. Used badly, it hides your data model inside a blob the planner cannot reason about. This lesson shows both.

## Learning objectives

By the end of this lesson you will be able to:

1. Explain the difference between `json` and `jsonb` and why `jsonb` is the default choice.
2. Read and filter documents with `->`, `->>`, `#>>`, `@>`, `?`, `?|`, `?&` and SQL/JSON path (`@?`, `JSON_VALUE`, `JSON_TABLE`).
3. Update documents with `jsonb_set`, `||` and `-`, and explain why every update rewrites the whole value.
4. Choose between a GIN index (`jsonb_ops` or `jsonb_path_ops`), an expression B-tree index, and a generated column.
5. Decide, with a checklist, whether a field belongs in a real column, in `jsonb`, or in a separate table.
6. Validate and query `jsonb` safely from C# with parameters, never string concatenation.

## Prerequisites

- [Relational database fundamentals](#/lesson/m09-relational-fundamentals): tables, columns, types.
- [Normalization and denormalization](#/lesson/m09-normalization): a document column is a controlled denormalization.
- [Indexes](#/lesson/m09-indexes): B-tree indexes and how the planner chooses them.

## Explain it like I'm a beginner

Think of an electronics shop's stock register. Every item has the same few boxes at the front of the row: item code, name, category, price. Those are **columns**. But each category also needs its own details. For phones: colour and storage. For laptops: RAM and screen size. For TVs: panel type and resolution. If you add a box for every possible detail, the register gets 60 boxes per row and most are empty.

So the shopkeeper staples a small **note card** to each row with just the details that item needs: `{"colour": "Black", "storage_gb": 256}`. That card is a JSON document, and the column that holds it is a `jsonb` column.

PostgreSQL can read these cards for you ("show me all silver laptops") and can even build an **index of the cards**, like a back-of-the-book index listing which rows have `"panel": "OLED"`. That index is called a **GIN index** (Generalized Inverted Index).

The catch: the front boxes are checked by the database (a price must be a number, a category must exist), while the cards can contain anything, including typos like `"colur"`. And the database knows a lot about the front boxes (how many rows have each value) but very little about what is inside the cards, so it guesses when planning queries. The rule of thumb: **things every row has, things you join on, and things you sort and total by belong in columns. Things that vary by row belong on the card.**

## First-principles explanation

### json versus jsonb

PostgreSQL has two JSON types:

- `json` stores the **text** exactly as given: whitespace, key order, even duplicate keys. Every query re-parses it.
- `jsonb` stores a **decomposed binary** form: keys are sorted and de-duplicated (the last duplicate wins), whitespace is gone, numbers are stored as `numeric`. Reading a key does not need re-parsing, and it supports containment operators and indexes.

Use `jsonb` unless you must preserve the exact original text (for example, a signed webhook payload whose signature covers the raw bytes; even then, store the raw body as `text` or `bytea` and a parsed `jsonb` copy beside it).

### Reading values

| Operator | Meaning | Example on `{"type":"split","star_rating":5,"warranty_years":{"compressor":10}}` | Result type |
|---|---|---|---|
| `->` | get key (or array index) as jsonb | `attrs -> 'star_rating'` → `5` | jsonb |
| `->>` | get key as text | `attrs ->> 'type'` → `split` | text |
| `#>` / `#>>` | get by path | `attrs #>> '{warranty_years,compressor}'` → `10` | jsonb / text |
| `@>` | left contains right | `attrs @> '{"type":"split"}'` → true | boolean |
| `<@` | left is contained in right | | boolean |
| `?` | key exists at top level | `attrs ? 'dolby_vision'` | boolean |
| `?|` / `?&` | any / all of these keys exist | `attrs ?| array['anc','fit']` | boolean |
| `@?` / `@@` | SQL/JSON path exists / matches | `attrs @? '$.warranty_years.compressor ? (@ >= 10)'` | boolean |

Two traps catch everyone once:

1. `->>` returns **text**. `attrs ->> 'ram_gb' >= '16'` compares strings, and `'8' >= '16'` is true. Cast: `(attrs ->> 'ram_gb')::int >= 16`. A row whose value is not a number makes the cast fail for the whole query, so validate on write.
2. A missing key and a JSON `null` both give SQL `NULL` from `->>`. If the difference matters, test with `?` or `jsonb_typeof`.

**Containment** (`@>`) is the most important operator because GIN indexes support it. Its rules: an object contains another if every key on the right exists on the left with a containing value; an array contains another if every element on the right is contained by *some* element on the left (order and duplicates do not matter); scalars must be equal. So `'{"certifications":["BIS","RoHS"]}' @> '{"certifications":["RoHS"]}'` is true.

PostgreSQL 17 added the SQL-standard query functions `JSON_VALUE`, `JSON_QUERY`, `JSON_EXISTS` and `JSON_TABLE`. `JSON_TABLE` turns a document into rows and columns, which is handy for reporting:

```sql
SELECT p.sku, j.*
FROM products p,
     JSON_TABLE(p.attrs, '$' COLUMNS (
        ac_type          text PATH '$.type',
        compressor_years int  PATH '$.warranty_years.compressor')) AS j
WHERE p.category = 'acs';
```

### Writing values

```sql
-- Replace or add one path:
UPDATE products SET attrs = jsonb_set(attrs, '{panel}', '"QLED"') WHERE sku = 'TV-LED-43';
-- Merge keys (right side wins):
UPDATE products SET attrs = attrs || '{"dolby_vision": true}' WHERE sku = 'TV-OLED-55';
-- Remove a key, or a nested path:
UPDATE products SET attrs = attrs - 'anc' WHERE sku = 'HP-OE-50H';
UPDATE products SET attrs = attrs #- '{warranty_years,product}' WHERE sku = 'AC-SP-15';
```

PostgreSQL rows are immutable versions (MVCC), and `jsonb` values are stored as one unit. Changing one key **writes a new copy of the whole document** and a new row version. For a 200-byte attribute card that is nothing. For a 40 KB document that is stored out of line (TOAST, used for values over about 2 KB), updating a counter inside it 50 times a second rewrites 2 MB/s of TOAST data plus WAL, and every write rewrites the GIN index entries too. A frequently changing value belongs in its own column.

### Indexing jsonb

**GIN with `jsonb_ops` (the default)** indexes every key and every value separately. It supports `@>`, `?`, `?|`, `?&`, `@?` and `@@`. It is the most flexible and the largest.

**GIN with `jsonb_path_ops`** indexes a hash of each *path-to-value*. It supports only `@>`, `@?` and `@@`, not key-existence. It is usually noticeably smaller and faster for containment, because a lookup for `{"colour":"Silver"}` probes one hash instead of intersecting "has key colour" with "has value Silver".

```sql
CREATE INDEX products_attrs_gin ON products USING gin (attrs jsonb_path_ops);
```

**Expression B-tree index** on one extracted value, for equality, ranges and sorting on a hot key:

```sql
CREATE INDEX products_ram ON products (((attrs ->> 'ram_gb')::numeric)) WHERE category = 'laptops';
```

The query must use the *same expression* (including the same cast, `::numeric` here because that is what the search code below generates) and imply the same `WHERE category = 'laptops'` predicate to match it. A bonus: PostgreSQL collects statistics on indexed expressions, so the planner's row estimates for that key improve.

**Generated column**: when a key is so important that you sort, join or group by it constantly, promote it:

```sql
ALTER TABLE products ADD COLUMN colour text GENERATED ALWAYS AS (attrs ->> 'colour') STORED;
CREATE INDEX ON products (colour);
```

The document stays the single source of truth, and the column is always in sync. (Adding a stored generated column rewrites the table, so on a big table follow [Migrations and schema evolution](#/lesson/m09-migrations-evolution).)

GIN trade-offs: GIN indexes are slower to update than B-trees. PostgreSQL softens this with a "pending list" (`fastupdate`) that batches new entries, which makes inserts cheaper and some searches slower until the list is merged by vacuum. On a write-heavy table, measure.

### The planner knows little about jsonb

PostgreSQL keeps detailed statistics per column (most common values, histograms). For a `jsonb` column it treats the whole document as one value, so for `attrs @> '{"panel":"LED"}'` it uses a fixed default selectivity guess. On a 5-million-row catalogue where 40 % of TVs are LED, the planner may expect a few thousand rows, choose a nested loop, and be wrong by a factor of 1,000. Remedies: expression indexes (which carry their own statistics), generated columns, or extended statistics on expressions (`CREATE STATISTICS ... ON ((attrs ->> 'panel')) FROM products`).

### When to use jsonb, and when not to

Use `jsonb` for:

- **Sparse, variable attributes**: product specifications per category, device settings per device model.
- **Data owned by someone else**: webhook payloads, API responses you archive, GST e-invoice responses. Store as received, extract the few fields you query into columns.
- **Per-tenant custom fields** in a SaaS product, where each customer defines their own fields.
- **Small value objects** always read and written together (a delivery address snapshot on an order).

Prefer real columns (or tables) for:

- Anything you **join on** or that should be a **foreign key**. `jsonb` cannot reference another table.
- Anything that must be **NOT NULL, unique or checked** in every row: price, status, tenant id.
- Values you **aggregate, sort or range-filter** constantly: amounts, dates, quantities.
- Values that **change often** independently of the rest of the document.
- **Repeating groups that grow without bound**: an order's lines, a ticket's comments. Arrays inside a document make every append rewrite the whole thing; use a child table.

A simple test: *if you would add a CHECK constraint, a foreign key or a dedicated index for it, it is a column.*

### What breaks first under load

1. **Planner misestimates** on document predicates, leading to bad join orders. Shows up as a query that is fast for one filter value and slow for another.
2. **Write amplification** on large, frequently updated documents: WAL volume, TOAST churn, GIN maintenance, and replica lag.
3. **Data quality drift**: two clients spell the key differently (`storage_gb` versus `storageGb`), numbers arrive as strings, and every query must defend against it. Validate on write.
4. **Index bloat**: a `jsonb_ops` GIN index over large, varied documents can rival the table in size.

### When a simpler design is enough

If you have five categories and their attributes are stable, five nullable columns or one small table per category may be clearer than a document. If attributes are only *displayed* and never filtered, store them as `jsonb` with no index at all. Indexes are for queries you actually run.

## Visual explanation

### Where each piece of data lives

```mermaid
flowchart LR
    C["Seller portal and buyer app"] --> API["Catalogue API (ASP.NET Core)"]
    API --> V["Attribute validator per category"]
    V --> T["products table"]
    T --> COL["Columns: id, sku, category, price_paise, seller_id (FK)"]
    T --> DOC["attrs jsonb: colour, storage_gb, ram_gb, panel ..."]
    DOC --> GIN["GIN index, jsonb_path_ops: containment filters"]
    DOC --> EXP["Expression B-tree: ram_gb as numeric"]
    DOC --> GEN["Generated column colour + B-tree"]
    API --> Q["Search query: columns AND attrs containment"]
    Q --> GIN
    Q --> EXP
```

Requests come from sellers (writes) and buyers (searches) into one API. Every write passes the per-category validator before it reaches PostgreSQL, so the document has a known shape even though the database does not enforce one. Inside the table, the fixed, constrained, joined fields are real columns, including the seller foreign key. The variable specifications live in `attrs`. Three different indexes serve three query shapes: the GIN index answers "has these exact attribute values" filters, the expression index answers range filters on RAM, and the generated `colour` column gives a cheap, well-estimated B-tree for the most common facet. The search query combines a column filter (category) with document filters, and the planner can combine indexes with a bitmap AND.

### A filtered search request

```mermaid
sequenceDiagram
    participant B as Buyer app
    participant API as Catalogue API
    participant PG as PostgreSQL
    B->>API: GET /products?category=laptops&colour=Silver&minRam_gb=16
    API->>API: check keys against the laptops schema, reject unknown filters
    API->>API: build containment JSON {"colour":"Silver"} as a parameter
    API->>PG: SELECT ... WHERE category = $1 AND attrs @> $2 AND (attrs->>'ram_gb')::numeric >= $3
    PG->>PG: Bitmap Index Scan on products_attrs_gin, recheck rows
    PG-->>API: 2 rows
    API-->>B: 200 OK with 2 products
```

The API first checks every filter key against the category schema, so a buyer cannot filter by an arbitrary key or inject SQL. Equality filters are merged into one JSON object and sent as a single **parameter** to `@>`, which the GIN index serves. The range filter uses the same extraction expression as the expression index, again with the value as a parameter. PostgreSQL scans the GIN index into a bitmap of candidate pages, rechecks those rows (GIN results can be lossy), applies the range condition and returns two rows. At no point is user input concatenated into SQL text.

## Step-by-step example

An electronics marketplace lists 20 products across phones, laptops, TVs, headphones and air conditioners (the same seed as the playground). Product managers want filtered search, sellers want to add new attribute types without a migration, and finance wants prices to stay exact.

### Step 1 — split columns from the document

```sql
CREATE TABLE products (
  id          bigint PRIMARY KEY,
  sku         text   NOT NULL UNIQUE,
  name        text   NOT NULL,
  category    text   NOT NULL,
  price_paise bigint NOT NULL CHECK (price_paise > 0),
  attrs       jsonb  NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attrs) = 'object')
);
```

Price, category and SKU are in every row, are constrained, and are used for sorting and totals: columns. Everything category-specific is in `attrs`. The `CHECK` guarantees the document is an object, not an array or a bare string.

### Step 2 — read values

```sql
SELECT sku, attrs ->> 'colour' AS colour, (attrs ->> 'storage_gb')::int AS storage_gb
FROM products
WHERE category = 'phones' AND attrs ->> 'colour' = 'Black';
```

Returns `PHN-NV-256` (256 GB) and `PHN-OR-64` (64 GB).

### Step 3 — filter with containment and add the GIN index

```sql
CREATE INDEX products_attrs_gin ON products USING gin (attrs jsonb_path_ops);

SELECT sku FROM products WHERE attrs @> '{"colour": "Silver"}';
```

With 20 rows the planner will still pick a sequential scan (correctly: reading one page is cheaper than any index). Run `SET enable_seqscan = off` in the playground and `EXPLAIN` again to see `Bitmap Index Scan on products_attrs_gin`. On a million-row catalogue the planner picks it by itself.

### Step 4 — range filters need casts

```sql
SELECT sku FROM products
WHERE attrs @> '{"colour": "Silver"}'
  AND (attrs ->> 'ram_gb')::int >= 16;
```

Returns `LAP-NA-16` and `LAP-NP-32`. Without the cast, the text comparison `'8' >= '16'` would wrongly include the 8 GB laptop.

### Step 5 — arrays

Certifications are an array. Count products per certification:

```sql
SELECT c AS certification, count(*) AS products
FROM products, jsonb_array_elements_text(attrs -> 'certifications') AS c
GROUP BY c ORDER BY products DESC, c;
```

BIS 10, RoHS 3, CE 2, MIL-STD-810 2. Products without the key simply produce no rows. Filtering "has CE" is containment: `attrs @> '{"certifications": ["CE"]}'`, which the GIN index serves.

### Step 6 — promote a hot key

Analytics shows 70 % of searches filter or facet by `colour`. Promote it:

```sql
ALTER TABLE products ADD COLUMN colour text GENERATED ALWAYS AS (attrs ->> 'colour') STORED;
CREATE INDEX products_colour ON products (colour);
```

Facet counts (`GROUP BY colour`) now read a narrow indexed column with real statistics.

### Step 7 — the C# side

With Npgsql, `jsonb` maps to `string`, `JsonDocument`, `JsonNode` or your own POCOs via System.Text.Json. With EF Core 10, an owned or complex type can be mapped to a JSON column with `.ToJson()`, and LINQ over its properties translates to `->>` expressions. Always pass documents as parameters:

```csharp
// Npgsql: the filter document is a parameter, never concatenated into SQL.
await using var cmd = dataSource.CreateCommand(
    "SELECT sku, name FROM products WHERE category = $1 AND attrs @> $2");
cmd.Parameters.AddWithValue("laptops");
cmd.Parameters.Add(new NpgsqlParameter { Value = """{"colour":"Silver"}""", NpgsqlDbType = NpgsqlDbType.Jsonb });
```

## Production-style C# implementation

The catalogue service validates attribute documents per category on write and builds parameterised search SQL from whitelisted filters on read. The store is behind an interface; the in-memory version implements `@>` semantics over `JsonNode` so the logic can be tested without PostgreSQL.

```text
Catalog.Api/
  Program.cs
  Attributes/CategorySchema.cs
  Attributes/AttributeValidator.cs
  Attributes/JsonContains.cs
  Search/ProductSearch.cs
  Search/ProductStore.cs
```

```csharp file=Attributes/CategorySchema.cs
namespace Catalog.Attributes;

public enum AttrType { Text, Integer, Number, Boolean, TextArray, IntegerArray, Object }

public sealed record AttrRule(string Key, AttrType Type, bool Required = false, bool Filterable = false, bool RangeFilterable = false);

/// <summary>The shape of attrs for one category. Lives in code or a config table, versioned like any schema.</summary>
public sealed record CategorySchema(string Category, IReadOnlyList<AttrRule> Rules)
{
    public AttrRule? Find(string key) => Rules.FirstOrDefault(r => r.Key == key);
}

public static class Schemas
{
    public static readonly IReadOnlyDictionary<string, CategorySchema> All = new Dictionary<string, CategorySchema>
    {
        ["phones"] = new("phones", new[]
        {
            new AttrRule("colour", AttrType.Text, Required: true, Filterable: true),
            new AttrRule("storage_gb", AttrType.Integer, Required: true, Filterable: true, RangeFilterable: true),
            new AttrRule("certifications", AttrType.TextArray, Filterable: true),
        }),
        ["laptops"] = new("laptops", new[]
        {
            new AttrRule("colour", AttrType.Text, Filterable: true),
            new AttrRule("ram_gb", AttrType.Integer, Filterable: true, RangeFilterable: true),
            new AttrRule("screen_in", AttrType.Number),
            new AttrRule("certifications", AttrType.TextArray, Filterable: true),
        }),
        ["tvs"] = new("tvs", new[]
        {
            new AttrRule("resolution", AttrType.IntegerArray, Required: true),
            new AttrRule("panel", AttrType.Text, Required: true, Filterable: true),
            new AttrRule("weight_kg", AttrType.Number),
            new AttrRule("dolby_vision", AttrType.Boolean, Filterable: true),
        }),
    };
}
```

```csharp file=Attributes/AttributeValidator.cs
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Catalog.Attributes;

/// <summary>Validates an attrs document against its category schema before it is written.
/// The database only checks that attrs is an object; this is where the real shape is enforced.</summary>
public static class AttributeValidator
{
    // Keeps documents small. Values over about 2 KB are compressed and may be moved out of line (TOAST),
    // which makes every update of the document more expensive.
    public const int MaxDocumentBytes = 4096;

    public static IReadOnlyList<string> Validate(CategorySchema schema, JsonObject attrs)
    {
        var errors = new List<string>();
        if (System.Text.Encoding.UTF8.GetByteCount(attrs.ToJsonString()) > MaxDocumentBytes) errors.Add($"attrs is larger than {MaxDocumentBytes} bytes");

        foreach (var rule in schema.Rules.Where(r => r.Required))
            if (!attrs.ContainsKey(rule.Key) || attrs[rule.Key] is null) errors.Add($"'{rule.Key}' is required");

        foreach (var (key, value) in attrs)
        {
            var rule = schema.Find(key);
            if (rule is null) { errors.Add($"'{key}' is not an attribute of {schema.Category}"); continue; }
            if (value is null) continue;
            if (!HasType(value, rule.Type)) errors.Add($"'{key}' must be {rule.Type}");
        }
        return errors;
    }

    private static bool HasType(JsonNode node, AttrType type) => type switch
    {
        AttrType.Text => Kind(node) == JsonValueKind.String,
        AttrType.Integer => Kind(node) == JsonValueKind.Number && node.AsValue().TryGetValue<long>(out _),
        AttrType.Number => Kind(node) == JsonValueKind.Number,
        AttrType.Boolean => Kind(node) is JsonValueKind.True or JsonValueKind.False,
        AttrType.Object => node is JsonObject,
        AttrType.TextArray => node is JsonArray a && a.All(e => e is not null && Kind(e) == JsonValueKind.String),
        AttrType.IntegerArray => node is JsonArray a2 && a2.All(e => e is not null && Kind(e) == JsonValueKind.Number && e.AsValue().TryGetValue<long>(out _)),
        _ => false
    };

    private static JsonValueKind Kind(JsonNode node) => node.GetValueKind();
}
```

```csharp file=Attributes/JsonContains.cs
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Catalog.Attributes;

/// <summary>In-memory model of PostgreSQL's jsonb @> operator, used by the fake store and tests.</summary>
public static class JsonContains
{
    public static bool Contains(JsonNode? left, JsonNode? right)
    {
        if (right is null) return left is null;
        if (left is null) return false;

        return (left, right) switch
        {
            (JsonObject l, JsonObject r) => r.All(kv => l.TryGetPropertyValue(kv.Key, out var lv) && Contains(lv, kv.Value)),
            (JsonArray l, JsonArray r) => r.All(re => l.Any(le => Contains(le, re))),
            (JsonArray l, JsonValue r) => l.Any(le => le is JsonValue lv && ScalarEquals(lv, r)),   // top-level array contains a scalar
            (JsonValue l, JsonValue r) => ScalarEquals(l, r),
            _ => false
        };
    }

    private static bool ScalarEquals(JsonValue a, JsonValue b)
    {
        var ka = a.GetValueKind();
        var kb = b.GetValueKind();
        if (ka != kb) return false;
        return ka switch
        {
            JsonValueKind.Number => a.GetValue<decimal>() == b.GetValue<decimal>(),   // 12 and 12.0 are equal in jsonb
            JsonValueKind.String => a.GetValue<string>() == b.GetValue<string>(),
            _ => true   // true/true, false/false, null/null
        };
    }
}
```

```csharp file=Search/ProductSearch.cs
using System.Text.Json.Nodes;
using Catalog.Attributes;

namespace Catalog.Search;

public sealed record SqlQuery(string Text, IReadOnlyList<object> Parameters);

public sealed class InvalidFilterException(string message) : Exception(message);

/// <summary>Turns ?colour=Silver&amp;minRam_gb=16 into parameterised SQL. Keys are whitelisted by the schema,
/// so user input never becomes SQL text. Equality filters merge into one @> document for the GIN index.</summary>
public static class ProductSearch
{
    public static (JsonObject Exact, List<(string Key, decimal Min)> Ranges) Parse(CategorySchema schema, IReadOnlyDictionary<string, string> query)
    {
        var eq = new JsonObject();
        var ranges = new List<(string, decimal)>();
        foreach (var (rawKey, raw) in query)
        {
            if (rawKey.StartsWith("min", StringComparison.Ordinal))
            {
                var key = char.ToLowerInvariant(rawKey[3]) + rawKey[4..];
                var rule = schema.Find(key);
                if (rule is not { RangeFilterable: true }) throw new InvalidFilterException($"Cannot range-filter on '{key}'.");
                if (!decimal.TryParse(raw, System.Globalization.CultureInfo.InvariantCulture, out var min))
                    throw new InvalidFilterException($"'{rawKey}' must be a number.");
                ranges.Add((key, min));
                continue;
            }

            var r = schema.Find(rawKey);
            if (r is not { Filterable: true }) throw new InvalidFilterException($"Cannot filter on '{rawKey}'.");
            eq[rawKey] = r.Type switch
            {
                AttrType.Integer when long.TryParse(raw, out var n) => JsonValue.Create(n),
                AttrType.Boolean when bool.TryParse(raw, out var b) => JsonValue.Create(b),
                AttrType.TextArray => new JsonArray(JsonValue.Create(raw)),     // "has this certification"
                AttrType.Text => JsonValue.Create(raw),
                _ => throw new InvalidFilterException($"'{rawKey}' has the wrong type.")
            };
        }
        return (eq, ranges);
    }

    public static SqlQuery ToSql(string category, JsonObject equals, IReadOnlyList<(string Key, decimal Min)> ranges, int limit)
    {
        var sql = new System.Text.StringBuilder("SELECT id, sku, name, price_paise, attrs FROM products WHERE category = $1");
        var ps = new List<object> { category };
        if (equals.Count > 0)
        {
            ps.Add(equals.ToJsonString());
            sql.Append($" AND attrs @> ${ps.Count}::jsonb");
        }
        foreach (var (key, min) in ranges)
        {
            // The key is from the schema whitelist. Writing it as a literal lets an expression index on
            // ((attrs ->> 'ram_gb')::numeric) match. The value is still a parameter.
            ps.Add(min);
            sql.Append($" AND (attrs ->> '{key}')::numeric >= ${ps.Count}");
        }
        ps.Add(limit);
        sql.Append($" ORDER BY price_paise, id LIMIT ${ps.Count}");
        return new SqlQuery(sql.ToString(), ps);
    }
}
```

```csharp file=Search/ProductStore.cs
using System.Text.Json.Nodes;
using Catalog.Attributes;

namespace Catalog.Search;

public sealed record Product(long Id, string Sku, string Name, string Category, long PricePaise, JsonObject Attrs);

public interface IProductStore
{
    Task AddAsync(Product p, CancellationToken ct);
    Task<IReadOnlyList<Product>> SearchAsync(string category, JsonObject equals, IReadOnlyList<(string Key, decimal Min)> ranges, int limit, CancellationToken ct);
}

/// <summary>Fake store with the same semantics as the SQL from ProductSearch.ToSql.</summary>
public sealed class InMemoryProductStore : IProductStore
{
    private readonly List<Product> _rows = new();

    public Task AddAsync(Product p, CancellationToken ct) { _rows.Add(p); return Task.CompletedTask; }

    public Task<IReadOnlyList<Product>> SearchAsync(string category, JsonObject equals, IReadOnlyList<(string Key, decimal Min)> ranges, int limit, CancellationToken ct)
    {
        var q = _rows.Where(p => p.Category == category && JsonContains.Contains(p.Attrs, equals));
        foreach (var (key, min) in ranges)
            q = q.Where(p => p.Attrs[key] is JsonValue v && v.TryGetValue<decimal>(out var d) && d >= min);
        IReadOnlyList<Product> result = q.OrderBy(p => p.PricePaise).ThenBy(p => p.Id).Take(limit).ToList();
        return Task.FromResult(result);
    }
}
```

```csharp file=Program.cs
using System.Text.Json.Nodes;
using Catalog.Attributes;
using Catalog.Search;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<IProductStore, InMemoryProductStore>();
var app = builder.Build();

app.MapPost("/products", async (ProductInput input, IProductStore store, CancellationToken ct) =>
{
    if (!Schemas.All.TryGetValue(input.Category, out var schema))
        return Results.Problem($"Unknown category '{input.Category}'.", statusCode: 400);
    var errors = AttributeValidator.Validate(schema, input.Attrs);
    if (errors.Count > 0) return Results.ValidationProblem(new Dictionary<string, string[]> { ["attrs"] = errors.ToArray() });

    var p = new Product(input.Id, input.Sku, input.Name, input.Category, input.PricePaise, input.Attrs);
    await store.AddAsync(p, ct);
    return Results.Created($"/products/{p.Id}", p);
});

app.MapGet("/products", async (HttpRequest req, IProductStore store, CancellationToken ct) =>
{
    var category = req.Query["category"].ToString();
    if (!Schemas.All.TryGetValue(category, out var schema)) return Results.Problem("Unknown category.", statusCode: 400);
    var filters = req.Query.Where(kv => kv.Key != "category").ToDictionary(kv => kv.Key, kv => kv.Value.ToString());
    try
    {
        var (eq, ranges) = ProductSearch.Parse(schema, filters);
        var rows = await store.SearchAsync(category, eq, ranges, 50, ct);
        return Results.Ok(rows);
    }
    catch (InvalidFilterException ex)
    {
        return Results.Problem(ex.Message, statusCode: 400);
    }
});

app.Run();

public sealed record ProductInput(long Id, string Sku, string Name, string Category, long PricePaise, JsonObject Attrs);
```

**Design notes.**

- The validator is the schema the database does not have. It rejects unknown keys (catching `"colur"` typos), wrong types (RAM sent as the string `"16"`), missing required keys, and oversized documents.
- Search keys come from the schema whitelist, and every value is a parameter. The only identifiers written into SQL text are whitelisted key names, written as literals on purpose so expression indexes can match.
- Equality filters merge into one `@>` document, which a single GIN probe answers. Range filters use the same expression as the expression index.
- The in-memory `JsonContains` mirrors PostgreSQL's containment rules, including "array contains element regardless of order", so unit tests describe the same behaviour as production SQL.

:::callout type=warning title="Never build JSON filters by string concatenation"
`$"... WHERE attrs @> '{{\"colour\":\"{colour}\"}}'"` lets a user close the quote and inject SQL. Build a `JsonObject`, serialise it, and pass it as a `jsonb` parameter.
:::

## Bad design vs good design

**Bad**: `CREATE TABLE products (id bigint PRIMARY KEY, data jsonb)`. Price, category, seller id and stock all live inside `data`. Finance's monthly sales total casts `(data ->> 'price')::numeric` across 5 million rows and fails on the first row where a seller sent `"₹24,999"`. There is no foreign key to sellers, so deleted sellers leave orphan products. Stock is decremented inside the document on every order, rewriting a 6 KB TOASTed value and its GIN entries thousands of times an hour. The planner estimates every `data @> ...` filter with the same constant and picks a nested loop that runs for 40 seconds on popular categories.

**Good**: constrained columns for what every row has (`sku`, `category`, `price_paise`, `seller_id` with a foreign key), stock in its own column or table, `attrs jsonb` for category specifications, validated on write, a `jsonb_path_ops` GIN index for facet filters, and an expression index or generated column for the one or two keys that need ranges and statistics.

**But**: a team that ingests 30 different partner webhook formats and only ever reads them back by `event_id` should not model 30 schemas. Store each payload as `jsonb` with `event_id`, `partner`, `received_at` columns, and no GIN index at all. Extract a field into a column only when a query needs it.

:::callout type=tradeoff title="Column vs jsonb vs child table"
| Need | Column | jsonb key | Child table |
|---|---|---|---|
| Same in every row, constrained | best | weak (CHECK on expressions) | n/a |
| Varies by row or tenant | many NULLs | best | EAV is painful |
| Foreign key / join | best | not possible | best |
| Range, sort, aggregate | best | cast + expression index | good |
| Changes often | best | rewrites whole document | good |
| Unbounded repeating group | n/a | rewrites on every append | best |
| Planner statistics | full | none unless expression index | full |
:::

## Practical playground

Twenty electronics products with category-specific attributes and a `jsonb_path_ops` GIN index. Try the commented queries, then switch off sequential scans to see the GIN index in the plan.

:::playground type=sql title="Querying and indexing a product catalogue"
```sql
CREATE TABLE products (
  id          bigint PRIMARY KEY,
  sku         text   NOT NULL UNIQUE,
  name        text   NOT NULL,
  category    text   NOT NULL,
  price_paise bigint NOT NULL,
  attrs       jsonb  NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attrs) = 'object')
);
INSERT INTO products VALUES
 (1,  'PHN-NV-256', 'Nova 5G 256 GB, Black',                  'phones',    2499900,  '{"colour":"Black","storage_gb":256,"certifications":["BIS","CE"]}'),
 (2,  'PHN-NV-128', 'Nova 5G 128 GB, Blue',                   'phones',    2299900,  '{"colour":"Blue","storage_gb":128,"certifications":["BIS"]}'),
 (3,  'PHN-OR-128', 'Orbit 5G 128 GB, Green',                 'phones',    1999900,  '{"colour":"Green","storage_gb":128,"certifications":["BIS","RoHS"]}'),
 (4,  'PHN-OR-64',  'Orbit 4G 64 GB, Black',                  'phones',    1199900,  '{"colour":"Black","storage_gb":64,"certifications":["BIS"]}'),
 (5,  'LAP-NA-8',   'NoteBook Air 14, 8 GB, Silver',          'laptops',   4299000,  '{"colour":"Silver","ram_gb":8,"screen_in":14,"certifications":["BIS"]}'),
 (6,  'LAP-NA-16',  'NoteBook Air 14, 16 GB, Silver',         'laptops',   5499000,  '{"colour":"Silver","ram_gb":16,"screen_in":14,"certifications":["BIS","MIL-STD-810"]}'),
 (7,  'LAP-PB-16',  'ProBook 15, 16 GB, Grey',                'laptops',   6899000,  '{"colour":"Grey","ram_gb":16,"screen_in":15.6,"certifications":["BIS","MIL-STD-810"]}'),
 (8,  'LAP-NP-32',  'NoteBook Pro 16, 32 GB, Silver',         'laptops',   12499000, '{"colour":"Silver","ram_gb":32,"screen_in":16,"certifications":["BIS"]}'),
 (9,  'LAP-PB-32',  'ProBook 16, 32 GB, Grey',                'laptops',   13999000, '{"colour":"Grey","ram_gb":32,"screen_in":16}'),
 (10, 'TV-LED-43',  'Vista 43-inch Full HD LED TV',           'tvs',       2499000,  '{"resolution":[1920,1080],"panel":"LED","weight_kg":6.5,"certifications":["RoHS"]}'),
 (11, 'TV-OLED-55', 'Vista 55-inch 4K OLED TV',               'tvs',       11999000, '{"resolution":[3840,2160],"panel":"OLED","weight_kg":18.6}'),
 (12, 'TV-LED-32',  'Vista 32-inch HD LED TV',                'tvs',       1299000,  '{"resolution":[1366,768],"panel":"LED","weight_kg":4.1,"dolby_vision":false}'),
 (13, 'TV-OLED-65', 'Vista 65-inch 4K OLED TV',               'tvs',       19999000, '{"resolution":[3840,2160],"panel":"OLED","weight_kg":22.4,"dolby_vision":true}'),
 (14, 'HP-OE-ANC',  'SoundPod Max over-ear ANC headphones',   'headphones', 1499900,  '{"fit":"over-ear","battery_h":30,"driver_mm":40,"anc":"adaptive","certifications":["RoHS"]}'),
 (15, 'HP-IE-TWS',  'SoundPod Buds wireless earbuds',         'headphones', 499900,   '{"fit":"in-ear","battery_h":8,"driver_mm":11,"anc":"adaptive"}'),
 (16, 'HP-OE-50H',  'SoundPod Classic over-ear headphones',   'headphones', 299900,   '{"fit":"over-ear","battery_h":50,"driver_mm":40,"anc":"none"}'),
 (17, 'AC-SP-15',   'CoolAir 1.5 ton 5-star split AC',        'acs',       4299000,  '{"type":"split","tonnage":1.5,"star_rating":5,"warranty_years":{"product":1,"compressor":10},"certifications":["BIS"]}'),
 (18, 'AC-WN-10',   'CoolAir 1 ton 3-star window AC',         'acs',       2699000,  '{"type":"window","tonnage":1.0,"star_rating":3,"warranty_years":{"product":1,"compressor":5},"certifications":["BIS","CE"]}'),
 (19, 'AC-SP-20',   'CoolAir 2 ton 3-star split AC',          'acs',       5199000,  '{"type":"split","tonnage":2.0,"star_rating":3,"warranty_years":{"product":2,"compressor":10}}'),
 (20, 'LAP-DOCK-11','USB-C docking station, 11 ports',        'laptops',   649900,   '{"ports":11,"power_w":100}');
CREATE INDEX products_attrs_gin ON products USING gin (attrs jsonb_path_ops);

-- SELECT sku, attrs ->> 'panel' FROM products WHERE attrs @> '{"panel":"OLED"}';
-- SELECT sku FROM products WHERE attrs @> '{"certifications":["MIL-STD-810"]}';
-- SELECT sku FROM products WHERE attrs ->> 'ram_gb' >= '16';          -- text comparison: wrong!
-- SELECT sku FROM products WHERE (attrs ->> 'ram_gb')::int >= 16;     -- numeric: right
-- SELECT sku, JSON_VALUE(attrs, '$.warranty_years.compressor' RETURNING int) FROM products WHERE attrs @? '$.warranty_years.compressor ? (@ >= 10)';
-- SELECT p.sku, j.* FROM products p, JSON_TABLE(p.attrs, '$' COLUMNS (ac_type text PATH '$.type', product_years int PATH '$.warranty_years.product')) j WHERE category = 'acs';
-- SET enable_seqscan = off;  EXPLAIN SELECT sku FROM products WHERE attrs @> '{"panel":"OLED"}';
-- SELECT pg_size_pretty(pg_relation_size('products_attrs_gin'));
```
:::

## Exercises

:::exercise id=m09-jsonb-ex1 difficulty=beginner kind=sql ordered=true title="Extract values with ->>"
List every **phone** in colour `Black` with columns `sku`, `colour` (text) and `storage_gb` (an integer), most expensive first.
::setup
```sql
CREATE TABLE products (id bigint PRIMARY KEY, sku text NOT NULL UNIQUE, name text NOT NULL, category text NOT NULL, price_paise bigint NOT NULL, attrs jsonb NOT NULL DEFAULT '{}');
INSERT INTO products VALUES
 (1,  'PHN-NV-256', 'Nova 5G 256 GB, Black',                  'phones',    2499900,  '{"colour":"Black","storage_gb":256,"certifications":["BIS","CE"]}'),
 (2,  'PHN-NV-128', 'Nova 5G 128 GB, Blue',                   'phones',    2299900,  '{"colour":"Blue","storage_gb":128,"certifications":["BIS"]}'),
 (3,  'PHN-OR-128', 'Orbit 5G 128 GB, Green',                 'phones',    1999900,  '{"colour":"Green","storage_gb":128,"certifications":["BIS","RoHS"]}'),
 (4,  'PHN-OR-64',  'Orbit 4G 64 GB, Black',                  'phones',    1199900,  '{"colour":"Black","storage_gb":64,"certifications":["BIS"]}'),
 (5,  'LAP-NA-8',   'NoteBook Air 14, 8 GB, Silver',          'laptops',   4299000,  '{"colour":"Silver","ram_gb":8,"screen_in":14,"certifications":["BIS"]}'),
 (6,  'PHN-ZE-256', 'Zeta 5G 256 GB, Black',                  'phones',    2399900,  '{"colour":"Black","storage_gb":256}');
```
::check
```sql
SELECT sku, attrs ->> 'colour' AS colour, (attrs ->> 'storage_gb')::int AS storage_gb
FROM products
WHERE category = 'phones' AND attrs ->> 'colour' = 'Black'
ORDER BY price_paise DESC;
```
::acceptance
- Three rows: `PHN-NV-256`, `PHN-ZE-256`, `PHN-OR-64` in that order.
- `storage_gb` is an integer column (256, 256, 64), not text.
::hint
`->>` returns a key's value as text; `->` returns jsonb.
::hint
Cast the storage size: `(attrs ->> 'storage_gb')::int`. The parentheses matter because `::` binds tighter than `->>`.
::hint
```sql
SELECT sku, attrs ->> 'colour' AS colour, (attrs ->> 'storage_gb')::int AS storage_gb FROM products WHERE ... ORDER BY price_paise DESC;
```
::solution
```sql
SELECT sku, attrs ->> 'colour' AS colour, (attrs ->> 'storage_gb')::int AS storage_gb
FROM products
WHERE category = 'phones' AND attrs ->> 'colour' = 'Black'
ORDER BY price_paise DESC;
```
`attrs ->> 'colour' = 'Black'` compares text with text, which is right for a string attribute. The same filter could be written `attrs @> '{"colour":"Black"}'`, which a GIN index can serve; the `->>` form needs an expression index on `(attrs ->> 'colour')` to be indexed.
::mistakes
- `attrs -> 'colour' = 'Black'`: compares jsonb with an invalid JSON literal and errors (the right side would need to be `'"Black"'`).
- `attrs ->> 'storage_gb'::int`: the cast applies to the string `'storage_gb'` and fails.
:::

:::exercise id=m09-jsonb-ex2 difficulty=beginner kind=sql ordered=true title="Containment plus a numeric range"
Find **Silver** laptops with **at least 16 GB** of RAM. Use containment (`@>`) for the colour and a numeric comparison for the RAM. Return `sku` and `name`, ordered by `sku`.
::setup
```sql
CREATE TABLE products (id bigint PRIMARY KEY, sku text NOT NULL UNIQUE, name text NOT NULL, category text NOT NULL, price_paise bigint NOT NULL, attrs jsonb NOT NULL DEFAULT '{}');
INSERT INTO products VALUES
 (5,  'LAP-NA-8',   'NoteBook Air 14, 8 GB, Silver',          'laptops',   4299000,  '{"colour":"Silver","ram_gb":8,"screen_in":14,"certifications":["BIS"]}'),
 (6,  'LAP-NA-16',  'NoteBook Air 14, 16 GB, Silver',         'laptops',   5499000,  '{"colour":"Silver","ram_gb":16,"screen_in":14,"certifications":["BIS","MIL-STD-810"]}'),
 (7,  'LAP-PB-16',  'ProBook 15, 16 GB, Grey',                'laptops',   6899000,  '{"colour":"Grey","ram_gb":16,"screen_in":15.6,"certifications":["BIS","MIL-STD-810"]}'),
 (8,  'LAP-NP-32',  'NoteBook Pro 16, 32 GB, Silver',         'laptops',   12499000, '{"colour":"Silver","ram_gb":32,"screen_in":16,"certifications":["BIS"]}'),
 (9,  'LAP-PB-32',  'ProBook 16, 32 GB, Grey',                'laptops',   13999000, '{"colour":"Grey","ram_gb":32,"screen_in":16}'),
 (21, 'LAP-NA-12',  'NoteBook Air 13, 12 GB, Silver',         'laptops',   4899000,  '{"colour":"Silver","ram_gb":12,"screen_in":13.3}');
CREATE INDEX products_attrs_gin ON products USING gin (attrs jsonb_path_ops);
```
::check
```sql
SELECT sku, name FROM products
WHERE attrs @> '{"colour": "Silver"}' AND (attrs ->> 'ram_gb')::int >= 16
ORDER BY sku;
```
::acceptance
- Returns `LAP-NA-16` and `LAP-NP-32` only.
- The 8 GB and 12 GB laptops are excluded. (A text comparison would wrongly include the 8 GB laptop, because `'8' >= '16'` as text.)
::hint
Containment: `attrs @> '{"colour": "Silver"}'`. The right side is a JSON literal.
::hint
`->>` gives text. Compare numbers only after casting.
::hint
Try `attrs ->> 'ram_gb' >= '16'` first and see which wrong row appears.
::solution
```sql
SELECT sku, name FROM products
WHERE attrs @> '{"colour": "Silver"}' AND (attrs ->> 'ram_gb')::int >= 16
ORDER BY sku;
```
The containment filter can use the GIN index; the range filter cannot (GIN `jsonb_path_ops` supports `@>`, `@?`, `@@`). If RAM ranges are a hot query, add `CREATE INDEX ON products (((attrs ->> 'ram_gb')::int))` and write the filter with exactly that expression. Alternatively, a path query keeps it all on the GIN index: `attrs @? '$ ? (@.colour == "Silver" && @.ram_gb >= 16)'`.
::mistakes
- Text comparison on numbers.
- `attrs @> '{"colour": "Silver", "ram_gb": 16}'`, which finds exactly 16 GB, not "at least 16".
:::

:::exercise id=m09-jsonb-ex3 difficulty=intermediate kind=sql ordered=true title="Unnest an array for a facet count"
The buyer app shows a "Certifications" facet. Count how many products carry each certification (from the `certifications` array in `attrs`). Return `certification` and `products`, ordered by `products` descending, then `certification` ascending. Products without the key are simply not counted.
::setup
```sql
CREATE TABLE products (id bigint PRIMARY KEY, sku text NOT NULL UNIQUE, category text NOT NULL, attrs jsonb NOT NULL DEFAULT '{}');
INSERT INTO products VALUES
 (1,  'PHN-NV-256', 'phones',    '{"colour":"Black","certifications":["BIS","CE"]}'),
 (2,  'PHN-NV-128', 'phones',    '{"colour":"Blue","certifications":["BIS"]}'),
 (3,  'PHN-OR-128', 'phones',    '{"colour":"Green","certifications":["BIS","RoHS"]}'),
 (6,  'LAP-NA-16',  'laptops',   '{"colour":"Silver","certifications":["BIS","MIL-STD-810"]}'),
 (7,  'LAP-PB-16',  'laptops',   '{"colour":"Grey","certifications":["BIS","MIL-STD-810"]}'),
 (9,  'LAP-PB-32',  'laptops',   '{"colour":"Grey"}'),
 (10, 'TV-LED-43',  'tvs',       '{"panel":"LED","certifications":["RoHS"]}'),
 (14, 'HP-OE-ANC',  'headphones', '{"anc":"adaptive","certifications":["RoHS"]}'),
 (18, 'AC-WN-10',   'acs',       '{"type":"window","certifications":["BIS","CE"]}');
```
::check
```sql
SELECT c AS certification, count(*) AS products
FROM products, jsonb_array_elements_text(attrs -> 'certifications') AS c
GROUP BY c
ORDER BY products DESC, certification;
```
::acceptance
- BIS 6, RoHS 3, CE 2, MIL-STD-810 2, in that order.
- `LAP-PB-32`, which has no certifications key, adds nothing and causes no error.
::hint
You need one row per (product, certification). A set-returning function in `FROM` produces that.
::hint
`jsonb_array_elements_text(jsonb)` returns each array element as text. For a NULL input (missing key) it returns no rows.
::hint
```sql
FROM products, jsonb_array_elements_text(attrs -> 'certifications') AS c
```
::hint
Then `GROUP BY c` and order by the count, then by name for ties.
::solution
```sql
SELECT c AS certification, count(*) AS products
FROM products, jsonb_array_elements_text(attrs -> 'certifications') AS c
GROUP BY c
ORDER BY products DESC, certification;
```
The comma join with a set-returning function is an implicit `LATERAL` join: for each product, the function runs on that product's array. On a large catalogue, facet counts like this are expensive (every matching document is unnested), so busy marketplaces precompute them per category in a summary table, or move facet counting to a search engine.
::mistakes
- `jsonb_array_elements` (without `_text`) returns jsonb values, so the facet labels come out quoted (`"BIS"`).
- Forgetting the tie-breaker in `ORDER BY`, so CE and MIL-STD-810 swap between runs.
:::

:::exercise id=m09-jsonb-ex4 difficulty=intermediate kind=code title="Implement jsonb containment in C#"
Implement `JsonContainment.Contains(JsonNode? left, JsonNode? right)` with PostgreSQL's `@>` rules, so the in-memory fake store behaves like the database. Rules: objects contain objects when every right key exists on the left with a containing value (extra left keys are fine); arrays contain arrays when every right element is contained by **some** left element (order and duplicates ignored); a top-level array contains a scalar if one of its elements equals it; scalars must have the same JSON kind and value (numbers compare by value, so `12` equals `12.0`); JSON `null` (a C# `null` node) only matches `null`.
::acceptance
- `{"colour":"Silver","ram_gb":16}` contains `{"colour":"Silver"}`, but not `{"colour":"Grey"}`.
- `{"certifications":["BIS","RoHS"]}` contains `{"certifications":["RoHS"]}` and `{"certifications":["RoHS","BIS","RoHS"]}`.
- Nested objects work: `{"warranty_years":{"product":1,"compressor":10}}` contains `{"warranty_years":{"compressor":10}}`.
- `12` equals `12.0`, the string `"12"` does not equal the number `12`, and `true` does not equal `1`.
- Every document contains `{}`.
::hint
Switch on the pair of node types: `(JsonObject, JsonObject)`, `(JsonArray, JsonArray)`, `(JsonArray, JsonValue)`, `(JsonValue, JsonValue)`, otherwise false.
::hint
Objects: `right.All(kv => left.TryGetPropertyValue(kv.Key, out var lv) && Contains(lv, kv.Value))`.
::hint
Arrays: `right.All(r => left.Any(l => Contains(l, r)))`.
::hint
Scalars: compare `GetValueKind()` first. For numbers use `GetValue<decimal>()`; for strings `GetValue<string>()`; `true`/`false` are already distinguished by their kinds.
::hint
Handle nulls at the top: if `right` is null, the answer is `left is null`; if only `left` is null, false.
::starter
```csharp file=JsonContainment.cs
using System;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;

public static class JsonContainment
{
    public static bool Contains(JsonNode? left, JsonNode? right) => throw new NotImplementedException();
}
```
::tests
```csharp file=JsonContainmentTests.cs
using System.Text.Json.Nodes;
using Xunit;

public class JsonContainmentTests
{
    private static JsonNode? J(string s) => JsonNode.Parse(s);

    [Fact]
    public void Object_subset()
    {
        var doc = J("""{"colour":"Silver","ram_gb":16,"screen_in":14}""");
        Assert.True(JsonContainment.Contains(doc, J("""{"colour":"Silver"}""")));
        Assert.True(JsonContainment.Contains(doc, J("""{"colour":"Silver","ram_gb":16}""")));
        Assert.False(JsonContainment.Contains(doc, J("""{"colour":"Grey"}""")));
        Assert.False(JsonContainment.Contains(doc, J("""{"panel":"OLED"}""")));
    }

    [Fact]
    public void Arrays_ignore_order_and_duplicates()
    {
        var doc = J("""{"certifications":["BIS","RoHS"]}""");
        Assert.True(JsonContainment.Contains(doc, J("""{"certifications":["RoHS"]}""")));
        Assert.True(JsonContainment.Contains(doc, J("""{"certifications":["RoHS","BIS","RoHS"]}""")));
        Assert.False(JsonContainment.Contains(doc, J("""{"certifications":["CE"]}""")));
        Assert.True(JsonContainment.Contains(doc, J("""{"certifications":[]}""")));
    }

    [Fact]
    public void Nested_objects()
    {
        var doc = J("""{"type":"split","warranty_years":{"product":1,"compressor":10}}""");
        Assert.True(JsonContainment.Contains(doc, J("""{"warranty_years":{"compressor":10}}""")));
        Assert.False(JsonContainment.Contains(doc, J("""{"warranty_years":{"compressor":5}}""")));
    }

    [Fact]
    public void Scalars_compare_by_kind_and_value()
    {
        Assert.True(JsonContainment.Contains(J("12"), J("12.0")));
        Assert.False(JsonContainment.Contains(J("\"12\""), J("12")));
        Assert.False(JsonContainment.Contains(J("true"), J("1")));
        Assert.True(JsonContainment.Contains(J("false"), J("false")));
    }

    [Fact]
    public void Top_level_array_contains_scalar()
    {
        Assert.True(JsonContainment.Contains(J("[1,2,3]"), J("2")));
        Assert.False(JsonContainment.Contains(J("[1,2,3]"), J("5")));
    }

    [Fact]
    public void Empty_object_is_contained_by_any_object()
    {
        Assert.True(JsonContainment.Contains(J("""{"a":1}"""), J("{}")));
        Assert.False(JsonContainment.Contains(J("[1]"), J("{}")));
    }

    [Fact]
    public void Json_null_matches_only_null()
    {
        Assert.True(JsonContainment.Contains(J("""{"x":null}"""), J("""{"x":null}""")));
        Assert.False(JsonContainment.Contains(J("""{"x":null}"""), J("""{"x":0}""")));
        Assert.False(JsonContainment.Contains(J("""{"x":1}"""), J("""{"x":null}""")));
    }
}
```
::solution
```csharp file=JsonContainment.cs
using System;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;

public static class JsonContainment
{
    public static bool Contains(JsonNode? left, JsonNode? right)
    {
        if (right is null) return left is null;
        if (left is null) return false;

        return (left, right) switch
        {
            (JsonObject l, JsonObject r) => r.All(kv => l.TryGetPropertyValue(kv.Key, out var lv) && Contains(lv, kv.Value)),
            (JsonArray l, JsonArray r) => r.All(re => l.Any(le => Contains(le, re))),
            (JsonArray l, JsonValue r) => l.Any(le => le is JsonValue lv && ScalarEquals(lv, r)),
            (JsonValue l, JsonValue r) => ScalarEquals(l, r),
            _ => false
        };
    }

    private static bool ScalarEquals(JsonValue a, JsonValue b)
    {
        var ka = a.GetValueKind();
        if (ka != b.GetValueKind()) return false;
        return ka switch
        {
            JsonValueKind.Number => a.GetValue<decimal>() == b.GetValue<decimal>(),
            JsonValueKind.String => a.GetValue<string>() == b.GetValue<string>(),
            _ => true
        };
    }
}
```
`JsonNode.Parse("null")` and a property with value `null` both appear as a C# `null` node, which is why null handling sits at the top of the method. The array-with-scalar rule is PostgreSQL's one documented special case: `'[1,2,3]'::jsonb @> '2'` is true, but only at the top level of the left value.
::alternatives
Instead of a hand-written model, an integration test can send each pair to a real PostgreSQL (`SELECT $1::jsonb @> $2::jsonb`) and compare. Use both: the C# model for fast unit tests, the database test to prove the model is faithful.
::mistakes
- Comparing `ToJsonString()` outputs, which makes `12` differ from `12.0` and makes object key order matter.
- Treating arrays positionally (`l[i]` contains `r[i]`); PostgreSQL ignores order.
- Using `double` for numbers, which loses precision for large integers that `numeric` keeps.
:::

:::exercise id=m09-jsonb-ex5 difficulty=intermediate kind=sql ordered=true title="Promote a hot key to a generated column"
Analytics shows most searches facet by `colour`. Add a stored generated column `colour text` computed from `attrs ->> 'colour'`, index it, then return the facet: `colour` and `products` (count) for rows where `colour` is not null, ordered by `colour`. Then prove it stays in sync: before the final query, the seller corrects a listing: update the 32 GB ProBook (`LAP-PB-32`) so its attrs colour becomes `Silver`, using `jsonb_set`.
::setup
```sql
CREATE TABLE products (id bigint PRIMARY KEY, sku text NOT NULL UNIQUE, category text NOT NULL, attrs jsonb NOT NULL DEFAULT '{}');
INSERT INTO products VALUES
 (1,  'PHN-NV-256', 'phones',    '{"colour":"Black","storage_gb":256}'),
 (2,  'PHN-NV-128', 'phones',    '{"colour":"Blue","storage_gb":128}'),
 (4,  'PHN-OR-64',  'phones',    '{"colour":"Black","storage_gb":64}'),
 (5,  'LAP-NA-8',   'laptops',   '{"colour":"Silver","ram_gb":8}'),
 (6,  'LAP-NA-16',  'laptops',   '{"colour":"Silver","ram_gb":16}'),
 (7,  'LAP-PB-16',  'laptops',   '{"colour":"Grey","ram_gb":16}'),
 (9,  'LAP-PB-32',  'laptops',   '{"colour":"Grey","ram_gb":32}'),
 (11, 'TV-OLED-55', 'tvs',       '{"panel":"OLED"}');
```
::check
```sql
ALTER TABLE products ADD COLUMN colour text GENERATED ALWAYS AS (attrs ->> 'colour') STORED;
CREATE INDEX products_colour ON products (colour);
UPDATE products SET attrs = jsonb_set(attrs, '{colour}', '"Silver"') WHERE sku = 'LAP-PB-32';
SELECT colour, count(*) AS products FROM products WHERE colour IS NOT NULL GROUP BY colour ORDER BY colour;
```
::acceptance
- Facet result: Black 2, Blue 1, Grey 1, Silver 3.
- The TV without a colour is excluded.
- You updated only `attrs`; the generated column followed automatically.
::hint
`GENERATED ALWAYS AS (expression) STORED` computes the column on every insert and update.
::hint
`jsonb_set(target, path, new_value)`: the path is a text array like `'{colour}'`, and the new value must be jsonb, so a string needs inner quotes: `'"Silver"'`.
::hint
You cannot `UPDATE ... SET colour = ...` on a generated column; update the source.
::solution
```sql
ALTER TABLE products ADD COLUMN colour text GENERATED ALWAYS AS (attrs ->> 'colour') STORED;
CREATE INDEX products_colour ON products (colour);
UPDATE products SET attrs = jsonb_set(attrs, '{colour}', '"Silver"') WHERE sku = 'LAP-PB-32';
SELECT colour, count(*) AS products FROM products WHERE colour IS NOT NULL GROUP BY colour ORDER BY colour;
```
The document stays the source of truth and the column can never drift from it. The column has normal statistics, so the planner estimates `colour = 'Silver'` correctly. Cost: adding a stored generated column rewrites the table, and every write computes it. An expression index on `(attrs ->> 'colour')` gives most of the read benefit without the rewrite; the generated column wins when you also want to `SELECT`, sort and group by it as a plain column, or map it to an ORM property.
::mistakes
- `jsonb_set(attrs, '{colour}', 'Silver')`: `Silver` is not valid JSON; it must be `'"Silver"'` (or `to_jsonb('Silver'::text)`).
- `GENERATED ALWAYS AS (attrs -> 'colour')`: the expression has type jsonb, not text, so the column definition is rejected; use `->>`.
:::

:::exercise id=m09-jsonb-ex6 difficulty=advanced kind=written title="Custom fields for a multi-tenant clinic intake platform"
You run a clinic-management SaaS used by 1,200 clinics. Each clinic defines its own patient intake form fields (for example "Systolic BP (mmHg)", "Diabetic?", "Allergies", "Referred by"), up to 80 fields per form. There are 25 million intakes, growing by 40,000 a day. Customers need: filtering intakes by any of their custom fields, a monthly report per field, and exports. Field definitions change every few weeks. Compare (a) a column per field, (b) an entity-attribute-value table `(intake_id, field_id, value text)`, and (c) a `jsonb` column `answers` plus a `form_fields` definition table. Choose one, and describe the schema, indexes, validation, how reports run, and what you would move out of the document.
::acceptance
- Rejects (a) with a reason (1,200 tenants × 80 fields, constant DDL).
- Weighs (b) honestly: flexible and typed per row if designed well, but large and join-heavy for multi-field filters.
- Chooses (c) or a justified hybrid, with tenant id, form id, dates and status as columns.
- Names the index: GIN `jsonb_path_ops` on `answers`, combined with a B-tree on `(tenant_id, visit_on)`; considers partitioning or per-tenant partial indexes for large tenants.
- Explains validation against `form_fields` on write and how keys are named (field ids, not labels).
- Explains how monthly reports avoid scanning documents on every request (summary tables or a warehouse).
::hint
Count the columns option (a) needs and how often DDL would run.
::hint
For (b), write the SQL for "systolic BP ≥ 140 AND diabetic = yes" and count the joins.
::hint
Which fields does every intake have, whatever the tenant? Those are columns.
::hint
Key documents by stable field ids (`"f_812": 150`), not labels, so renaming a label does not rewrite 25 million documents.
::solution
**(a) A column per field** needs up to 96,000 columns across tenants (1,200 × 80) or a table per tenant; every new field is DDL on a 25-million-row table. Rejected.

**(b) EAV**: `intake_answers(intake_id, field_id, value_text, value_num, value_bool)`. Flexible and indexable per field (`(field_id, value_num)`), and good for "one field across all intakes" reports. But 25 M intakes × ~40 answered fields = ~1 billion rows (estimate); a filter on three fields is three self-joins or an `INTERSECT`; loading one intake reads 40 rows. Workable, but heavy.

**(c) jsonb hybrid (chosen)**:

```sql
CREATE TABLE form_fields (
  id bigint PRIMARY KEY, tenant_id bigint NOT NULL, form_id bigint NOT NULL,
  key text NOT NULL,                  -- stable id such as 'f_812', never the label
  label text NOT NULL, type text NOT NULL CHECK (type IN ('number','text','bool','choice','date')),
  required boolean NOT NULL DEFAULT false, choices jsonb, retired_at timestamptz,
  UNIQUE (form_id, key)
);
CREATE TABLE intakes (
  id bigint PRIMARY KEY, tenant_id bigint NOT NULL, form_id bigint NOT NULL, patient_id bigint NOT NULL REFERENCES patients,
  visit_on date NOT NULL, status text NOT NULL, doctor_id bigint NOT NULL,
  answers jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
  attachments_count int NOT NULL DEFAULT 0
);
CREATE INDEX ON intakes (tenant_id, visit_on);
CREATE INDEX ON intakes USING gin (answers jsonb_path_ops);
```

Everything every intake has (tenant, form, patient, date, status, doctor) is a column with foreign keys. Attachments (scans, lab reports) are a child table (unbounded, binary in object storage), and the count is a column. `answers` holds only custom fields, keyed by stable field ids, so renaming a label touches one `form_fields` row.

**Validation**: the API loads the form definition (cached), rejects unknown keys, wrong types, missing required fields and invalid choices, exactly like the lesson's `AttributeValidator`. Retired fields stay readable but are rejected on new writes.

**Queries**: equality and choice filters become one `answers @> $1` document; tenant and date use the B-tree; PostgreSQL combines them with a bitmap AND. Numeric ranges on a hot field get a per-tenant partial expression index created on demand for the few large tenants who need it (`WHERE tenant_id = 42`). For the biggest tenants, consider list or hash partitioning by `tenant_id` (see [Partitioning and sharding](#/lesson/m09-partitioning-sharding)).

**Reports**: a nightly job flattens the previous day's documents (`jsonb_each` joined to `form_fields`) into a typed reporting table or warehouse, and monthly reports read that. Exports stream with keyset pagination.

**What leaves the document**: anything that becomes a cross-tenant platform feature (for example "BMI" used in a care-quality dashboard) is promoted to a real column with a backfill.

**Security**: these answers are health data. Enforce tenant isolation with row-level security on the `tenant_id` column, keep answers out of application logs and error messages, and restrict the reporting copy to the fields each report actually needs.
::mistakes
- Keying `answers` by human labels, so a label edit requires rewriting millions of documents.
- Putting tenant id inside the document, which loses the foreign key, the B-tree and row-level security.
- One `jsonb_ops` GIN index over large documents with free-text answers, which bloats the index; prefer `jsonb_path_ops` and keep long text answers out of filters.
- Running monthly reports directly on 25 million documents on every page load.
:::

## Automated testing

**Validator unit tests**: each category schema gets tests for missing required keys, unknown keys, wrong types (number sent as string), arrays with mixed types, and the size limit. These are the database's missing constraints, so test them like constraints.

**Containment model tests** (exercise 4) keep the in-memory store faithful to PostgreSQL. Back them with one integration test that runs the same pairs through `SELECT $1::jsonb @> $2::jsonb` on a real database, so the model and the database cannot drift.

**Query-builder tests**: assert that `ProductSearch.ToSql` never places a user-supplied value in the SQL text (only `$n` placeholders), rejects unknown keys, and generates the exact expression your expression index uses (`(attrs ->> 'ram_gb')::numeric`), so a refactor does not silently stop the index from matching.

**Plan tests** in CI on a seeded database (100,000+ rows so the planner behaves realistically): `EXPLAIN (FORMAT JSON)` on the main search must show a `Bitmap Index Scan` on the GIN index.

```csharp
[Fact]
public void Search_sql_contains_no_user_values()
{
    var schema = Schemas.All["laptops"];
    var (eq, ranges) = ProductSearch.Parse(schema, new Dictionary<string, string> { ["colour"] = "x' OR 1=1 --", ["minRam_gb"] = "16" });
    var sql = ProductSearch.ToSql("laptops", eq, ranges, 50);
    Assert.DoesNotContain("OR 1=1", sql.Text);
    Assert.Contains("attrs @> $2::jsonb", sql.Text);
}
```

## Real-world application

- **E-commerce catalogues** commonly keep core product fields as columns and category specifications as a document, with facet counts precomputed or served by a search engine.
- **Event and webhook ingestion**: payment gateways and logistics partners send varied payloads. Storing the raw `jsonb` with a few extracted columns (`event_id` unique, `received_at`, `type`) makes replays and audits possible without modelling every partner's format.
- **Government and grievance systems** that receive structured forms from many departments store department-specific fields as documents, keyed by field ids from a form-definition table, while case id, department, status and dates stay relational for SLA reporting.
- **Feature flags and user preferences**: small per-user `jsonb` settings read and written as a unit.
- **Audit logs**: "before" and "after" row images as `jsonb`, written once and rarely queried, usually without a GIN index.

## Interview questions

:::interview
::q beginner
What is the difference between json and jsonb in PostgreSQL?
::a
`json` stores the original text, preserving whitespace, key order and duplicate keys, and re-parses it on every access. `jsonb` stores a parsed binary form: keys are de-duplicated (last wins) and not kept in input order, and it supports containment and existence operators and GIN indexes. `jsonb` is faster to query and is the default choice; use `json` (or `text`) only to preserve the exact original bytes, for example for signature checks.
::q beginner
Why does `attrs ->> 'ram_gb' >= '16'` return the 8 GB laptop?
::a
`->>` returns text, so the comparison is between strings, and `'8'` sorts after `'16'` character by character. Cast first: `(attrs ->> 'ram_gb')::int >= 16`. The cast fails if any matched row holds a non-numeric value, which is why documents should be validated on write.
::q intermediate
How do you index a jsonb column, and which index type for which query?
::a
A GIN index for containment and key-existence queries: the default `jsonb_ops` supports `@>`, `?`, `?|`, `?&`, `@?`, `@@`; `jsonb_path_ops` supports only `@>`, `@?`, `@@` but is usually smaller and faster for containment. For equality, ranges or sorting on one key, an expression B-tree index on `((attrs ->> 'key')::type)`, used with exactly the same expression in queries; it also gives the planner statistics. For a key used everywhere, a stored generated column with a normal B-tree.
::q intermediate
When should a field be a column rather than a jsonb key?
::a
When it is present in every row and must be constrained (NOT NULL, CHECK, UNIQUE); when it is a foreign key or used in joins; when it is aggregated, sorted or range-filtered often; when it changes frequently on its own (each jsonb update rewrites the whole document); and when the planner needs good statistics on it. Variable, sparse, tenant-specific or externally owned attributes are the good jsonb cases.
::q advanced
A search on `attrs @> '{"panel":"LED"}'` is fast for most values and very slow for one. Why, and what do you do?
::a
The planner has no per-key statistics inside `jsonb` and uses a fixed default selectivity for containment, so it estimates the same small row count for every value. For a value that matches a large fraction of rows it may choose a nested loop or the GIN index where a sequential or different plan is better. Fix by giving the planner statistics: an expression index or `CREATE STATISTICS` on `(attrs ->> 'panel')` and querying with that expression, or promote the key to a generated column. Check with `EXPLAIN (ANALYZE)` comparing estimated and actual rows.
::q advanced
A service stores each user's activity feed as one growing jsonb array and updates it on every event. What goes wrong at scale?
::a
Every append rewrites the whole document and creates a new row version. Once the value exceeds about 2 KB it is TOASTed, so each event rewrites the full TOAST value, generates WAL proportional to the document size, rewrites GIN entries, increases replica lag and bloats the table until vacuum. Concurrent appends to the same row also serialise on the row lock and can lose updates if done read-modify-write in the application. Use a child table (one row per event) with an index on `(user_id, created_at)`, and keep only small, rarely changing data in documents.
:::

## Summary and revision

**Key takeaways**

- Use `jsonb`, not `json`, unless you must keep the original text.
- `->` returns jsonb, `->>` returns text; cast before numeric comparisons.
- `@>` containment is the operator to design around: it is index-friendly and ignores array order.
- GIN `jsonb_path_ops` for containment, default `jsonb_ops` when you need key existence, expression B-trees or generated columns for ranges, sorting and statistics.
- Every jsonb update rewrites the whole value; keep documents small and frequently changing values in columns.
- The planner does not know what is inside documents; expression indexes and generated columns give it statistics.
- Columns for what every row has, what you join, constrain, aggregate or update often; jsonb for variable, sparse, tenant-defined or external data. Validate documents on write.

**Terminology**: jsonb, containment (`@>`), key existence (`?`), SQL/JSON path, `JSON_TABLE`, GIN, `jsonb_ops`, `jsonb_path_ops`, expression index, generated column, TOAST, write amplification, EAV.

:::flashcards
Q: json vs jsonb?
A: json keeps the exact text and re-parses it; jsonb stores parsed binary, removes duplicate keys, supports containment and GIN indexes.
Q: What does ->> return, and why does it matter?
A: Text. Numeric comparisons need a cast, otherwise '8' >= '16' is true.
Q: Which operators does GIN jsonb_path_ops support?
A: @>, @? and @@ (containment and JSON path). Not key-existence (?, ?|, ?&).
Q: How does @> treat arrays?
A: Every element on the right must be contained by some element on the left; order and duplicates are ignored.
Q: Why are large, frequently updated jsonb documents costly?
A: Each update writes a new copy of the whole value (often TOASTed), plus WAL and GIN entries.
Q: How do you give the planner statistics about a jsonb key?
A: An expression index or CREATE STATISTICS on the extracted expression, or a stored generated column.
Q: Name three signs a field should be a column, not a jsonb key.
A: It needs a foreign key or join, it must be NOT NULL/unique/checked in every row, it is aggregated/sorted/range-filtered or updated often.
Q: Where does jsonb schema validation live?
A: In the application (per-category or per-form schema) plus a minimal CHECK such as jsonb_typeof(attrs) = 'object'.
:::

## Knowledge check

:::quiz pass=70
::q single
A marketplace stores `price` inside `attrs`. Finance's monthly sum `SUM((attrs ->> 'price')::numeric)` fails. The most likely cause and fix?
- [ ] jsonb cannot store numbers. Use json.
- [x] Some document holds a non-numeric price; prices should be a validated, constrained column.
- [ ] SUM does not work on casts. Use a subquery.
- [ ] The GIN index is corrupt. Reindex.
> Values every row has and that finance aggregates belong in a constrained column. Inside a document, nothing stops `"₹24,999"`.
::q single
Which index lets `WHERE attrs @> '{"panel":"OLED"}'` avoid a full scan on a large table, with the smallest index?
- [ ] B-tree on `attrs`
- [x] GIN on `attrs jsonb_path_ops`
- [ ] Hash on `attrs`
- [ ] GIN on `attrs jsonb_ops`, because path_ops cannot do containment
> `jsonb_path_ops` supports `@>` and is usually smaller than `jsonb_ops`. `jsonb_ops` also works but is larger; it is needed only for key-existence operators.
::q single
`SELECT ... WHERE attrs ? 'dolby_vision'` does not use your `jsonb_path_ops` GIN index. Why?
- [x] `jsonb_path_ops` does not support the key-existence operator `?`.
- [ ] `?` only works on json, not jsonb.
- [ ] The key must be quoted twice.
- [ ] GIN indexes only work with `->>`.
> Use the default `jsonb_ops` if you need `?`, `?|`, `?&`, or rewrite as a containment or path query where possible.
::q multi
Which belong in real columns rather than in `attrs`? (Select all that apply.)
- [x] `seller_id`, which references the sellers table
- [x] `stock_quantity`, decremented on every order
- [ ] `panel` for TVs, used only by TVs
- [x] `price_paise`, summed in finance reports
> Foreign keys, frequently updated values and aggregated values are columns. A TV-only panel type is a good document attribute.
::q single
You add `CREATE INDEX ON products (((attrs ->> 'ram_gb')::int))`. Which query can use it?
- [ ] `WHERE attrs ->> 'ram_gb' >= '16'`
- [x] `WHERE (attrs ->> 'ram_gb')::int >= 16`
- [ ] `WHERE attrs @> '{"ram_gb": 16}'`
- [ ] `WHERE attrs -> 'ram_gb' >= '16'`
> An expression index matches only queries that use the same expression.
::q single
`'{"certifications":["BIS","RoHS"]}'::jsonb @> '{"certifications":["RoHS","BIS"]}'` returns?
- [x] true
- [ ] false, because the order differs
- [ ] an error
- [ ] NULL
> Array containment ignores order and duplicates.
::q single
A user's preferences document (300 bytes) is read and written as a whole on settings save, a few times a month. Best storage?
- [x] A `jsonb` column on the users table, no index
- [ ] Twenty nullable columns
- [ ] An EAV table with a GIN index
- [ ] A separate document database
> Small, rarely updated, read as a unit: the textbook jsonb case. No index is needed because nobody filters by it.
:::

## Completion criteria

You have finished this lesson when you can:

- [ ] Score at least 70 % on the knowledge check.
- [ ] Complete exercises 1, 2, 3 and 5 in the SQL playground.
- [ ] Complete exercise 4; your downloaded project's `dotnet test` passes.
- [ ] See the GIN index in an `EXPLAIN` plan in the playground and explain why the planner ignores it on 20 rows.
- [ ] Given a new field, decide in one sentence whether it is a column or a document key, and justify it.
