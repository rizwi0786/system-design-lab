---
id: m09-normalization
title: Normalization and denormalization
module: m09
level: intermediate
status: reviewed
template: lesson
minutes: 80
prerequisites: [m09-relational-fundamentals, m09-relationships]
related: [m09-indexes, m09-transactions-acid, m09-jsonb, m08-cqrs-fundamentals]
tags: [postgresql, normalization, functional-dependency, bcnf, denormalization, data-modeling]
patterns: []
summary: Normalization stores each fact exactly once so that updates cannot contradict each other. Learn functional dependencies, 1NF to 3NF and BCNF on a real procurement spreadsheet, then learn when and how to denormalize on purpose without letting copies drift.
references:
  - title: "PostgreSQL 17 documentation — Constraints"
    url: https://www.postgresql.org/docs/17/ddl-constraints.html
  - title: "PostgreSQL 17 documentation — Generated columns"
    url: https://www.postgresql.org/docs/17/ddl-generated-columns.html
  - title: "PostgreSQL 17 documentation — Materialized views"
    url: https://www.postgresql.org/docs/17/rules-materializedviews.html
  - title: "E. F. Codd — A Relational Model of Data for Large Shared Data Banks (1970)"
    url: https://dl.acm.org/doi/10.1145/362384.362685
---

Almost every database starts life as a spreadsheet somebody outgrew. The spreadsheet works until the day one supplier's name is spelled three different ways, a project's state is wrong on half its rows, and deleting the last order for a material deletes the only record of its GST rate. Normalization is the discipline that prevents those bugs by design. Denormalization is the discipline of breaking it on purpose, for speed, while keeping the copies honest.

## Learning objectives

By the end of this lesson you will be able to:

1. Explain update, insert and delete anomalies with a concrete example and say which design choice causes each.
2. Write down the functional dependencies of a table and compute an attribute closure by hand.
3. Find candidate keys and decide whether a table is in 1NF, 2NF, 3NF or BCNF.
4. Decompose a flat table into normalized tables without losing information (lossless join) or rules (dependency preservation).
5. Tell a real redundancy from a historical snapshot, such as the price on an order line.
6. Choose a denormalization technique (generated column, trigger-maintained total, materialized view, read model) using numbers, and plan how to detect drift.

## Prerequisites

- [Relational database fundamentals](#/lesson/m09-relational-fundamentals): tables, primary keys, foreign keys, `UNIQUE` and `CHECK`.
- [One-to-one, one-to-many and many-to-many](#/lesson/m09-relationships): we will split one wide table into parents, children and a junction.
- Helpful: [Transactions and ACID](#/lesson/m09-transactions-acid), because keeping a denormalized copy in sync is a transaction problem.

## Explain it like I'm a beginner

A highway contractor runs three projects: a ring road in Nagpur, a bypass in Lucknow and a flyover in Gurugram. The procurement team tracks every purchase order in one Excel sheet. Each row is one material on one order:

| po_no | project | project_state | supplier_gstin | supplier_name | material | unit | gst_rate | qty | rate |
|---|---|---|---|---|---|---|---|---|---|
| PO-1001 | NGP-RR | Maharashtra | 27AAFCD4410K1Z3 | Deccan Steel Stockists | TMT-12 | tonne | 18 | 40 | 56,500 |
| PO-1001 | NGP-RR | Maharashtra | 27AAFCD4410K1Z3 | Deccan Steel Stockists | TMT-16 | tonne | 18 | 25 | 55,800 |
| PO-1002 | LKO-BP | Uttar Pradesh | 09AAKCG7721M1Z8 | Ganga Bitumen Supply | VG-30 | tonne | 18 | 60 | 48,200 |

Look at what is repeated. "Deccan Steel Stockists" appears on every line of every order from that supplier. "Maharashtra" appears on every line of every Nagpur order. "TMT-12 is sold by the tonne at 18 % GST" appears on every line that orders TMT-12. With 30,000 rows, those facts are copied thousands of times.

Copies cause three kinds of trouble (anomalies):

- **Update anomaly.** The supplier changes its registered name. Someone updates 412 rows and misses 3. Now the sheet says two different things and nobody knows which is right.
- **Insert anomaly.** A new material, cement OPC-53 at 28 % GST, is approved but not ordered yet. There is nowhere to write it down, because every row needs a PO number.
- **Delete anomaly.** The only order for VG-40 bitumen is cancelled and its row deleted. The fact "VG-40 is sold by the tonne at 18 %" vanishes with it.

**Normalization** is the fix: put each fact in exactly one place. Suppliers go in a `supplier` table (one row each), projects in a `project` table, materials in a `material` table, and the order lines only hold the keys plus what is genuinely about that line: quantity and agreed rate. A name change is now one `UPDATE` of one row.

The analogy: a well-run office keeps one master contact card per supplier in a filing cabinet. Every purchase order just writes "Supplier #27-114". Nobody photocopies the contact card onto every order.

**Denormalization** is the opposite move, made deliberately: you copy a fact somewhere else because reading it from its single home is too slow for one important screen. That is fine, as long as you know which copy is the truth, how the copy is kept up to date, and how you will notice if it drifts.

## First-principles explanation

### Functional dependencies: the idea underneath every normal form

A **functional dependency** (FD) `X → Y` means: if two rows agree on the columns in `X`, they must agree on the columns in `Y`. In plain words, "X decides Y".

For the procurement sheet:

- `po_no → po_date, project_code, supplier_gstin` (one order belongs to one project and one supplier).
- `project_code → project_name, project_state`.
- `supplier_gstin → supplier_name, supplier_city`.
- `material_code → material_name, unit, gst_rate`.
- `po_no, material_code → qty, rate` (the line's own facts).

FDs come from the business, not from the data. Your sample might happen to show every Lucknow order on the same day, but nobody believes `project_code → po_date`. You discover FDs by asking domain experts "can this ever differ?", not by running `SELECT DISTINCT`.

### Closure and keys

The **closure** of a set of columns, written `X⁺`, is everything `X` decides, directly or through a chain. Computing it is a loop: start with `X`, and keep adding the right-hand side of any FD whose left-hand side is already inside, until nothing changes.

`{po_no}⁺`: start with `po_no`. The first FD adds `po_date, project_code, supplier_gstin`. Now `project_code` is inside, so add `project_name, project_state`. `supplier_gstin` is inside, so add `supplier_name, supplier_city`. Nothing more applies. Result: eight columns, but not `material_code`, `qty` or `rate`.

`{po_no, material_code}⁺` adds the material facts and the line facts, so it covers all 14 columns. A set whose closure is the whole table is a **superkey**. A superkey with nothing removable is a **candidate key**. Here the only candidate key is `(po_no, material_code)`. Columns that belong to some candidate key are **prime**; the rest are **non-prime**.

### The normal forms, one rule each

**First normal form (1NF): one value per cell, no repeating groups.** A cell containing `"TMT-12, TMT-16"` or columns `material_1, material_2, material_3` break 1NF. You cannot index, join or constrain a comma-separated list, and the fourth material has nowhere to go. PostgreSQL arrays and `jsonb` are technically single values, which is why using them is a design decision (see [PostgreSQL JSONB](#/lesson/m09-jsonb)) rather than an automatic violation. Use them for data you read and write as a whole, never for things you need to join to or constrain.

**Second normal form (2NF): no non-prime column depends on only part of a composite key.** The key is `(po_no, material_code)`, but `gst_rate` depends on `material_code` alone and `supplier_gstin` depends on `po_no` alone. Those are **partial dependencies**. Fix: move them to tables keyed by that part (`material`, `purchase_order`). A table with a single-column key is automatically in 2NF.

**Third normal form (3NF): no non-prime column depends on another non-prime column.** Inside `purchase_order(po_no, project_code, project_state)`, `project_state` depends on `project_code`, which depends on `po_no`. That chain is a **transitive dependency**. Fix: move `project_state` to `project`. The formal rule: for every FD `X → A`, either `X` is a superkey or `A` is prime.

**Boyce–Codd normal form (BCNF): every determinant is a superkey.** BCNF drops the "or `A` is prime" escape hatch. The two only differ when a table has overlapping candidate keys, which is rare but real. Example: a quality-control table `lab_assignment(project, test_type, lab)`. Business rules: a project sends each test type to exactly one lab (`project, test_type → lab`), and each lab is accredited for exactly one test type (`lab → test_type`). Candidate keys are `(project, test_type)` and `(project, lab)`. Every column is prime, so the table is in 3NF. But `lab` is a determinant and not a superkey, so it is not in BCNF: the fact "Lab Kalyan-Soils does soil compaction" is repeated for every project using that lab.

Decomposing to BCNF gives `lab(lab PK, test_type)` and `project_lab(project, lab)`. The repetition is gone, but the rule "one lab per test type per project" now spans two tables and cannot be a simple `UNIQUE` constraint. This is the classic trade-off: **3NF can always preserve every dependency; BCNF sometimes cannot.** Most teams stop at 3NF in such cases and accept the small redundancy, or keep BCNF and enforce the cross-table rule with a trigger.

Higher forms (4NF for independent multi-valued facts, 5NF for join dependencies) exist. In practice, if you model many-to-many relationships with one junction table per relationship, you rarely meet them.

### Decomposition must be lossless

Splitting a table is only safe if joining the pieces gives back exactly the original rows, no more and no fewer. The test for a split of `R` into `R1` and `R2`: the shared columns must be a key of at least one side. Splitting the sheet into `purchase_order(po_no, ...)` and `po_line(po_no, material_code, ...)` shares `po_no`, which is the key of `purchase_order`. Lossless. Splitting into `(po_no, supplier_name)` and `(supplier_name, material_code)` would share `supplier_name`, which is a key of neither, and the join would invent rows that never existed (spurious tuples).

### Not every repeated value is redundancy

Each `po_line` stores `unit_rate`. The `material` table may also hold a current list price. Is that a 3NF violation? No. The rate on the line is **the price agreed on that order on that date**. It is a different fact from "today's list price", and it must not change when the price list does. Copying the price at the moment of ordering is a **snapshot**, and it is correct modelling. The same applies to a delivery address on an invoice, the GST rate applied on a bill, or a customer's name as printed on a contract. Ask: "if the source changes tomorrow, should this value change?" If not, it is a snapshot, not a copy.

### Denormalization: deliberate copies, with a maintenance plan

A normalized schema answers every question correctly, but some questions get expensive. The project director's dashboard shows, for each of 400 projects, the committed value of all purchase orders. With 2 million order lines, that is a join plus an aggregate over 2 million rows on every page load. With an index on `po_line(po_no)` it may take a few hundred milliseconds (an estimate; measure on your data with `EXPLAIN ANALYZE`). At 20 dashboard loads per minute that is acceptable. At 2,000 per minute it is not.

Your options, from least to most risky:

1. **Do nothing yet.** Add the right index, measure. Most "we need to denormalize" claims are really "we need an index" (see [Indexes](#/lesson/m09-indexes)).
2. **Generated column.** A value computed from other columns *of the same row*, such as `line_value numeric GENERATED ALWAYS AS (qty * unit_rate) STORED`. PostgreSQL 17 recomputes it on every write; it can never drift. Free safety.
3. **Materialized view.** `CREATE MATERIALIZED VIEW project_commitment AS SELECT ...` stores the aggregate. `REFRESH MATERIALIZED VIEW CONCURRENTLY` rebuilds it (it needs a unique index on the view) without blocking readers. Data is stale between refreshes, for example up to 5 minutes. Good for dashboards.
4. **Maintained total column.** `project.committed_value` updated in the same transaction as every line insert, by application code or a trigger. Always current. The hidden cost: every line insert now also updates *one shared row* per project. If 50 lines per second land on the same mega-project, they queue on that row's lock. That is a hot row, and it turns a parallel workload into a serial one.
5. **Separate read model.** A projection table or another store fed by events ([CQRS fundamentals](#/lesson/m08-cqrs-fundamentals)). Most flexible, eventually consistent, most moving parts.

Whichever you pick, write down: **which value is the source of truth, who updates the copy, in which transaction, and which reconciliation query proves they agree.** A denormalized column without a reconciliation query is a bug that has not been discovered yet.

### The cost model in numbers

Think of normalization as paying on read and denormalization as paying on write.

- Normalized: a supplier rename touches 1 row. A dashboard read touches up to 2 million rows (or fewer with good indexes).
- Fully denormalized sheet: a supplier rename touches 412 rows and must find them all. A dashboard read touches 400 pre-computed rows.
- Maintained total: each of, say, 3,000 line inserts per day costs one extra `UPDATE`. That is about 0.035 extra writes per second, which is nothing, unless they cluster on one project, in which case lock waits, not row counts, become the cost.

The decision is about ratios: how often is the fact read versus changed, and how bad is a stale or wrong value?

## Visual explanation

### From one sheet to five tables

```mermaid
flowchart LR
    Sheet["po_sheet (flat)<br/>key: po_no + material_code<br/>14 columns"] -->|"po_no decides date, project, supplier"| PO["purchase_order<br/>po_no PK"]
    Sheet -->|"po_no + material_code decide qty, rate"| Line["po_line<br/>(po_no, material_code) PK"]
    Sheet -->|"material_code decides name, unit, GST"| Mat["material<br/>material_code PK"]
    PO -->|"project_code decides name, state"| Proj["project<br/>project_code PK"]
    PO -->|"supplier_gstin decides name, city"| Sup["supplier<br/>gstin PK"]
```

Each arrow is one functional dependency being given its own home. The two arrows leaving the sheet directly remove the **partial** dependencies (facts about only the order, or only the material), which gets us to 2NF. The two arrows leaving `purchase_order` remove the **transitive** dependencies (project and supplier facts reached through `po_no`), which gets us to 3NF. Every split shares a column that is the primary key of the new table, so all splits are lossless.

### The normalized model

```mermaid
erDiagram
    PROJECT ||--o{ PURCHASE_ORDER : "raises"
    SUPPLIER ||--o{ PURCHASE_ORDER : "receives"
    PURCHASE_ORDER ||--|{ PO_LINE : "contains"
    MATERIAL ||--o{ PO_LINE : "ordered as"
    PROJECT {
        text project_code PK
        text name
        text state
    }
    SUPPLIER {
        text gstin PK
        text name
        text city
    }
    MATERIAL {
        text material_code PK
        text name
        text unit
        numeric gst_rate
    }
    PURCHASE_ORDER {
        text po_no PK
        date po_date
        text project_code FK
        text supplier_gstin FK
    }
    PO_LINE {
        text po_no PK
        text material_code PK
        numeric qty
        numeric unit_rate
    }
```

Read the crow's-feet as "one to many". A project raises zero or more purchase orders, an order contains one or more lines, and a material can appear on many lines. Notice that `po_line` holds only keys plus its own facts. `unit_rate` stays on the line as a snapshot of the agreed price, not as a copy of anything.

### Keeping a denormalized total honest

```mermaid
sequenceDiagram
    participant API as PoLineEndpoint
    participant S as PurchaseOrderService
    participant DB as PostgreSQL
    participant R as NightlyReconciler
    API->>S: AddLineAsync(PO-1001, TMT-12, 40 t)
    S->>DB: BEGIN
    S->>DB: SELECT list_rate FROM material WHERE code = TMT-12
    S->>DB: INSERT po_line with unit_rate snapshot 56500
    S->>DB: UPDATE project SET committed_value = committed_value + 2260000
    S->>DB: COMMIT
    DB-->>S: OK
    S-->>API: LineAdded
    R->>DB: compare project.committed_value with SUM over po_line
    DB-->>R: drifted projects (expected none)
    Note over S,DB: Line insert and total update share one transaction, so the copy cannot be half-applied
```

The service reads the current list rate and stores it on the line as a snapshot. It then adds the line value (40 × ₹56,500 = ₹22,60,000) to the project's denormalized total in the *same* transaction, so a crash cannot leave one without the other. The reconciler at the bottom is the safety net: it recomputes totals from the source of truth and reports any project where the copy disagrees, which catches code paths (a bulk import, a manual fix) that forgot to update the copy.

## Step-by-step example

### Step 1 — list the dependencies of the flat sheet

```text
po_no                    -> po_date, project_code, supplier_gstin
project_code             -> project_name, project_state
supplier_gstin           -> supplier_name, supplier_city
material_code            -> material_name, unit, gst_rate
po_no, material_code     -> qty, rate
```

Candidate key: `(po_no, material_code)`. Non-prime: everything else.

### Step 2 — classify the violations

| Dependency | Problem | Normal form broken |
|---|---|---|
| `po_no → po_date, ...` | depends on part of the key | 2NF |
| `material_code → gst_rate, ...` | depends on part of the key | 2NF |
| `project_code → project_state` | non-prime decides non-prime | 3NF |
| `supplier_gstin → supplier_name` | non-prime decides non-prime | 3NF |

### Step 3 — create the normalized tables with the rules inside

```sql
CREATE TABLE project (
  project_code text PRIMARY KEY,
  name         text NOT NULL,
  state        text NOT NULL
);
CREATE TABLE supplier (
  gstin text PRIMARY KEY CHECK (gstin ~ '^[0-9]{2}[A-Z0-9]{13}$'),
  name  text NOT NULL,
  city  text NOT NULL
);
CREATE TABLE material (
  material_code text PRIMARY KEY,
  name          text NOT NULL,
  unit          text NOT NULL,
  gst_rate      numeric(5,2) NOT NULL CHECK (gst_rate IN (0, 5, 12, 18, 28))
);
CREATE TABLE purchase_order (
  po_no          text PRIMARY KEY,
  po_date        date NOT NULL,
  project_code   text NOT NULL REFERENCES project,
  supplier_gstin text NOT NULL REFERENCES supplier
);
CREATE TABLE po_line (
  po_no         text NOT NULL REFERENCES purchase_order ON DELETE CASCADE,
  material_code text NOT NULL REFERENCES material,
  qty           numeric(12,3) NOT NULL CHECK (qty > 0),
  unit_rate     numeric(12,2) NOT NULL CHECK (unit_rate > 0),
  line_value    numeric(16,2) GENERATED ALWAYS AS (qty * unit_rate) STORED,
  PRIMARY KEY (po_no, material_code)
);
```

All three anomalies are gone. A new material can be inserted before anyone orders it. Cancelling the last order for VG-40 deletes its lines but not the material. Renaming a supplier is one row. `line_value` is a generated column: a safe, same-row denormalization.

### Step 4 — migrate the data

```sql
INSERT INTO project (project_code, name, state)
SELECT DISTINCT project_code, project_name, project_state FROM po_sheet;
-- fails with a duplicate-key error if one project_code has two different states:
-- that is the migration finding your update anomalies for you.
```

Run a "conflicting copies" query first (exercise 1 does exactly this), fix the data with the business, then migrate. `DISTINCT` on all columns plus a primary key is a quick lossless check: if the insert succeeds, the dependency really held in the data.

### Step 5 — rebuild the old report with joins

```sql
SELECT p.project_code, s.name AS supplier, SUM(l.line_value) AS taxable_value
FROM po_line l
JOIN purchase_order o ON o.po_no = l.po_no
JOIN project p ON p.project_code = o.project_code
JOIN supplier s ON s.gstin = o.supplier_gstin
GROUP BY p.project_code, s.name
ORDER BY p.project_code, s.name;
```

Four joins sounds expensive, but each one is a primary-key lookup. PostgreSQL will typically hash-join the small dimension tables and scan `po_line` once. [Query planning](#/lesson/m09-query-planning) shows how to confirm that.

### Step 6 — decide on one denormalization, with a reconciler

The dashboard needs committed value per project in under 50 ms. We add `project.committed_value numeric(18,2) NOT NULL DEFAULT 0`, update it in the same transaction as each line insert, and run this nightly:

```sql
SELECT p.project_code, p.committed_value, COALESCE(SUM(l.line_value), 0) AS actual
FROM project p
LEFT JOIN purchase_order o ON o.project_code = p.project_code
LEFT JOIN po_line l ON l.po_no = o.po_no
GROUP BY p.project_code, p.committed_value
HAVING p.committed_value <> COALESCE(SUM(l.line_value), 0);
```

An empty result is the proof the copy is honest.

## Production-style C# implementation

The compilable code below has two parts. `Procurement.Schema` is a small functional-dependency analyzer: give it columns and FDs, and it reports candidate keys and 2NF, 3NF and BCNF violations. It is the same algorithm you just ran by hand, and it is handy in a design review or a migration tool. `Procurement.Orders` shows the denormalized-total pattern behind an interface, with an in-memory store; a real store would use Npgsql or EF Core inside one transaction (snippet afterwards).

```text
Procurement.Api/
  Program.cs
  Schema/FunctionalDependency.cs
  Schema/SchemaAnalyzer.cs
  Orders/Models.cs
  Orders/IProcurementStore.cs
  Orders/InMemoryProcurementStore.cs
  Orders/PurchaseOrderService.cs
```

```csharp file=Schema/FunctionalDependency.cs
namespace Procurement.Schema;

/// <summary>X -> Y: rows that agree on Left must agree on Right.</summary>
public sealed class FunctionalDependency
{
    public FunctionalDependency(IEnumerable<string> left, IEnumerable<string> right)
    {
        Left = new HashSet<string>(left, StringComparer.OrdinalIgnoreCase);
        Right = new HashSet<string>(right, StringComparer.OrdinalIgnoreCase);
        if (Left.Count == 0 || Right.Count == 0) throw new ArgumentException("Both sides need at least one column.");
    }

    public IReadOnlySet<string> Left { get; }
    public IReadOnlySet<string> Right { get; }

    /// <summary>Parses "po_no, material_code -> qty, rate".</summary>
    public static FunctionalDependency Parse(string text)
    {
        var parts = text.Split("->", 2, StringSplitOptions.TrimEntries);
        if (parts.Length != 2) throw new FormatException($"Expected 'a, b -> c' but got '{text}'.");
        return new FunctionalDependency(Columns(parts[0]), Columns(parts[1]));
    }

    private static string[] Columns(string s) =>
        s.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);

    public override string ToString() =>
        $"{string.Join(", ", Left.Order(StringComparer.Ordinal))} -> {string.Join(", ", Right.Order(StringComparer.Ordinal))}";
}

public sealed class RelationSchema
{
    public RelationSchema(string name, IEnumerable<string> attributes, IEnumerable<FunctionalDependency> dependencies)
    {
        Name = name;
        Attributes = new HashSet<string>(attributes, StringComparer.OrdinalIgnoreCase);
        Dependencies = dependencies.ToList();
        foreach (var fd in Dependencies)
            if (!fd.Left.Concat(fd.Right).All(Attributes.Contains))
                throw new ArgumentException($"Dependency '{fd}' uses a column that is not in {name}.");
    }

    public string Name { get; }
    public IReadOnlySet<string> Attributes { get; }
    public IReadOnlyList<FunctionalDependency> Dependencies { get; }
}

public enum NormalForm { First = 1, Second = 2, Third = 3, BoyceCodd = 4 }

public sealed record Violation(NormalForm Breaks, string Dependency, string Reason);

public sealed record NormalizationReport(
    string Relation,
    IReadOnlyList<string> CandidateKeys,
    NormalForm HighestNormalForm,
    IReadOnlyList<Violation> Violations);
```

```csharp file=Schema/SchemaAnalyzer.cs
using System.Numerics;

namespace Procurement.Schema;

public static class SchemaAnalyzer
{
    /// <summary>Everything the start columns decide, directly or through chains (X+).</summary>
    public static HashSet<string> Closure(IEnumerable<string> start, IReadOnlyList<FunctionalDependency> fds)
    {
        var result = new HashSet<string>(start, StringComparer.OrdinalIgnoreCase);
        bool changed;
        do
        {
            changed = false;
            foreach (var fd in fds)
            {
                if (fd.Left.All(result.Contains) && !fd.Right.All(result.Contains))
                {
                    result.UnionWith(fd.Right);
                    changed = true;   // a new column may unlock an FD we already skipped, so loop again
                }
            }
        } while (changed);
        return result;
    }

    public static bool IsSuperkey(RelationSchema r, IEnumerable<string> columns) =>
        Closure(columns, r.Dependencies).IsSupersetOf(r.Attributes);

    /// <summary>Minimal superkeys, smallest first. Brute force is fine for the 5-20 columns of a real table.</summary>
    public static IReadOnlyList<IReadOnlySet<string>> CandidateKeys(RelationSchema r)
    {
        var cols = r.Attributes.Order(StringComparer.Ordinal).ToArray();
        if (cols.Length > 20) throw new ArgumentException("Too many columns for exhaustive key search.");
        var keys = new List<IReadOnlySet<string>>();
        var masks = Enumerable.Range(1, (1 << cols.Length) - 1).OrderBy(m => BitOperations.PopCount((uint)m));
        foreach (var mask in masks)
        {
            var subset = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < cols.Length; i++) if ((mask & (1 << i)) != 0) subset.Add(cols[i]);
            if (keys.Any(k => k.IsSubsetOf(subset))) continue;   // not minimal
            if (IsSuperkey(r, subset)) keys.Add(subset);
        }
        return keys;
    }

    public static NormalizationReport Analyze(RelationSchema r)
    {
        var keys = CandidateKeys(r);
        var prime = new HashSet<string>(keys.SelectMany(k => k), StringComparer.OrdinalIgnoreCase);
        var violations = new List<Violation>();

        foreach (var fd in r.Dependencies)
        {
            var dependent = fd.Right.Where(c => !fd.Left.Contains(c)).ToList();
            if (dependent.Count == 0) continue;                         // trivial: X -> part of X
            if (IsSuperkey(r, fd.Left)) continue;                        // fine in every normal form

            var nonPrime = dependent.Where(c => !prime.Contains(c)).ToList();
            var partOfKey = keys.Any(k => fd.Left.All(k.Contains) && fd.Left.Count < k.Count);

            if (nonPrime.Count > 0 && partOfKey)
                violations.Add(new Violation(NormalForm.Second, fd.ToString(),
                    $"{string.Join(", ", nonPrime)} depend(s) on only part of a candidate key"));
            else if (nonPrime.Count > 0)
                violations.Add(new Violation(NormalForm.Third, fd.ToString(),
                    $"non-key columns {string.Join(", ", fd.Left)} decide non-prime {string.Join(", ", nonPrime)}"));
            else
                violations.Add(new Violation(NormalForm.BoyceCodd, fd.ToString(),
                    $"{string.Join(", ", fd.Left)} is a determinant but not a superkey"));
        }

        var highest = violations.Count == 0
            ? NormalForm.BoyceCodd
            : (NormalForm)((int)violations.Min(v => v.Breaks) - 1);
        var keyText = keys.Select(k => "(" + string.Join(", ", k.Order(StringComparer.Ordinal)) + ")").ToList();
        return new NormalizationReport(r.Name, keyText, highest, violations);
    }
}
```

```csharp file=Orders/Models.cs
namespace Procurement.Orders;

public sealed record Material(string Code, string Name, string Unit, decimal GstRate, decimal ListRate);

public sealed record PoLine(string PoNo, string MaterialCode, decimal Qty, decimal UnitRate)
{
    // Same-row derived value, like a STORED generated column: cannot drift.
    public decimal LineValue => Qty * UnitRate;
}

public sealed record Drift(string ProjectCode, decimal Stored, decimal Actual);

public enum AddLineOutcome { Added, UnknownOrder, UnknownMaterial, DuplicateLine }
```

```csharp file=Orders/IProcurementStore.cs
namespace Procurement.Orders;

public interface IProcurementStore
{
    Task<Material?> FindMaterialAsync(string code, CancellationToken ct = default);
    Task<string?> ProjectOfOrderAsync(string poNo, CancellationToken ct = default);

    /// <summary>
    /// Inserts the line AND adds its value to the project's denormalized total atomically.
    /// In PostgreSQL this is one transaction: INSERT po_line, then UPDATE project SET committed_value = committed_value + @v.
    /// Returns false if the line already exists (primary key violation).
    /// </summary>
    Task<bool> AddLineAndBumpTotalAsync(string projectCode, PoLine line, CancellationToken ct = default);

    Task<decimal> StoredTotalAsync(string projectCode, CancellationToken ct = default);

    /// <summary>The reconciliation query: stored totals versus SUM(line_value) from the source of truth.</summary>
    Task<IReadOnlyList<Drift>> FindDriftAsync(CancellationToken ct = default);
}
```

```csharp file=Orders/InMemoryProcurementStore.cs
namespace Procurement.Orders;

/// <summary>In-memory stand-in for the normalized tables plus one denormalized column (project.committed_value).</summary>
public sealed class InMemoryProcurementStore : IProcurementStore
{
    private readonly object _gate = new();
    private readonly Dictionary<string, Material> _materials = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _orderProject = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<(string, string), PoLine> _lines = new();
    private readonly Dictionary<string, decimal> _committed = new(StringComparer.OrdinalIgnoreCase);

    public InMemoryProcurementStore AddMaterial(Material m) { lock (_gate) _materials[m.Code] = m; return this; }
    public InMemoryProcurementStore AddProject(string code) { lock (_gate) _committed.TryAdd(code, 0m); return this; }
    public InMemoryProcurementStore AddOrder(string poNo, string projectCode) { lock (_gate) _orderProject[poNo] = projectCode; return this; }

    /// <summary>Simulates a bulk import that bypasses the service and forgets the copy. The reconciler must catch it.</summary>
    public void ImportLineWithoutTotal(PoLine line) { lock (_gate) _lines[(line.PoNo, line.MaterialCode)] = line; }

    public Task<Material?> FindMaterialAsync(string code, CancellationToken ct = default)
    {
        lock (_gate) return Task.FromResult(_materials.GetValueOrDefault(code));
    }

    public Task<string?> ProjectOfOrderAsync(string poNo, CancellationToken ct = default)
    {
        lock (_gate) return Task.FromResult(_orderProject.GetValueOrDefault(poNo));
    }

    public Task<bool> AddLineAndBumpTotalAsync(string projectCode, PoLine line, CancellationToken ct = default)
    {
        lock (_gate)   // the lock plays the role of one database transaction
        {
            if (!_lines.TryAdd((line.PoNo, line.MaterialCode), line)) return Task.FromResult(false);
            _committed[projectCode] = _committed.GetValueOrDefault(projectCode) + line.LineValue;
            return Task.FromResult(true);
        }
    }

    public Task<decimal> StoredTotalAsync(string projectCode, CancellationToken ct = default)
    {
        lock (_gate) return Task.FromResult(_committed.GetValueOrDefault(projectCode));
    }

    public Task<IReadOnlyList<Drift>> FindDriftAsync(CancellationToken ct = default)
    {
        lock (_gate)
        {
            var actual = _lines.Values
                .GroupBy(l => _orderProject[l.PoNo], StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.Sum(l => l.LineValue), StringComparer.OrdinalIgnoreCase);
            IReadOnlyList<Drift> drift = _committed
                .Select(p => new Drift(p.Key, p.Value, actual.GetValueOrDefault(p.Key)))
                .Where(d => d.Stored != d.Actual)
                .OrderBy(d => d.ProjectCode, StringComparer.Ordinal)
                .ToList();
            return Task.FromResult(drift);
        }
    }
}
```

```csharp file=Orders/PurchaseOrderService.cs
using Microsoft.Extensions.Logging;

namespace Procurement.Orders;

public sealed class PurchaseOrderService(IProcurementStore store, ILogger<PurchaseOrderService> log)
{
    public async Task<AddLineOutcome> AddLineAsync(string poNo, string materialCode, decimal qty, CancellationToken ct = default)
    {
        if (qty <= 0) throw new ArgumentOutOfRangeException(nameof(qty), "CHECK (qty > 0)");

        var project = await store.ProjectOfOrderAsync(poNo, ct);
        if (project is null) return AddLineOutcome.UnknownOrder;

        var material = await store.FindMaterialAsync(materialCode, ct);
        if (material is null) return AddLineOutcome.UnknownMaterial;

        // Snapshot: the agreed rate is stored on the line and never follows later price-list changes.
        var line = new PoLine(poNo, material.Code, qty, material.ListRate);

        var added = await store.AddLineAndBumpTotalAsync(project, line, ct);
        if (!added) return AddLineOutcome.DuplicateLine;

        log.LogInformation("PO {PoNo}: {Qty} {Unit} of {Material} at {Rate}", poNo, qty, material.Unit, material.Code, line.UnitRate);
        return AddLineOutcome.Added;
    }
}
```

```csharp file=Program.cs
using Procurement.Orders;
using Procurement.Schema;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<IProcurementStore>(_ => new InMemoryProcurementStore()
    .AddMaterial(new Material("TMT-12", "TMT bar 12 mm", "tonne", 18m, 56_500m))
    .AddMaterial(new Material("VG-30", "Bitumen VG-30", "tonne", 18m, 48_200m))
    .AddProject("NGP-RR").AddProject("LKO-BP")
    .AddOrder("PO-1001", "NGP-RR").AddOrder("PO-1002", "LKO-BP"));
builder.Services.AddScoped<PurchaseOrderService>();

var app = builder.Build();

app.MapPost("/schema/analyze", (SchemaRequest req) =>
{
    var schema = new RelationSchema(req.Name, req.Columns, req.Dependencies.Select(FunctionalDependency.Parse));
    return Results.Ok(SchemaAnalyzer.Analyze(schema));
});

app.MapPost("/orders/{poNo}/lines", async (string poNo, AddLineRequest req, PurchaseOrderService svc, CancellationToken ct) =>
    await svc.AddLineAsync(poNo, req.MaterialCode, req.Qty, ct) switch
    {
        AddLineOutcome.Added => Results.Created($"/orders/{poNo}/lines/{req.MaterialCode}", null),
        AddLineOutcome.DuplicateLine => Results.Conflict(),
        _ => Results.NotFound(),
    });

app.MapGet("/admin/reconcile", async (IProcurementStore store, CancellationToken ct) => Results.Ok(await store.FindDriftAsync(ct)));

app.Run();

public sealed record SchemaRequest(string Name, string[] Columns, string[] Dependencies);
public sealed record AddLineRequest(string MaterialCode, decimal Qty);
```

### The same atomic "line plus total" on PostgreSQL

```csharp
// Not compiled by the course checker: requires the Npgsql package.
await using var conn = await dataSource.OpenConnectionAsync(ct);
await using var tx = await conn.BeginTransactionAsync(ct);
await using (var ins = new NpgsqlCommand(
    "INSERT INTO po_line (po_no, material_code, qty, unit_rate) VALUES (@po, @m, @q, @r) ON CONFLICT DO NOTHING", conn, tx))
{
    ins.Parameters.AddWithValue("po", poNo); ins.Parameters.AddWithValue("m", code);
    ins.Parameters.AddWithValue("q", qty);   ins.Parameters.AddWithValue("r", rate);
    if (await ins.ExecuteNonQueryAsync(ct) == 0) { await tx.RollbackAsync(ct); return AddLineOutcome.DuplicateLine; }
}
await using (var bump = new NpgsqlCommand(
    "UPDATE project SET committed_value = committed_value + @v WHERE project_code = @p", conn, tx))
{
    bump.Parameters.AddWithValue("v", qty * rate); bump.Parameters.AddWithValue("p", projectCode);
    await bump.ExecuteNonQueryAsync(ct);
}
await tx.CommitAsync(ct);
```

With EF Core, model the generated column with `.HasComputedColumnSql("qty * unit_rate", stored: true)` so EF never tries to write it, and do the total bump with `ExecuteUpdateAsync(s => s.SetProperty(p => p.CommittedValue, p => p.CommittedValue + value))` inside the same `SaveChanges` transaction.

:::callout type=warning title="A trigger-maintained total turns parallel inserts into a queue"
`UPDATE project SET committed_value = ...` takes a row lock on that project until commit. If an import loads 10,000 lines for one project with 16 parallel workers, all 16 wait on the same row. Either batch the bump (add the batch's sum once per transaction), or use a materialized view refreshed every few minutes when the dashboard can tolerate staleness.
:::

## Bad design vs good design

**Bad: the flat table, plus "helpful" copies everywhere.**

```sql
-- Anti-pattern: one wide table and a comma-separated list
CREATE TABLE po_sheet (
  po_no text, po_date date, project_code text, project_name text, project_state text,
  supplier_gstin text, supplier_name text, supplier_city text,
  materials text,                -- 'TMT-12:40, TMT-16:25'  (breaks 1NF)
  total_value numeric            -- typed in by hand, never reconciled
);
```

What goes wrong: you cannot put a foreign key on `materials`, so typos like `TMT12` are accepted. The supplier's name differs between orders. `total_value` disagrees with the lines after the first manual edit. Every report starts with string parsing.

**Good: normalized core, one deliberate copy with a plan.**

- Five 3NF tables with keys, foreign keys and `CHECK`s (Step 3).
- `line_value` as a `STORED` generated column.
- `project.committed_value` maintained in the same transaction as each line, plus the nightly reconciliation query from Step 6.

**When is the extra structure not worth it?** A one-off analysis of last year's spend, loaded once and never updated, can stay flat; anomalies only matter when data changes. Append-only event or log tables (GPS pings, audit records) are often deliberately wide, because rows are never updated and reads want everything in one place. And a reporting warehouse is usually denormalized into a star schema on purpose, because it is rebuilt from the normalized source rather than edited.

:::callout type=tradeoff title="Normalize the writes, denormalize the reads"
A useful default: the tables you write to are in 3NF, because that is where anomalies bite. The structures you read from at scale (materialized views, read models, search indexes, caches) can be as denormalized as the screens need, because they are derived and can be rebuilt.
:::

## Practical playground

The playground contains the flat `po_sheet` (with deliberate anomalies) and the normalized tables populated from cleaned data. Try:

1. Find every `supplier_gstin` in `po_sheet` that appears with more than one `supplier_name`. That is an update anomaly in the wild.
2. Try `INSERT INTO project SELECT DISTINCT project_code, project_name, project_state FROM po_sheet;` and read the error.
3. Insert a material that has never been ordered (`OPC-53`, cement, bag, 28 %). Notice it is impossible in `po_sheet` without inventing a PO.
4. Rebuild the "spend per project per supplier" report from the normalized tables with joins.
5. Run the reconciliation query from Step 6. Then corrupt one `committed_value` with an `UPDATE` and run it again.
6. Compare `SELECT * FROM po_line` with its generated `line_value` column, then try to `UPDATE po_line SET line_value = 1` and read the error.

:::playground type=sql title="Procurement: flat sheet versus normalized tables"
```sql
CREATE TABLE po_sheet (
  po_no text, po_date date, project_code text, project_name text, project_state text,
  supplier_gstin text, supplier_name text, supplier_city text,
  material_code text, material_name text, unit text, gst_rate numeric(5,2),
  qty numeric(12,3), rate numeric(12,2)
);
INSERT INTO po_sheet VALUES
 ('PO-1001','2026-07-02','NGP-RR','Nagpur Ring Road Pkg 2','Maharashtra','27AAFCD4410K1Z3','Deccan Steel Stockists','Nagpur','TMT-12','TMT bar 12 mm','tonne',18,40,56500),
 ('PO-1001','2026-07-02','NGP-RR','Nagpur Ring Road Pkg 2','Maharashtra','27AAFCD4410K1Z3','Deccan Steel Stockists','Nagpur','TMT-16','TMT bar 16 mm','tonne',18,25,55800),
 ('PO-1002','2026-07-05','LKO-BP','Lucknow Bypass','Uttar Pradesh','09AAKCG7721M1Z8','Ganga Bitumen Supply','Kanpur','VG-30','Bitumen VG-30','tonne',18,60,48200),
 ('PO-1003','2026-07-09','GGN-FO','Gurugram Flyover','Haryana','06AABCA9083H1Z1','Aravalli Aggregates','Gurugram','AGG-20','Aggregate 20 mm','cum',5,900,1450),
 ('PO-1004','2026-07-15','NGP-RR','Nagpur Ring Road Pkg 2','Maharastra','27AAFCD4410K1Z3','Deccan Steel Stockist','Nagpur','TMT-12','TMT bar 12 mm','tonne',18,30,57200),
 ('PO-1005','2026-07-21','LKO-BP','Lucknow Bypass','Uttar Pradesh','09AAKCG7721M1Z8','Ganga Bitumen Supply','Kanpur','VG-40','Bitumen VG-40','tonne',18,20,51900),
 ('PO-1006','2026-08-01','GGN-FO','Gurugram Flyover','Haryana','06AABCA9083H1Z1','Aravalli Aggregates','Gurgaon','AGG-10','Aggregate 10 mm','cum',5,450,1520),
 ('PO-1006','2026-08-01','GGN-FO','Gurugram Flyover','Haryana','06AABCA9083H1Z1','Aravalli Aggregates','Gurgaon','AGG-20','Aggregate 20 mm','cum',5,600,1450);

CREATE TABLE project (project_code text PRIMARY KEY, name text NOT NULL, state text NOT NULL,
                      committed_value numeric(18,2) NOT NULL DEFAULT 0);
CREATE TABLE supplier (gstin text PRIMARY KEY, name text NOT NULL, city text NOT NULL);
CREATE TABLE material (material_code text PRIMARY KEY, name text NOT NULL, unit text NOT NULL,
                       gst_rate numeric(5,2) NOT NULL CHECK (gst_rate IN (0,5,12,18,28)));
CREATE TABLE purchase_order (po_no text PRIMARY KEY, po_date date NOT NULL,
                             project_code text NOT NULL REFERENCES project,
                             supplier_gstin text NOT NULL REFERENCES supplier);
CREATE TABLE po_line (po_no text NOT NULL REFERENCES purchase_order ON DELETE CASCADE,
                      material_code text NOT NULL REFERENCES material,
                      qty numeric(12,3) NOT NULL CHECK (qty > 0),
                      unit_rate numeric(12,2) NOT NULL CHECK (unit_rate > 0),
                      line_value numeric(16,2) GENERATED ALWAYS AS (qty * unit_rate) STORED,
                      PRIMARY KEY (po_no, material_code));

INSERT INTO project (project_code, name, state) VALUES
 ('NGP-RR','Nagpur Ring Road Pkg 2','Maharashtra'), ('LKO-BP','Lucknow Bypass','Uttar Pradesh'),
 ('GGN-FO','Gurugram Flyover','Haryana'), ('PAT-BR','Patna Ganga Bridge Approach','Bihar');
INSERT INTO supplier VALUES
 ('27AAFCD4410K1Z3','Deccan Steel Stockists','Nagpur'), ('09AAKCG7721M1Z8','Ganga Bitumen Supply','Kanpur'),
 ('06AABCA9083H1Z1','Aravalli Aggregates','Gurugram');
INSERT INTO material VALUES
 ('TMT-12','TMT bar 12 mm','tonne',18), ('TMT-16','TMT bar 16 mm','tonne',18), ('VG-30','Bitumen VG-30','tonne',18),
 ('VG-40','Bitumen VG-40','tonne',18), ('AGG-10','Aggregate 10 mm','cum',5), ('AGG-20','Aggregate 20 mm','cum',5);
INSERT INTO purchase_order VALUES
 ('PO-1001','2026-07-02','NGP-RR','27AAFCD4410K1Z3'), ('PO-1002','2026-07-05','LKO-BP','09AAKCG7721M1Z8'),
 ('PO-1003','2026-07-09','GGN-FO','06AABCA9083H1Z1'), ('PO-1004','2026-07-15','NGP-RR','27AAFCD4410K1Z3'),
 ('PO-1005','2026-07-21','LKO-BP','09AAKCG7721M1Z8'), ('PO-1006','2026-08-01','GGN-FO','06AABCA9083H1Z1');
INSERT INTO po_line (po_no, material_code, qty, unit_rate) VALUES
 ('PO-1001','TMT-12',40,56500), ('PO-1001','TMT-16',25,55800), ('PO-1002','VG-30',60,48200),
 ('PO-1003','AGG-20',900,1450), ('PO-1004','TMT-12',30,57200), ('PO-1005','VG-40',20,51900),
 ('PO-1006','AGG-10',450,1520), ('PO-1006','AGG-20',600,1450);
UPDATE project p SET committed_value = s.total
FROM (SELECT o.project_code, SUM(l.line_value) AS total
      FROM po_line l JOIN purchase_order o ON o.po_no = l.po_no GROUP BY o.project_code) s
WHERE s.project_code = p.project_code;
```
:::

## Exercises

:::exercise id=m09-normalization-ex1 difficulty=beginner kind=sql ordered=true title="Find the update anomalies in the flat sheet"
The procurement sheet copies supplier details onto every line. Find every `supplier_gstin` whose rows disagree about the supplier's name or city. Return `supplier_gstin`, `name_variants` (number of distinct names), `city_variants` (number of distinct cities) and `names` (the distinct names joined with `' | '`, in alphabetical order). Order by `supplier_gstin`.
::acceptance
- Only GSTINs with more than one distinct name **or** more than one distinct city appear.
- `names` lists each distinct spelling once, alphabetically, separated by `' | '`.
- Column names exactly as specified.
::hint
Group the sheet by the column that is supposed to decide the others: `supplier_gstin`.
::hint
`COUNT(DISTINCT supplier_name)` tells you how many spellings exist for one GSTIN.
::hint
Filter groups with `HAVING`, not `WHERE`, because the condition is on an aggregate.
::hint
`string_agg(DISTINCT supplier_name, ' | ' ORDER BY supplier_name)` builds the list. With `DISTINCT`, the `ORDER BY` must use the same expression.
::setup
```sql
CREATE TABLE po_sheet (
  po_no text, po_date date, project_code text, project_state text,
  supplier_gstin text, supplier_name text, supplier_city text,
  material_code text, qty numeric(12,3), rate numeric(12,2)
);
INSERT INTO po_sheet VALUES
 ('PO-1001','2026-07-02','NGP-RR','Maharashtra','27AAFCD4410K1Z3','Deccan Steel Stockists','Nagpur','TMT-12',40,56500),
 ('PO-1001','2026-07-02','NGP-RR','Maharashtra','27AAFCD4410K1Z3','Deccan Steel Stockists','Nagpur','TMT-16',25,55800),
 ('PO-1002','2026-07-05','LKO-BP','Uttar Pradesh','09AAKCG7721M1Z8','Ganga Bitumen Supply','Kanpur','VG-30',60,48200),
 ('PO-1003','2026-07-09','GGN-FO','Haryana','06AABCA9083H1Z1','Aravalli Aggregates','Gurugram','AGG-20',900,1450),
 ('PO-1004','2026-07-15','NGP-RR','Maharastra','27AAFCD4410K1Z3','Deccan Steel Stockist','Nagpur','TMT-12',30,57200),
 ('PO-1005','2026-07-21','LKO-BP','Uttar Pradesh','09AAKCG7721M1Z8','Ganga Bitumen Supply','Kanpur','VG-40',20,51900),
 ('PO-1006','2026-08-01','GGN-FO','Haryana','06AABCA9083H1Z1','Aravalli Aggregates','Gurgaon','AGG-10',450,1520),
 ('PO-1006','2026-08-01','GGN-FO','Haryana','06AABCA9083H1Z1','Aravalli Aggregates','Gurgaon','AGG-20',600,1450),
 ('PO-1007','2026-08-04','PAT-BR','Bihar','10AAHCK3301B1Z6','Kosi Cement Depot','Patna','OPC-53',2000,385),
 ('PO-1008','2026-08-11','PAT-BR','Bihar','10AAHCK3301B1Z6','KOSI CEMENT DEPOT','Patna','OPC-53',1500,390);
```
::check
```sql
SELECT supplier_gstin,
       COUNT(DISTINCT supplier_name) AS name_variants,
       COUNT(DISTINCT supplier_city) AS city_variants,
       string_agg(DISTINCT supplier_name, ' | ' ORDER BY supplier_name) AS names
FROM po_sheet
GROUP BY supplier_gstin
HAVING COUNT(DISTINCT supplier_name) > 1 OR COUNT(DISTINCT supplier_city) > 1
ORDER BY supplier_gstin;
```
::solution
```sql
SELECT supplier_gstin,
       COUNT(DISTINCT supplier_name) AS name_variants,
       COUNT(DISTINCT supplier_city) AS city_variants,
       string_agg(DISTINCT supplier_name, ' | ' ORDER BY supplier_name) AS names
FROM po_sheet
GROUP BY supplier_gstin
HAVING COUNT(DISTINCT supplier_name) > 1 OR COUNT(DISTINCT supplier_city) > 1
ORDER BY supplier_gstin;
```
Three suppliers disagree with themselves. Aravalli Aggregates (`06...`) has one name but two cities (Gurugram and the old name Gurgaon). Kosi Cement Depot (`10...`) has two spellings that differ only in case, and Deccan Steel (`27...`) has a missing "s". Ganga Bitumen is consistent only by luck. Every one of these is an update anomaly: the dependency `supplier_gstin → supplier_name, supplier_city` is true in the business but nothing in the schema enforces it. In the normalized design, `gstin` is the primary key of `supplier`, so a second spelling is impossible. Running this query before a migration tells you which rows a human must clean first.
::mistakes
- Using `WHERE COUNT(...) > 1`, which is a syntax error: aggregates are filtered with `HAVING`.
- Grouping by `supplier_name` instead of `supplier_gstin`, which hides the problem because each spelling becomes its own group.
- Treating the case-only difference as "not a real duplicate". It is: a join or `GROUP BY` on name would split that supplier in two.
:::

:::exercise id=m09-normalization-ex2 difficulty=beginner kind=code title="Compute an attribute closure"
Implement the closure algorithm: given a starting set of columns and a list of functional dependencies, return every column the start decides, directly or through chains. Then implement `Determines`, which answers "does this set of columns decide that column?".
::requirements
- `Closure` must keep looping until a full pass adds nothing new, because a column added late can unlock a dependency that was skipped earlier in the same pass.
- Column names are compared case-insensitively.
- The start columns are always part of their own closure.
::acceptance
- `{po_no}` decides the date, project, supplier and the project's and supplier's details, but not `material_code` or `qty`.
- `{po_no, material_code}` decides all 14 columns of the sheet.
- The result is correct even when the dependencies are listed in an order that requires several passes.
::hint
Start with a set that contains the input columns. A dependency "fires" when all of its left-hand columns are already in the set.
::hint
When a dependency fires, add all of its right-hand columns. Remember whether anything changed in this pass.
::hint
Wrap the pass in `do { ... } while (changed);`.
::hint
```csharp
var result = new HashSet<string>(start, StringComparer.OrdinalIgnoreCase);
bool changed;
do
{
    changed = false;
    foreach (var fd in fds)
        if (fd.Left.All(result.Contains) && !fd.Right.All(result.Contains)) { /* add, set changed */ }
} while (changed);
```
::starter
```csharp file=FdClosure.cs
using System;
using System.Collections.Generic;
using System.Linq;

public sealed record Fd(string[] Left, string[] Right);

public static class FdClosure
{
    public static HashSet<string> Closure(IEnumerable<string> start, IReadOnlyList<Fd> fds) =>
        throw new NotImplementedException();

    public static bool Determines(IEnumerable<string> left, string column, IReadOnlyList<Fd> fds) =>
        throw new NotImplementedException();
}
```
::tests
```csharp file=FdClosureTests.cs
using System.Collections.Generic;
using Xunit;

public class FdClosureTests
{
    private static readonly List<Fd> Sheet = new()
    {
        new Fd(new[] { "po_no" }, new[] { "po_date", "project_code", "supplier_gstin" }),
        new Fd(new[] { "project_code" }, new[] { "project_name", "project_state" }),
        new Fd(new[] { "supplier_gstin" }, new[] { "supplier_name", "supplier_city" }),
        new Fd(new[] { "material_code" }, new[] { "material_name", "unit", "gst_rate" }),
        new Fd(new[] { "po_no", "material_code" }, new[] { "qty", "rate" }),
    };

    [Fact]
    public void Po_no_decides_order_project_and_supplier_facts()
    {
        var c = FdClosure.Closure(new[] { "po_no" }, Sheet);
        Assert.Equal(8, c.Count);
        Assert.Contains("project_state", c);
        Assert.Contains("supplier_city", c);
        Assert.DoesNotContain("material_code", c);
        Assert.DoesNotContain("qty", c);
    }

    [Fact]
    public void Composite_key_decides_everything()
    {
        var c = FdClosure.Closure(new[] { "po_no", "material_code" }, Sheet);
        Assert.Equal(14, c.Count);
    }

    [Fact]
    public void Needs_multiple_passes_when_dependencies_are_listed_backwards()
    {
        var backwards = new List<Fd>
        {
            new Fd(new[] { "c" }, new[] { "d" }),
            new Fd(new[] { "b" }, new[] { "c" }),
            new Fd(new[] { "a" }, new[] { "b" }),
        };
        var c = FdClosure.Closure(new[] { "a" }, backwards);
        Assert.Equal(4, c.Count);
        Assert.Contains("d", c);
    }

    [Fact]
    public void Comparison_is_case_insensitive()
    {
        Assert.True(FdClosure.Determines(new[] { "PROJECT_CODE" }, "Project_State", Sheet));
    }

    [Fact]
    public void Material_does_not_decide_supplier()
    {
        Assert.False(FdClosure.Determines(new[] { "material_code" }, "supplier_name", Sheet));
        Assert.True(FdClosure.Determines(new[] { "material_code" }, "material_code", Sheet));
    }
}
```
::solution
```csharp file=FdClosure.cs
using System;
using System.Collections.Generic;
using System.Linq;

public sealed record Fd(string[] Left, string[] Right);

public static class FdClosure
{
    public static HashSet<string> Closure(IEnumerable<string> start, IReadOnlyList<Fd> fds)
    {
        var result = new HashSet<string>(start, StringComparer.OrdinalIgnoreCase);
        bool changed;
        do
        {
            changed = false;
            foreach (var fd in fds)
            {
                if (fd.Left.All(result.Contains) && !fd.Right.All(result.Contains))
                {
                    result.UnionWith(fd.Right);
                    changed = true;
                }
            }
        } while (changed);
        return result;
    }

    public static bool Determines(IEnumerable<string> left, string column, IReadOnlyList<Fd> fds) =>
        Closure(left, fds).Contains(column);
}
```
The loop is a fixed-point computation: it stops only when a full pass changes nothing. With `n` dependencies it runs at most `n + 1` passes, because every productive pass fires at least one new dependency. The `!fd.Right.All(result.Contains)` guard is what prevents an infinite loop.
::mistakes
- Doing one pass only. It works when dependencies happen to be listed in "chain order" and silently fails otherwise (the third test).
- Building the `HashSet` with the default comparer, so `PROJECT_CODE` and `project_code` are treated as different columns.
- Setting `changed = true` every time a dependency fires, even if it adds nothing new, which loops forever.
::extensions
Use `Closure` to write `IsSuperkey(attributes, columns, fds)`, then find all candidate keys (exercise 4).
:::

:::exercise id=m09-normalization-ex3 difficulty=intermediate kind=sql ordered=true title="Rebuild the GST spend report from normalized tables"
After normalization, finance still wants the old report. For **every** project (including ones with no orders yet), return `project_code`, `project_name`, `order_count` (number of distinct purchase orders), `taxable_value` (sum of `qty × unit_rate`) and `gst_amount` (sum of `qty × unit_rate × gst_rate / 100`, rounded to 2 decimals). Projects without orders show `0` for all three numbers. Order by `project_code`.
::acceptance
- Uses joins across `project`, `purchase_order`, `po_line` and `material`.
- A project with no orders still appears with zeros.
- GST is computed per line using the material's rate, not one rate for the whole project.
- `taxable_value` and `gst_amount` have exactly 2 decimal places.
::hint
Start from `project` and `LEFT JOIN` outwards, so projects with no orders survive.
::hint
The GST rate lives on `material`. Join `po_line` to `material` to get the rate for each line.
::hint
When a project has no lines, `SUM(...)` returns `NULL`. Wrap it in `COALESCE(..., 0)`. Use `COUNT(DISTINCT o.po_no)` because one order has several lines.
::hint
Joining `po_line` and `material` together inside the left join (`LEFT JOIN (po_line l JOIN material m ON ...) ON l.po_no = o.po_no`) keeps the inner join from removing projects. Round with `round(x, 2)`.
::setup
```sql
CREATE TABLE project (project_code text PRIMARY KEY, name text NOT NULL, state text NOT NULL);
CREATE TABLE supplier (gstin text PRIMARY KEY, name text NOT NULL, city text NOT NULL);
CREATE TABLE material (material_code text PRIMARY KEY, name text NOT NULL, unit text NOT NULL, gst_rate numeric(5,2) NOT NULL);
CREATE TABLE purchase_order (po_no text PRIMARY KEY, po_date date NOT NULL,
  project_code text NOT NULL REFERENCES project, supplier_gstin text NOT NULL REFERENCES supplier);
CREATE TABLE po_line (po_no text NOT NULL REFERENCES purchase_order, material_code text NOT NULL REFERENCES material,
  qty numeric(12,3) NOT NULL, unit_rate numeric(12,2) NOT NULL, PRIMARY KEY (po_no, material_code));
INSERT INTO project VALUES ('GGN-FO','Gurugram Flyover','Haryana'), ('LKO-BP','Lucknow Bypass','Uttar Pradesh'),
  ('NGP-RR','Nagpur Ring Road Pkg 2','Maharashtra'), ('PAT-BR','Patna Ganga Bridge Approach','Bihar');
INSERT INTO supplier VALUES ('27AAFCD4410K1Z3','Deccan Steel Stockists','Nagpur'),
  ('09AAKCG7721M1Z8','Ganga Bitumen Supply','Kanpur'), ('06AABCA9083H1Z1','Aravalli Aggregates','Gurugram'),
  ('10AAHCK3301B1Z6','Kosi Cement Depot','Patna');
INSERT INTO material VALUES ('TMT-12','TMT bar 12 mm','tonne',18), ('TMT-16','TMT bar 16 mm','tonne',18),
  ('VG-30','Bitumen VG-30','tonne',18), ('AGG-20','Aggregate 20 mm','cum',5), ('AGG-10','Aggregate 10 mm','cum',5),
  ('OPC-53','Cement OPC 53','bag',28);
INSERT INTO purchase_order VALUES
  ('PO-1001','2026-07-02','NGP-RR','27AAFCD4410K1Z3'), ('PO-1002','2026-07-05','LKO-BP','09AAKCG7721M1Z8'),
  ('PO-1003','2026-07-09','GGN-FO','06AABCA9083H1Z1'), ('PO-1004','2026-07-15','NGP-RR','27AAFCD4410K1Z3'),
  ('PO-1006','2026-08-01','GGN-FO','06AABCA9083H1Z1'), ('PO-1009','2026-08-12','GGN-FO','10AAHCK3301B1Z6');
INSERT INTO po_line VALUES
  ('PO-1001','TMT-12',40,56500), ('PO-1001','TMT-16',25,55800), ('PO-1002','VG-30',60,48200),
  ('PO-1003','AGG-20',900,1450), ('PO-1004','TMT-12',30,57200), ('PO-1006','AGG-10',450,1520),
  ('PO-1006','AGG-20',600,1450), ('PO-1009','OPC-53',1200,372.50);
```
::check
```sql
SELECT p.project_code,
       p.name AS project_name,
       COUNT(DISTINCT o.po_no) AS order_count,
       round(COALESCE(SUM(l.qty * l.unit_rate), 0), 2) AS taxable_value,
       round(COALESCE(SUM(l.qty * l.unit_rate * m.gst_rate / 100), 0), 2) AS gst_amount
FROM project p
LEFT JOIN purchase_order o ON o.project_code = p.project_code
LEFT JOIN (po_line l JOIN material m ON m.material_code = l.material_code) ON l.po_no = o.po_no
GROUP BY p.project_code, p.name
ORDER BY p.project_code;
```
::solution
```sql
SELECT p.project_code,
       p.name AS project_name,
       COUNT(DISTINCT o.po_no) AS order_count,
       round(COALESCE(SUM(l.qty * l.unit_rate), 0), 2) AS taxable_value,
       round(COALESCE(SUM(l.qty * l.unit_rate * m.gst_rate / 100), 0), 2) AS gst_amount
FROM project p
LEFT JOIN purchase_order o ON o.project_code = p.project_code
LEFT JOIN (po_line l JOIN material m ON m.material_code = l.material_code) ON l.po_no = o.po_no
GROUP BY p.project_code, p.name
ORDER BY p.project_code;
```
Gurugram has three orders with mixed GST rates: aggregates at 5 % and cement at 28 %, so its GST (₹2,68,110) is neither 5 % nor 28 % of its taxable value (₹33,06,000). That per-line rate is exactly why `gst_rate` belongs on `material` and is joined per line. Patna appears with zeros because it starts from `project` with left joins. In the flat sheet, Patna could not appear at all until it had an order: an insert anomaly that the normalized model removes.

A real invoice would also snapshot the GST rate on the line, because rates change by government notification and an old bill must keep the old rate. This exercise uses the current rate to keep the joins visible.
::mistakes
- Writing `LEFT JOIN po_line ... JOIN material ...` in a row: the plain `JOIN` to `material` turns the outer join back into an inner one and Patna disappears.
- `COUNT(*)` instead of `COUNT(DISTINCT o.po_no)`: it counts lines, not orders, and reports 1 for a project with no orders.
- Rounding each line before summing, which can differ from the reference by a few paise.
:::

:::exercise id=m09-normalization-ex4 difficulty=intermediate kind=code title="Find candidate keys and BCNF violations"
Given a relation's columns and functional dependencies, list its candidate keys and the dependencies that break BCNF. `Closure` is already implemented for you.
::requirements
- `CandidateKeys` returns every minimal superkey, each formatted as its column names sorted with `StringComparer.Ordinal` and joined with `","`. Return the list sorted the same way.
- `BcnfViolations` returns every non-trivial dependency whose left side is not a superkey, formatted with `Fd.Format()`, in the order they were given.
- A dependency is trivial if every right-hand column is also on the left.
::acceptance
- For `lab_assignment(project, test_type, lab)` with `project,test_type -> lab` and `lab -> test_type`, the keys are `lab,project` and `project,test_type`, and the only BCNF violation is `lab -> test_type`.
- For the 14-column procurement sheet, the only key is `material_code,po_no` and there are exactly four violations.
- A relation in BCNF returns an empty violation list.
::hint
A superkey is a set whose closure contains every column. A candidate key is a superkey with no smaller superkey inside it.
::hint
Try subsets from smallest to largest. If a subset already contains a key you found, skip it: it cannot be minimal.
::hint
Enumerate subsets with a bitmask from `1` to `(1 << n) - 1`, ordered by `BitOperations.PopCount((uint)mask)`.
::hint
```csharp
foreach (var mask in Enumerable.Range(1, (1 << cols.Length) - 1).OrderBy(m => BitOperations.PopCount((uint)m)))
{
    var subset = cols.Where((c, i) => (mask & (1 << i)) != 0).ToHashSet();
    if (found.Any(k => k.IsSubsetOf(subset))) continue;
    if (IsSuperkey(...)) found.Add(subset);
}
```
::starter
```csharp file=KeyFinder.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;

public sealed record Fd(string[] Left, string[] Right)
{
    public string Format() =>
        string.Join(",", Left.OrderBy(x => x, StringComparer.Ordinal)) + " -> " +
        string.Join(",", Right.OrderBy(x => x, StringComparer.Ordinal));
}

public static class KeyFinder
{
    public static HashSet<string> Closure(IEnumerable<string> start, IReadOnlyList<Fd> fds)
    {
        var result = new HashSet<string>(start, StringComparer.Ordinal);
        bool changed;
        do
        {
            changed = false;
            foreach (var fd in fds)
                if (fd.Left.All(result.Contains) && !fd.Right.All(result.Contains)) { result.UnionWith(fd.Right); changed = true; }
        } while (changed);
        return result;
    }

    public static bool IsSuperkey(IReadOnlyCollection<string> columns, IEnumerable<string> candidate, IReadOnlyList<Fd> fds) =>
        throw new NotImplementedException();

    public static List<string> CandidateKeys(IReadOnlyCollection<string> columns, IReadOnlyList<Fd> fds) =>
        throw new NotImplementedException();

    public static List<string> BcnfViolations(IReadOnlyCollection<string> columns, IReadOnlyList<Fd> fds) =>
        throw new NotImplementedException();
}
```
::tests
```csharp file=KeyFinderTests.cs
using System.Collections.Generic;
using Xunit;

public class KeyFinderTests
{
    private static readonly string[] LabCols = { "project", "test_type", "lab" };
    private static readonly List<Fd> LabFds = new()
    {
        new Fd(new[] { "project", "test_type" }, new[] { "lab" }),
        new Fd(new[] { "lab" }, new[] { "test_type" }),
    };

    private static readonly string[] SheetCols =
    {
        "po_no", "po_date", "project_code", "project_name", "project_state", "supplier_gstin", "supplier_name",
        "supplier_city", "material_code", "material_name", "unit", "gst_rate", "qty", "rate",
    };
    private static readonly List<Fd> SheetFds = new()
    {
        new Fd(new[] { "po_no" }, new[] { "po_date", "project_code", "supplier_gstin" }),
        new Fd(new[] { "project_code" }, new[] { "project_name", "project_state" }),
        new Fd(new[] { "supplier_gstin" }, new[] { "supplier_name", "supplier_city" }),
        new Fd(new[] { "material_code" }, new[] { "material_name", "unit", "gst_rate" }),
        new Fd(new[] { "po_no", "material_code" }, new[] { "qty", "rate" }),
    };

    [Fact]
    public void Lab_assignment_has_two_overlapping_keys()
    {
        var keys = KeyFinder.CandidateKeys(LabCols, LabFds);
        Assert.Equal(new List<string> { "lab,project", "project,test_type" }, keys);
    }

    [Fact]
    public void Lab_assignment_is_3nf_but_not_bcnf()
    {
        var v = KeyFinder.BcnfViolations(LabCols, LabFds);
        Assert.Single(v);
        Assert.Equal("lab -> test_type", v[0]);
    }

    [Fact]
    public void Sheet_has_one_composite_key()
    {
        Assert.Equal(new List<string> { "material_code,po_no" }, KeyFinder.CandidateKeys(SheetCols, SheetFds));
    }

    [Fact]
    public void Sheet_has_four_violations_in_input_order()
    {
        var v = KeyFinder.BcnfViolations(SheetCols, SheetFds);
        Assert.Equal(4, v.Count);
        Assert.Equal("po_no -> po_date,project_code,supplier_gstin", v[0]);
        Assert.Equal("material_code -> gst_rate,material_name,unit", v[3]);
    }

    [Fact]
    public void Normalized_supplier_table_is_bcnf()
    {
        var cols = new[] { "gstin", "name", "city" };
        var fds = new List<Fd> { new Fd(new[] { "gstin" }, new[] { "name", "city" }) };
        Assert.Empty(KeyFinder.BcnfViolations(cols, fds));
        Assert.Equal(new List<string> { "gstin" }, KeyFinder.CandidateKeys(cols, fds));
    }

    [Fact]
    public void Trivial_dependency_is_ignored()
    {
        var cols = new[] { "a", "b", "c" };
        var fds = new List<Fd> { new Fd(new[] { "a" }, new[] { "b", "c" }), new Fd(new[] { "b", "c" }, new[] { "b" }) };
        Assert.Empty(KeyFinder.BcnfViolations(cols, fds));
    }
}
```
::solution
```csharp file=KeyFinder.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;

public sealed record Fd(string[] Left, string[] Right)
{
    public string Format() =>
        string.Join(",", Left.OrderBy(x => x, StringComparer.Ordinal)) + " -> " +
        string.Join(",", Right.OrderBy(x => x, StringComparer.Ordinal));
}

public static class KeyFinder
{
    public static HashSet<string> Closure(IEnumerable<string> start, IReadOnlyList<Fd> fds)
    {
        var result = new HashSet<string>(start, StringComparer.Ordinal);
        bool changed;
        do
        {
            changed = false;
            foreach (var fd in fds)
                if (fd.Left.All(result.Contains) && !fd.Right.All(result.Contains)) { result.UnionWith(fd.Right); changed = true; }
        } while (changed);
        return result;
    }

    public static bool IsSuperkey(IReadOnlyCollection<string> columns, IEnumerable<string> candidate, IReadOnlyList<Fd> fds) =>
        Closure(candidate, fds).IsSupersetOf(columns);

    public static List<string> CandidateKeys(IReadOnlyCollection<string> columns, IReadOnlyList<Fd> fds)
    {
        var cols = columns.ToArray();
        var found = new List<HashSet<string>>();
        foreach (var mask in Enumerable.Range(1, (1 << cols.Length) - 1).OrderBy(m => BitOperations.PopCount((uint)m)))
        {
            var subset = cols.Where((_, i) => (mask & (1 << i)) != 0).ToHashSet(StringComparer.Ordinal);
            if (found.Any(k => k.IsSubsetOf(subset))) continue;   // contains a smaller key: not minimal
            if (IsSuperkey(columns, subset, fds)) found.Add(subset);
        }
        return found
            .Select(k => string.Join(",", k.OrderBy(x => x, StringComparer.Ordinal)))
            .OrderBy(x => x, StringComparer.Ordinal)
            .ToList();
    }

    public static List<string> BcnfViolations(IReadOnlyCollection<string> columns, IReadOnlyList<Fd> fds) =>
        fds.Where(fd => fd.Right.Any(r => !fd.Left.Contains(r)))      // non-trivial
           .Where(fd => !IsSuperkey(columns, fd.Left, fds))            // determinant is not a superkey
           .Select(fd => fd.Format())
           .ToList();
}
```
Searching subsets smallest-first guarantees minimality: by the time we test a 3-column set, every key of size 1 or 2 is already known, so any superset of one is skipped. The search is exponential in the number of columns (2¹⁴ = 16,384 subsets for the sheet), which is fine for design-time tooling and a reason never to run it on a hot path.

The lab example shows the BCNF-versus-3NF gap: `lab -> test_type` breaks BCNF, but `test_type` is part of the key `project,test_type`, so 3NF allows it.
::mistakes
- Testing "is a superkey" by checking only the dependency's own right side instead of the whole closure.
- Returning non-minimal superkeys such as `lab,project,test_type`.
- Counting `b,c -> b` as a violation. A trivial dependency is always true and says nothing about design.
::extensions
Add `ThirdNfViolations`: the same as BCNF, but skip a dependency when every non-trivial right-hand column is prime (appears in some candidate key).
:::

:::exercise id=m09-normalization-ex5 difficulty=advanced kind=written title="Denormalize the project dashboard, with numbers"
The director's dashboard shows, for each of 400 projects, the total committed purchase value and the value delivered so far. Data: 2.4 million `po_line` rows growing by 3,000 per working day, and 1.1 million `delivery` rows growing by 2,000 per day. The dashboard is opened about 1,500 times per hour in the morning peak. One mega-project receives about 40 % of all new lines, often in bulk imports of 5,000 lines. Finance accepts figures up to 10 minutes old on the dashboard, but the "approve payment" screen for a single order must be exact.

Propose a design. Cover: (1) what you would measure before denormalizing, (2) which technique you pick for the dashboard and why, (3) why you would or would not use a trigger-maintained total on `project`, (4) how the payment screen stays exact, and (5) the reconciliation query and alert.
::acceptance
- Converts the traffic into per-second numbers and compares them with write rates.
- Identifies the hot-row lock problem for the mega-project and its bulk imports.
- Picks a technique that matches the 10-minute staleness budget, and explains how it refreshes without blocking readers.
- Keeps the payment screen on the normalized source of truth.
- Gives a concrete reconciliation query and what triggers an alert.
::hint
Start with the ratio: dashboard reads per second versus line writes per second.
::hint
Ask what a trigger on `po_line` does to 5,000 inserts for the same project inside one import.
::hint
`REFRESH MATERIALIZED VIEW CONCURRENTLY` needs a unique index on the view and does not block `SELECT`s.
::hint
The payment screen reads one order: a primary-key lookup plus its lines. Does it need a precomputed number at all?
::solution
**1. Measure first.** 1,500 loads/hour is about 0.4 loads per second. Each load aggregates 2.4 M + 1.1 M rows. Run `EXPLAIN (ANALYZE, BUFFERS)` on the dashboard query. If it is ~150 ms with indexes on `po_line(po_no)` and `delivery(po_no)` (estimate), that is 0.4 × 0.15 s ≈ 0.06 seconds of database time per second, which is easily affordable, and you may not need to denormalize at all. Denormalize only if the measured time or the CPU cost is a problem, or if the data will grow 10×.

**2. Dashboard: a materialized view, refreshed every 5 minutes.**

```sql
CREATE MATERIALIZED VIEW project_dashboard AS
SELECT p.project_code,
       COALESCE(c.committed, 0) AS committed_value,
       COALESCE(d.delivered, 0) AS delivered_value
FROM project p
LEFT JOIN (SELECT o.project_code, SUM(l.line_value) AS committed
           FROM po_line l JOIN purchase_order o USING (po_no) GROUP BY o.project_code) c USING (project_code)
LEFT JOIN (SELECT o.project_code, SUM(d.qty * l.unit_rate) AS delivered
           FROM delivery d JOIN po_line l USING (po_no, material_code)
           JOIN purchase_order o USING (po_no) GROUP BY o.project_code) d USING (project_code);
CREATE UNIQUE INDEX ON project_dashboard (project_code);
-- every 5 minutes, from a scheduled job:
REFRESH MATERIALIZED VIEW CONCURRENTLY project_dashboard;
```

Staleness is at most 5 minutes plus refresh time, inside the 10-minute budget. `CONCURRENTLY` lets dashboard readers keep reading the old contents during refresh. Each refresh costs one full aggregate, 12 times an hour instead of 1,500, which is roughly 125× less aggregate work at peak.

**3. No trigger-maintained total.** Writes average 3,000 / 8 working hours ≈ 0.1 per second, which is tiny, but 40 % land on one project and arrive in 5,000-line imports. A per-row trigger would run `UPDATE project SET committed_value = ...` 5,000 times on the *same row*. Within one import transaction that is 5,000 extra row versions of one row (bloat). Across parallel import workers they serialize on that row's lock. The dashboard does not need per-second freshness, so we would be paying contention for nothing.

**4. Payment screen: normalized source.** Approving payment for one order reads `purchase_order` by primary key and its handful of `po_line` and `delivery` rows by index. That is a few milliseconds and always exact. Never read the payment amount from the materialized view.

**5. Reconciliation.** Nightly, compare the view (refreshed just before) with a fresh aggregate for a sample, and compare any other denormalized copies with their sources:

```sql
SELECT v.project_code, v.committed_value, s.actual
FROM project_dashboard v
JOIN (SELECT o.project_code, SUM(l.line_value) AS actual
      FROM po_line l JOIN purchase_order o USING (po_no) GROUP BY o.project_code) s USING (project_code)
WHERE v.committed_value <> s.actual;
```

Alert if any row is returned right after a refresh, or if the refresh job has not succeeded for 15 minutes (staleness beyond budget). Also show "as of 10:35" on the dashboard so users know the figure is a snapshot.
::mistakes
- Denormalizing before measuring; often an index solves it.
- Adding a per-row trigger total without considering bulk imports onto one hot project.
- Using `REFRESH MATERIALIZED VIEW` without `CONCURRENTLY` (it locks out readers), or with `CONCURRENTLY` but no unique index (it errors).
- Serving the payment amount from the stale copy.
:::

## Automated testing

Test normalization decisions at three levels.

**1. Unit tests for pure logic.** The FD analyzer and the service's snapshot behaviour run in milliseconds:

```csharp
public class SchemaAnalyzerTests
{
    [Fact]
    public void Flat_sheet_is_only_in_first_normal_form()
    {
        var sheet = new RelationSchema("po_sheet",
            ["po_no", "po_date", "project_code", "project_state", "material_code", "gst_rate", "qty"],
            ["po_no -> po_date, project_code", "project_code -> project_state",
             "material_code -> gst_rate", "po_no, material_code -> qty"].Select(FunctionalDependency.Parse));
        var report = SchemaAnalyzer.Analyze(sheet);
        Assert.Equal(NormalForm.First, report.HighestNormalForm);
        Assert.Equal(["(material_code, po_no)"], report.CandidateKeys);
    }

    [Fact]
    public async Task Line_keeps_rate_snapshot_and_total_matches()
    {
        var store = new InMemoryProcurementStore()
            .AddMaterial(new Material("TMT-12", "TMT 12", "tonne", 18m, 56_500m))
            .AddProject("NGP-RR").AddOrder("PO-1", "NGP-RR");
        var svc = new PurchaseOrderService(store, NullLogger<PurchaseOrderService>.Instance);
        Assert.Equal(AddLineOutcome.Added, await svc.AddLineAsync("PO-1", "TMT-12", 40m));
        Assert.Equal(2_260_000m, await store.StoredTotalAsync("NGP-RR"));
        Assert.Empty(await store.FindDriftAsync());
    }
}
```

**2. Reconciliation as a test.** Simulate the bulk import that bypasses the service (`ImportLineWithoutTotal`) and assert that `FindDriftAsync` reports exactly that project. This proves the safety net works, not just the happy path.

**3. Schema tests against real PostgreSQL** (Testcontainers). Assert that the constraints you rely on exist: inserting a second supplier with the same GSTIN fails, inserting a line for a non-existent material fails, and writing to `line_value` fails with "column can only be updated to DEFAULT". Run the reconciliation SQL against a seeded database in CI and assert zero rows.

## Real-world application

- **ERP and procurement systems** keep masters (supplier, material, project) normalized and snapshot prices, tax rates and addresses onto transactional documents. Getting that split wrong is how invoices change after they were issued.
- **Infrastructure project platforms** track bills of quantities, measurements and monthly progress. Cumulative "work done to date" is a classic denormalized figure. It is maintained per bill and reconciled against the measurement book, because a wrong cumulative figure flows into every later payment.
- **E-commerce catalogues** normalize products and sellers for writes and push a denormalized document per product into a search engine for reads.
- **Analytics warehouses** deliberately use a star schema (one wide fact table plus dimension tables), rebuilt from normalized sources by ETL jobs.
- **Social feeds and counters** (likes, followers) are denormalized counters. At very high rates they are sharded or batched to avoid the hot-row problem described above.

## Interview questions

:::interview
::q beginner
What problem does normalization solve? Give an example of each anomaly.
::a
It removes redundant copies of the same fact so that changes cannot contradict each other. **Update anomaly**: a supplier's name is copied on 400 order lines and a rename misses some, so the data now disagrees with itself. **Insert anomaly**: you cannot record a new material's GST rate until someone orders it, because every row needs an order number. **Delete anomaly**: deleting the last order for a material deletes the only record of that material's unit and rate. Normalization gives each fact one home (a `material` table, a `supplier` table) so each change touches one row.
::q beginner
What is the difference between 2NF and 3NF in one sentence each?
::a
2NF: no non-key column depends on only *part* of a composite key (for example `gst_rate` depending only on `material_code` in a table keyed by `po_no, material_code`). 3NF: no non-key column depends on another non-key column (for example `project_state` depending on `project_code`, which depends on `po_no`). Both are fixed by moving the dependent columns into a table keyed by their real determinant.
::q intermediate
When is a table in 3NF but not in BCNF, and what do you do about it?
::a
When a non-superkey determines part of a candidate key, which requires overlapping candidate keys. Example: `lab_assignment(project, test_type, lab)` with `project, test_type → lab` and `lab → test_type`. Every column is prime, so 3NF is satisfied, but `lab` is a determinant that is not a superkey, so BCNF is not. Decomposing into `lab(lab, test_type)` and `project_lab(project, lab)` removes the redundancy but loses the ability to enforce "one lab per test type per project" with a single `UNIQUE` constraint. Options: stay in 3NF and accept the small redundancy, or decompose and enforce the cross-table rule with a trigger. Most teams choose 3NF unless the repeated fact changes often.
::q intermediate
Your order line stores `unit_rate` and the material table stores `list_rate`. A reviewer says this violates 3NF. Do you agree?
::a
No. They are different facts. `list_rate` is today's price; `unit_rate` is the price agreed on that order on that date, and it must not change when the price list changes. Storing it is a snapshot, which is correct modelling, not redundancy. The test is: "if the source changes tomorrow, should this value change?" If not, it is its own fact. The same applies to tax rates on invoices and addresses on shipments.
::q advanced
A product manager wants a `total_spend` column on `project`, kept up to date by a trigger on `po_line`. What questions do you ask, and what alternatives do you propose?
::a
Questions: How fresh must it be (seconds, minutes, end of day)? How often is it read versus written? Do writes cluster on a few projects or arrive in bulk? Is there an index on the query that would make on-the-fly aggregation fast enough? Risks of the trigger: every line insert updates one shared row, which serializes concurrent inserts for the same project on that row's lock and creates a new row version each time; bulk imports amplify this; any path that bypasses the trigger (`COPY` with triggers disabled, a manual fix) causes drift. Alternatives: measure the plain aggregate with a good index first; a materialized view refreshed concurrently every few minutes if minutes of staleness are acceptable; a per-transaction batched bump (add the sum once per import transaction instead of once per row); or an asynchronous read model. Whichever is chosen, add a reconciliation query and an alert.
::q advanced
How would you migrate a 30-million-row flat table to a normalized schema in production without downtime?
::a
Use expand and contract. (1) Create the new tables alongside the old one. (2) Profile the data: run "conflicting copies" queries per dependency (for example GSTINs with several names) and get the business to resolve conflicts, since the new primary keys will reject them. (3) Backfill in batches of a few thousand rows per transaction, using `INSERT ... SELECT DISTINCT ... ON CONFLICT DO NOTHING` for masters and keyset-paged batches for lines, so locks are short. (4) Dual-write: the application writes both old and new structures, or a trigger on the old table propagates changes, until the backfill catches up. (5) Verify with reconciliation queries (row counts and sums per project). (6) Switch reads to the new tables behind a feature flag, then stop writing the old table, then drop it in a later release. See [Migrations and schema evolution](#/lesson/m09-migrations-evolution).
:::

## Summary and revision

**Key takeaways**

- Redundant copies cause update, insert and delete anomalies. Normalization gives each fact one home.
- A functional dependency `X → Y` comes from business rules. The closure `X⁺` tells you what `X` decides, and a candidate key's closure is the whole table.
- 1NF: one value per cell. 2NF: no partial dependency on a composite key. 3NF: no non-key decides a non-key. BCNF: every determinant is a superkey.
- 3NF always preserves dependencies; BCNF may not. Stopping at 3NF is often the pragmatic choice.
- Decompositions must be lossless: the shared columns must be a key of one side.
- Snapshots (price on an order line, tax rate on an invoice) are separate facts, not redundancy.
- Denormalize deliberately: generated column, then materialized view, then maintained total, then read model. Always name the source of truth and write the reconciliation query.
- Maintained totals create hot rows. Measure write clustering before choosing them.

**Terminology**: functional dependency, determinant, closure, superkey, candidate key, prime attribute, partial dependency, transitive dependency, 1NF, 2NF, 3NF, BCNF, lossless join, dependency preservation, snapshot, generated column, materialized view, hot row, reconciliation.

:::flashcards
Q: What does the functional dependency `X → Y` mean?
A: Any two rows that agree on the columns in X must agree on the columns in Y. X decides Y.
Q: How do you compute the closure of a set of columns?
A: Start with the set, repeatedly add the right-hand side of any dependency whose left-hand side is already inside, and stop when a full pass adds nothing.
Q: What breaks 2NF?
A: A non-prime column that depends on only part of a composite candidate key, such as `gst_rate` depending on `material_code` in a table keyed by `(po_no, material_code)`.
Q: What breaks 3NF?
A: A transitive dependency: a non-prime column decided by something that is not a superkey, such as `project_state` decided by `project_code` inside `purchase_order`.
Q: What extra rule does BCNF add over 3NF?
A: Every non-trivial determinant must be a superkey, with no exception for prime columns on the right-hand side.
Q: When is a decomposition lossless?
A: When the columns shared by the two parts form a key of at least one part, so joining them back creates no spurious rows.
Q: Is the agreed price on an order line a 3NF violation?
A: No. It is a snapshot of a different fact (the price on that date) and must not change when the price list does.
Q: What is the safest kind of denormalization in PostgreSQL?
A: A STORED generated column computed from the same row; the database recomputes it on every write, so it cannot drift.
Q: What is the main hidden cost of a trigger-maintained total on a parent row?
A: Every child insert updates the same parent row, so concurrent inserts for that parent serialize on its row lock and create many row versions.
Q: What must accompany every denormalized copy?
A: A named source of truth, a defined update path and transaction, and a reconciliation query that proves the copy matches.
:::

## Knowledge check

:::quiz pass=70
::q single
A table `inspection(site_id, inspector_id, inspector_phone, inspected_on)` has key `(site_id, inspected_on)`. The inspector's phone is stored on every inspection. Which normal form does it break?
- [ ] 1NF
- [ ] 2NF
- [x] 3NF
- [ ] It is in BCNF
> `inspector_phone` depends on `inspector_id`, a non-key column, which depends on the key. That is a transitive dependency, a 3NF violation. It is not a 2NF problem because the phone does not depend on part of the key.
::q single
Ops wants to record a new site before any inspection happens, but `site_name` lives only in the `inspection` table. Which anomaly is this?
- [ ] Update anomaly
- [x] Insert anomaly
- [ ] Delete anomaly
- [ ] Phantom read
> You cannot insert a fact (a site exists, with this name) without inventing an unrelated fact (an inspection). Moving site details into a `site` table fixes it.
::q multi
Which of these are snapshots that belong on the transactional row rather than redundancies to remove? (Select all that apply.)
- [x] The GST rate applied on an issued invoice line
- [x] The delivery address printed on a dispatched shipment
- [ ] A supplier's current phone number copied onto every purchase order
- [x] The unit rate agreed on a purchase order line
> Each correct answer is a fact about that document at that time, and must not change when the master changes. The supplier's current phone number should change everywhere at once, so it belongs only in `supplier`.
::q single
`lab_assignment(project, test_type, lab)` has dependencies `project, test_type → lab` and `lab → test_type`. Which statement is true?
- [ ] It is not in 3NF because `lab` is not a key.
- [x] It is in 3NF but not BCNF.
- [ ] It is in BCNF because every column is part of some key.
- [ ] It is not in 2NF.
> `test_type` is prime (it is part of the key `project, test_type`), so 3NF allows `lab → test_type`. BCNF does not, because `lab` alone is not a superkey.
::q single
You split `po_sheet` into `A(po_no, supplier_name)` and `B(supplier_name, material_code, qty)`. What goes wrong?
- [ ] Nothing, the split is lossless.
- [x] Joining A and B on `supplier_name` can produce order lines that never existed, because `supplier_name` is not a key of either table.
- [ ] It violates 1NF.
- [ ] Foreign keys become impossible.
> A lossless split needs the shared columns to be a key of one side. One supplier has many orders and many lines, so the join pairs every order with every line of that supplier.
::q single
A dashboard can be 10 minutes stale and is opened 2,000 times per hour. Line inserts arrive in bulk imports of 5,000 rows for one project. What is the best first denormalization?
- [ ] A per-row trigger updating `project.total`
- [x] A materialized view with a unique index, refreshed `CONCURRENTLY` every few minutes
- [ ] Copying the project total onto every `po_line`
- [ ] Storing the total in a C# static variable
> The view matches the staleness budget, cuts aggregate work from 2,000 runs per hour to a dozen, and avoids the hot-row contention a per-row trigger would cause during bulk imports.
::q single
Which PostgreSQL 17 feature lets you store `qty * unit_rate` on the row with zero risk of it going out of sync?
- [ ] A materialized view
- [ ] A `BEFORE INSERT` trigger
- [x] `GENERATED ALWAYS AS (qty * unit_rate) STORED`
- [ ] A `DEFAULT` expression
> A stored generated column is recomputed on every insert and update and cannot be written directly. A `DEFAULT` is only applied on insert and can be overwritten; a trigger can be disabled or bypassed.
:::

## Completion criteria

You have finished this lesson when you can:

- [ ] Score at least 70 % on the knowledge check.
- [ ] Complete exercises 1 and 2, and either 3 or 4.
- [ ] In the playground, find the update anomalies in `po_sheet`, see the migration fail on them, and rebuild the spend report from the normalized tables.
- [ ] Given a new table and its business rules, list its functional dependencies, its candidate keys and its highest normal form.
- [ ] Defend one denormalization in a design review by naming its source of truth, its update path, its staleness and its reconciliation query.
