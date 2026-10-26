---
id: m04-code-smells
title: Code smells and technical debt
module: m04
level: intermediate
status: reviewed
template: lesson
minutes: 85
prerequisites: [m04-srp, m04-dry-kiss-yagni, m01-testing-debugging]
related: [m04-refactoring-legacy, m07-refactoring-large-classes, m06-anti-patterns, m04-composition-inheritance, m04-over-under-engineering]
tags: [clean-code, refactoring, technical-debt, maintainability]
patterns: []
summary: Learn to recognise the fourteen most common code smells, apply the matching refactoring in small safe steps, and manage technical debt deliberately using the debt quadrant and change hotspots.
references:
  - title: Martin Fowler — Refactoring, 2nd Edition (catalogue of smells and refactorings)
    url: https://refactoring.com/catalog/
  - title: Martin Fowler — Technical Debt Quadrant
    url: https://martinfowler.com/bliki/TechnicalDebtQuadrant.html
  - title: Martin Fowler — Code Smell
    url: https://martinfowler.com/bliki/CodeSmell.html
  - title: Microsoft Learn — Code metrics values
    url: https://learn.microsoft.com/visualstudio/code-quality/code-metrics-values
---

A **code smell** is a surface sign that *might* point to a deeper design problem. The term comes from Kent Beck and Martin Fowler's *Refactoring* (1999). A smell isn't a bug: the code works. It's a hint that the next change will be harder than it should be. **Technical debt** is the total cost of those hints: the extra time every future change pays because of shortcuts taken earlier. This lesson gives you a catalogue of 14 smells, each with the refactoring that usually fixes it, and a way to decide which debt is worth paying off.

## Learning objectives

By the end of this lesson you will be able to:

1. Define a code smell and explain why it's a heuristic, not a rule.
2. Recognise 14 classic smells in C# code and name the refactoring for each.
3. Refactor safely: tests first, small steps, behaviour unchanged.
4. Replace primitive obsession and data clumps with value objects, and feature envy with moved methods.
5. Classify technical debt with Fowler's quadrant and explain "principal" and "interest".
6. Prioritise debt using change frequency and business impact, instead of fixing whatever looks ugliest.

## Prerequisites

- [Single Responsibility Principle](#/lesson/m04-srp): many smells are SRP violations seen from different angles.
- [DRY, KISS and YAGNI](#/lesson/m04-dry-kiss-yagni): duplication and speculative generality appear in the catalogue.
- [Unit testing fundamentals](#/lesson/m01-testing-debugging): refactoring without tests is just editing.

## Explain it like I'm a beginner

Walk into a site office and smell diesel. It doesn't prove anything is wrong — maybe a generator was just refuelled — but a sensible engineer *checks*, because it's often the first sign of a leak.

Code smells work the same way. A 400-line method, a `BillManager` class with 60 methods, a method with 11 parameters: none is a bug, but each often means the next change will be slower and riskier.

**Technical debt** is like a loan. A shortcut to hit a deadline borrows time. The **principal** is the work to clean it up; the **interest** is the extra time every later change costs meanwhile. Debt taken on purpose and repaid is a business tool. Debt that piles up unnoticed ends with the team paying interest full time.

- A **smell** is a symptom. A **refactoring** is a small, behaviour-preserving change that removes it.
- **Refactoring** means changing the structure of code *without changing what it does*. If behaviour changes, it's not refactoring; it's a feature or a bug fix.

## First-principles explanation

### What a smell is, and isn't

Fowler's definition: "a surface indication that usually corresponds to a deeper problem in the system." Two words matter:

- **Surface** — smells are quick to spot, often by looking at size or shape, before you understand the code.
- **Usually** — not always. A 60-line method that parses a fixed-format bank statement line by line may be perfectly clear. A `switch` over an enum in one place is fine. Judgement decides; the smell only tells you where to look.

### Why smells cost money

Every smell raises the cost of **understanding** (where to change, what will break), **changing** (how many places to edit) or **verifying** (how hard it is to test in isolation). Most business systems spend more time changing existing code than writing new code, so these costs compound.

### How refactoring works

Refactoring is a disciplined loop:

1. **Pin current behaviour with tests.** For legacy code, write *characterisation tests* that record what it does today, even if it looks wrong ([Refactoring legacy code](#/lesson/m04-refactoring-legacy)).
2. **Make one small change** — rename, extract method, move method. IDEs automate many of these safely.
3. **Run the tests.** Green → commit. Red → undo and take a smaller step.

Never mix refactoring and behaviour change in one commit: reviewers can't tell them apart, and a revert removes both.

### The smell catalogue

Fourteen smells from Fowler's catalogue, each with what it looks like, why it hurts and the usual refactoring. Names of refactorings follow [refactoring.com](https://refactoring.com/catalog/).

#### 1. Long method

**Looks like:** a method you must scroll to read; comments like `// --- step 3: validate ---` separating sections. **Hurts because:** you can't name what it does in one phrase, can't test one part alone, and local variables leak between sections. **Refactor:** *Extract Method* for each commented section (the comment usually becomes the method name); *Decompose Conditional* for complex `if`s; *Replace Temp with Query* to remove local variables that block extraction.

#### 2. Large class

**Looks like:** `BillManager` with 60 methods and 25 fields; groups of fields used only by groups of methods. **Hurts because:** many reasons to change, merge conflicts, slow onboarding. **Refactor:** *Extract Class* along the field groups (fields used together go together). See [Refactoring large classes](#/lesson/m07-refactoring-large-classes).

#### 3. Long parameter list

**Looks like:** `Process(string, int, string, string, int, int, int, int, string, ...)`. Callers pass `null` or `0` for half. **Hurts because:** easy to swap two `int`s silently; every new input changes every caller. **Refactor:** *Introduce Parameter Object*; *Preserve Whole Object* (pass the `Contract`, not five of its fields); remove flag parameters by splitting the method.

#### 4. Feature envy

**Looks like:** a method that calls `other.A`, `other.B`, `other.C` more than it uses its own class. **Hurts because:** rules live far from their data, and the other class must expose its internals. **Refactor:** *Move Method* (or *Extract Method* then move the extracted part). Exception: deliberate separation, such as a reporting query that reads many entities.

#### 5. Data clumps

**Looks like:** the same three to five values travelling together: `fromKm, fromM, toKm, toM, side`, or `street, city, state, pincode`. **Hurts because:** validation is repeated wherever the clump appears, and the concept has no name. **Refactor:** *Extract Class* / *Introduce Parameter Object* — here, `ChainageRange`. Test: if you deleted one value, would the others still make sense? If not, it's a clump.

#### 6. Primitive obsession

**Looks like:** `string gstin`, `decimal amountInRupees`, `int chainageMetres`, `string status = "APPROVED"`. **Hurts because:** every method re-validates; nothing stops you passing a PAN where a GSTIN is expected. **Refactor:** *Replace Primitive with Object* (value objects such as `Gstin`, `Money`, `Chainage`); *Replace Type Code with Subclasses* or an enum for status strings.

#### 7. Switch statements

**Looks like:** the same `switch` on a type code repeated in several places, or cases for every *combination* of options. **Hurts because:** adding a type means finding every `switch` (shotgun surgery). **Refactor:** *Replace Conditional with Polymorphism* (often the [Strategy pattern](#/lesson/m06-strategy)), or a dictionary lookup. One `switch` in a factory is fine; the smell is *repeated* switching.

#### 8. Shotgun surgery

**Looks like:** one small business change ("GSTIN validation must accept the new UN body format") needs edits in eight files. **Hurts because:** someone always misses one. **Refactor:** *Move Method* / *Move Field* to bring the scattered logic into one class; *Inline Class* if a concept has been spread too thin.

#### 9. Divergent change

**Looks like:** the opposite: one class changes for many unrelated reasons. `RaBillProcessor` changes when tax rules change, when the email template changes and when the database schema changes. **Hurts because:** unrelated changes collide in one file. **Refactor:** *Extract Class* by reason to change ([SRP](#/lesson/m04-srp)).

#### 10. Speculative generality

**Looks like:** abstract base classes with one subclass, unused parameters "for later", hooks nobody calls. **Hurts because:** it's YAGNI's cost of carry. **Refactor:** *Collapse Hierarchy*, *Inline Class*, *Remove Parameter*, delete dead code. See [DRY, KISS and YAGNI](#/lesson/m04-dry-kiss-yagni).

#### 11. Message chains

**Looks like:** `bill.Contract.Project.Client.BillingAddress.State.Code`. **Hurts because:** the caller depends on the whole navigation path; any change in the chain breaks it. **Refactor:** *Hide Delegate* — give the first object a method that answers the real question (`bill.PlaceOfSupplyStateCode()`). This is the Law of Demeter in practice.

#### 12. Middle man

**Looks like:** a class whose methods mostly forward to another class: `ProjectFacade.GetBills() => _billService.GetBills()`. **Hurts because:** an extra hop with no added value. **Refactor:** *Remove Middle Man* — callers use the real class. Note the tension with #11: hiding delegates too eagerly creates middle men. Balance them.

#### 13. Temporary field

**Looks like:** a field that is only set and used in some situations: `OutstandingAdvance` only for one deduction mode. **Hurts because:** readers can't tell when it's valid; it carries state between calls by accident. **Refactor:** *Extract Class* to give the field and the code that uses it their own home (an `AdvanceRecoveryRule` with its own state); *Introduce Special Case* for the "not applicable" situation.

#### 14. Refused bequest

**Looks like:** a subclass that inherits methods it doesn't want and overrides them to throw or do nothing: `class ReadOnlyBillRepository : BillRepository { override Save() => throw ... }`. **Hurts because:** the inheritance is lying; it breaks [Liskov substitution](#/lesson/m04-lsp). **Refactor:** *Replace Inheritance with Delegation* ([composition](#/lesson/m04-composition-inheritance)), or *Push Down Method* so only subclasses that need it have it.

:::callout type=tip title="Smells come in families"
Long method, large class and divergent change usually appear together. So do data clumps, primitive obsession and long parameter lists. Fixing the value-object family first often shrinks the methods and classes for free.
:::

### Technical debt: the quadrant

Not all debt is equal. Fowler's **technical debt quadrant** sorts it on two axes: was it **deliberate** or **inadvertent**, and was it **prudent** or **reckless**?

- **Prudent, deliberate** — "Ship with one PostgreSQL instance; add a replica before the tender season." A conscious trade with a plan.
- **Reckless, deliberate** — "No time for tests." Usually costs more than it saves, within weeks.
- **Reckless, inadvertent** — "What's dependency injection?" A skills gap: fix with training and review, not blame.
- **Prudent, inadvertent** — "Now we know how it should have been designed." The normal result of learning.

### Principal, interest and where to pay

Interest is paid only when someone changes the code (or its risk materialises). A messy module untouched for three years charges none. So prioritise **hotspots**: code that is both *complex* and *frequently changed*, found by crossing `git log` churn with complexity metrics — an approach popularised by Adam Tornhill's *Your Code as a Crime Scene*.

### When smell-hunting is unnecessary

- **Throwaway code**, such as a one-off migration script.
- **Stable, untouched code** — no interest is being paid.
- **Code about to be replaced** by a [strangler migration](#/lesson/m16-strangler-acl).

### Trade-offs

| You gain | You pay |
|---|---|
| Cheaper, safer future changes | Time now, with no new feature to show |
| Code new joiners can understand | Risk of breaking behaviour if tests are weak |
| Smaller, more testable units | More types and files (if you over-extract) |
| Visible, managed debt | Effort to track and justify it to stakeholders |

## Visual explanation

### The technical debt quadrant

```mermaid
quadrantChart
    title Technical debt quadrant (after Fowler)
    x-axis Reckless --> Prudent
    y-axis Inadvertent --> Deliberate
    quadrant-1 Prudent and deliberate
    quadrant-2 Reckless and deliberate
    quadrant-3 Reckless and inadvertent
    quadrant-4 Prudent and inadvertent
    "Ship now and refactor next sprint": [0.8, 0.85]
    "No time for tests": [0.15, 0.85]
    "What is layering": [0.15, 0.15]
    "Now we know the right design": [0.8, 0.2]
```

Read it as two questions about each piece of debt. Up–down: did we *choose* this shortcut, or did it happen without our knowing? Left–right: was it a sensible trade (we understood the cost and had a plan) or careless? The top-right corner is healthy business debt. The top-left is the one to stop. The bottom-left is a skills gap, fixed by pairing and code review. The bottom-right is the normal result of learning, repaid by refactoring as understanding grows.

### Feature envy, before and after Move Method

```mermaid
classDiagram
    class BillingService_Before {
        +CalculateRetentionRelease(Contract c, DateOnly asOf) decimal
    }
    class Contract_Before {
        +DateOnly CompletionDate
        +int DefectLiabilityDays
        +decimal RetentionHeld
        +decimal RetentionReleased
        +bool HasOpenDefects
    }
    BillingService_Before ..> Contract_Before : reads 5 fields
    class BillingService_After {
        +ReleaseRetention(Contract c, DateOnly asOf)
    }
    class Contract_After {
        -DateOnly completionDate
        -int defectLiabilityDays
        -decimal retentionHeld
        +RetentionReleasable(DateOnly asOf) decimal
    }
    BillingService_After --> Contract_After : asks one question
```

Before: the service pulls five fields out of `Contract` and does the calculation itself. It "envies" `Contract`'s data. Every rule about retention lives far from the data it's about, and `Contract` must expose all of its internals. After: the calculation moved to `Contract`, which now keeps its fields private and answers one question. The service just asks. This is **Move Method**, the standard fix for feature envy.

### The refactoring loop

```mermaid
flowchart LR
    A["Spot a smell"] --> B{"Tests cover this behaviour?"}
    B -- "No" --> C["Write characterisation tests"]
    C --> B
    B -- "Yes" --> D["One small refactoring step"]
    D --> E{"Tests green?"}
    E -- "No" --> F["Undo; take a smaller step"]
    F --> D
    E -- "Yes" --> G["Commit"]
    G --> H{"Smell gone?"}
    H -- "No" --> D
    H -- "Yes" --> I["Stop. Ship the feature you came for"]
```

The loop has two safety valves. Missing tests send you to write them first. A red test sends you back with a *smaller* step rather than debugging a big change. The last box matters too: refactoring is in service of a change you need to make. Stop when the code is good enough for that change, not when it's perfect.

## Step-by-step example

The system: contractor billing for highway projects. Every month, a contractor submits a **running-account (RA) bill**: measured quantities × contract rates, minus deductions (retention money, income-tax TDS, recovery of a mobilisation advance). Here's the legacy core, simplified:

```csharp
public class RaBillProcessor
{
    public decimal OutstandingAdvance;      // only used by advance recovery
    public string LastError = "";

    public decimal Process(string contractNo, int billNo, string contractorPan, string contractorGstin,
        int fromKm, int fromM, int toKm, int toM, string side, List<(string item, decimal qty)> measurements,
        Dictionary<string, decimal> rates, string deductionMode, bool isGovt, DateTime billDate)
    {
        decimal gross = 0;
        foreach (var m in measurements)
        {
            if (!rates.ContainsKey(m.item)) { LastError = "Unknown item " + m.item; return -1; }
            gross += Math.Round(m.qty * rates[m.item], 2);
        }
        // ... 40 lines validating PAN/GSTIN with regexes, also copied in VendorController ...
        decimal deductions = 0;
        switch (deductionMode)
        {
            case "RET": deductions += gross * 0.05m; break;
            case "RET+TDS": deductions += gross * 0.05m + gross * 0.02m; break;
            case "RET+TDS+ADV":
                var rec = Math.Min(gross * 0.10m, OutstandingAdvance);
                OutstandingAdvance -= rec;
                deductions += gross * 0.05m + gross * 0.02m + rec; break;
            // 6 more cases...
        }
        // ... 60 lines building an email, 30 lines writing to the database ...
        return gross - deductions;
    }
}
```

Let's walk through it with the smell catalogue above and name each problem.

### Step 1 — name the smells

| What you see | Smell |
|---|---|
| `Process` is ~200 lines doing calculation, validation, email and SQL | Long method, divergent change |
| 15 parameters | Long parameter list |
| `fromKm, fromM, toKm, toM, side` always travel together | Data clumps |
| PAN, GSTIN, chainage and money as `string`/`int`/`decimal` | Primitive obsession |
| `switch (deductionMode)` with combined modes | Switch statements |
| `OutstandingAdvance` only meaningful for one mode | Temporary field |
| PAN/GSTIN regexes copied into `VendorController` | Duplicated knowledge → shotgun surgery when the rule changes |
| `return -1` plus `LastError` | Not in the classic list, but a hidden error channel |

### Step 2 — pin behaviour

Before touching anything, write characterisation tests: for three real past bills (taken from production, anonymised), assert the net amount that `Process` returns today. If the legacy result looks wrong, still pin it, and raise a ticket. Refactoring must not change behaviour silently.

### Step 3 — small steps, in a sensible order

1. **Introduce Parameter Object**: `ChainageRange` replaces the five chainage parameters.
2. **Replace Primitive with Object**: `Pan`, `Gstin`, `Money`, `Chainage` value objects. The copied regexes now live in one place.
3. **Extract Method** on the gross calculation, then **Move Method** into `MeasurementSheet`, which owns the data.
4. **Replace Conditional with Polymorphism**: one `IDeductionRule` per deduction instead of one `switch` case per *combination*. A contract has a list of rules. Nine combination cases become three rule classes.
5. **Extract Class** for the email and persistence parts, which change for different reasons (divergent change).
6. Replace `-1` + `LastError` with an exception or a result type.

Each step is a commit with green tests. The production code below is the result.

## Production-style C# implementation

The refactored RA bill core. Value objects remove primitive obsession and data clumps; the sheet owns its calculation (no feature envy); each deduction is a rule (no switch, no temporary field).

```csharp file=Billing/ValueObjects.cs
using System.Globalization;
using System.Text.RegularExpressions;

namespace Contracts.Billing;

public readonly record struct Money(decimal Amount) : IComparable<Money>
{
    public static readonly Money Zero = new(0m);
    public static Money Rupees(decimal amount) => new(Math.Round(amount, 2, MidpointRounding.AwayFromZero));
    public static Money operator +(Money a, Money b) => new(a.Amount + b.Amount);
    public static Money operator -(Money a, Money b) => new(a.Amount - b.Amount);
    public Money Percent(decimal percent) => Rupees(Amount * percent / 100m);
    public static Money Min(Money a, Money b) => a.Amount <= b.Amount ? a : b;
    public int CompareTo(Money other) => Amount.CompareTo(other.Amount);
    public override string ToString() => "₹" + Amount.ToString("N2", CultureInfo.InvariantCulture);
}

/// <summary>Highway chainage, written "km+metres", e.g. "12+350" = 12,350 m from the project start.</summary>
public readonly record struct Chainage(int Metres) : IComparable<Chainage>
{
    private static readonly Regex Format = new(@"^(\d{1,4})\+(\d{3})$", RegexOptions.Compiled);

    public static Chainage Parse(string text)
    {
        var m = Format.Match(text.Trim());
        if (!m.Success) throw new FormatException($"Chainage '{text}' must look like 12+350.");
        return new Chainage(int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) * 1000 + int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture));
    }

    public int CompareTo(Chainage other) => Metres.CompareTo(other.Metres);
    public override string ToString() => $"{Metres / 1000}+{Metres % 1000:000}";
}

public enum CarriagewaySide { Left, Right, Both }

/// <summary>Replaces the data clump (fromKm, fromM, toKm, toM, side).</summary>
public sealed record ChainageRange
{
    public Chainage From { get; }
    public Chainage To { get; }
    public CarriagewaySide Side { get; }

    public ChainageRange(Chainage from, Chainage to, CarriagewaySide side)
    {
        if (to.CompareTo(from) <= 0) throw new ArgumentException($"End {to} must be after start {from}.");
        (From, To, Side) = (from, to, side);
    }

    public int LengthMetres => To.Metres - From.Metres;
}

/// <summary>Replaces "string gstin" and the regex copied into three classes.</summary>
public sealed record Gstin
{
    private static readonly Regex Format = new(@"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$", RegexOptions.Compiled);
    public string Value { get; }
    private Gstin(string value) => Value = value;

    public static Gstin Parse(string text)
    {
        var v = text.Trim().ToUpperInvariant();
        return Format.IsMatch(v) ? new Gstin(v) : throw new FormatException($"'{text}' is not a valid GSTIN.");
    }

    public string StateCode => Value[..2];
    public override string ToString() => Value;
}
```

```csharp file=Billing/MeasurementSheet.cs
namespace Contracts.Billing;

public sealed record BoqItem(string Code, string Description, string Unit, Money Rate);
public sealed record MeasurementEntry(string BoqCode, ChainageRange Stretch, decimal Quantity);

/// <summary>Owns the measured entries and the calculation over them (fixes feature envy).</summary>
public sealed class MeasurementSheet
{
    private readonly List<MeasurementEntry> _entries = new();
    public IReadOnlyList<MeasurementEntry> Entries => _entries;

    public void Add(MeasurementEntry entry)
    {
        if (entry.Quantity <= 0) throw new ArgumentOutOfRangeException(nameof(entry), "Quantity must be positive.");
        _entries.Add(entry);
    }

    public Money GrossValue(IReadOnlyDictionary<string, BoqItem> boq)
    {
        var total = Money.Zero;
        foreach (var e in _entries)
        {
            if (!boq.TryGetValue(e.BoqCode, out var item))
                throw new InvalidOperationException($"Measurement refers to unknown BOQ item '{e.BoqCode}'.");
            total += Money.Rupees(e.Quantity * item.Rate.Amount);
        }
        return total;
    }
}
```

```csharp file=Billing/Deductions.cs
namespace Contracts.Billing;

public sealed record AppliedDeduction(string Code, Money Amount);

public sealed record BillContext(string ContractNo, Money Gross, Money OutstandingAdvance);

/// <summary>One deduction per class. A contract has a list of rules; no switch over combinations.</summary>
public interface IDeductionRule
{
    string Code { get; }
    AppliedDeduction Apply(BillContext context);
}

public sealed class RetentionRule(decimal percent) : IDeductionRule
{
    public string Code => "RETENTION";
    public AppliedDeduction Apply(BillContext c) => new(Code, c.Gross.Percent(percent));
}

public sealed class IncomeTaxTdsRule(decimal percent) : IDeductionRule
{
    public string Code => "TDS";
    public AppliedDeduction Apply(BillContext c) => new(Code, c.Gross.Percent(percent));
}

/// <summary>The old temporary field (OutstandingAdvance) now arrives in the context; the rule is stateless.</summary>
public sealed class AdvanceRecoveryRule(decimal percentOfBill) : IDeductionRule
{
    public string Code => "ADVANCE";
    public AppliedDeduction Apply(BillContext c) => new(Code, Money.Min(c.Gross.Percent(percentOfBill), c.OutstandingAdvance));
}
```

```csharp file=Billing/RaBillCalculator.cs
namespace Contracts.Billing;

public sealed record RaBill(string ContractNo, int BillNo, Money Gross, IReadOnlyList<AppliedDeduction> Deductions)
{
    public Money TotalDeductions => Deductions.Aggregate(Money.Zero, (sum, d) => sum + d.Amount);
    public Money NetPayable => Gross - TotalDeductions;
}

public sealed record ContractTerms(string ContractNo, IReadOnlyDictionary<string, BoqItem> Boq, IReadOnlyList<IDeductionRule> Deductions);

/// <summary>Small, single-purpose: calculation only. Email and persistence live in their own classes.</summary>
public static class RaBillCalculator
{
    public static RaBill Calculate(ContractTerms terms, int billNo, MeasurementSheet sheet, Money outstandingAdvance)
    {
        var gross = sheet.GrossValue(terms.Boq);
        var context = new BillContext(terms.ContractNo, gross, outstandingAdvance);
        var deductions = terms.Deductions.Select(rule => rule.Apply(context)).ToList();
        var bill = new RaBill(terms.ContractNo, billNo, gross, deductions);

        if (bill.NetPayable.Amount < 0)
            throw new InvalidOperationException($"Deductions {bill.TotalDeductions} exceed gross {gross} on bill {billNo}.");
        return bill;
    }
}
```

```csharp file=Program.cs
using Contracts.Billing;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// Illustrative contract terms; in a real system these are loaded per contract from the database.
var terms = new ContractTerms(
    "NH-48/PKG-3",
    new Dictionary<string, BoqItem>
    {
        ["EW-01"] = new("EW-01", "Earthwork in embankment", "m3", Money.Rupees(450m)),
        ["GSB-02"] = new("GSB-02", "Granular sub-base", "m3", Money.Rupees(2_150m)),
    },
    new IDeductionRule[] { new RetentionRule(5m), new IncomeTaxTdsRule(2m), new AdvanceRecoveryRule(10m) });

app.MapPost("/contracts/{contractNo}/bills/{billNo:int}/preview",
    (string contractNo, int billNo, MeasurementInput[] input, decimal outstandingAdvance) =>
{
    var sheet = new MeasurementSheet();
    foreach (var m in input)
        sheet.Add(new MeasurementEntry(m.BoqCode,
            new ChainageRange(Chainage.Parse(m.From), Chainage.Parse(m.To), m.Side), m.Quantity));

    var bill = RaBillCalculator.Calculate(terms, billNo, sheet, Money.Rupees(outstandingAdvance));
    return Results.Ok(new { bill.Gross, bill.Deductions, bill.NetPayable });
});

app.Run();

public sealed record MeasurementInput(string BoqCode, string From, string To, CarriagewaySide Side, decimal Quantity);
```

What each change bought:

- **`Chainage` and `ChainageRange`** — "12+350" parsing and the "end after start" rule live in one place. A swapped `fromM`/`toKm` is now impossible to write.
- **`MeasurementSheet.GrossValue`** — the calculation sits with its data; the unknown-item rule throws instead of returning `-1`.
- **`IDeductionRule`** — nine combination cases became three rules. A new labour-cess deduction is one new class; nothing else changes.
- **No temporary field** — the outstanding advance is an *input* to the calculation, not hidden mutable state on a service. Updating the advance balance after the bill is approved is a separate, explicit step.

## Bad design vs good design

**Bad:** `RaBillProcessor.Process` from the step-by-step section, with every smell in the table there.

One deserves emphasis: the temporary field. A "preview bill" button calls `Process`, which reduces `OutstandingAdvance`. Preview twice and the recovery on the real bill is wrong. Smells aren't just style; they hide real defects.

**Good:** the production code above. Each type has one job, inputs are explicit, and invalid values can't be constructed.

### When smell-fixing goes wrong

:::callout type=mistake title="Refactoring without tests, or without a reason"
Two common failures: (1) a "big clean-up" PR that touches 80 files with no characterisation tests, which changes behaviour nobody noticed until month-end billing; (2) polishing code that nobody needs to change, while the real hotspot stays ugly. Refactor *in front of* the feature you're about to build, in small steps, with tests.
:::

- **Over-extraction.** Splitting a clear 25-line method into eight 3-line methods scatters the logic. The smell is about *comprehension*, not line count.
- **Value objects for everything.** A `ProjectName` wrapper around `string` that adds no rules is ceremony. Create value objects where there's validation, formatting or arithmetic to protect.
- **Hiding every delegate.** Fixing every message chain with forwarding methods creates middle men. Use Hide Delegate when the caller needs a *business answer*, not to avoid every dot.
- **Treating metrics as targets.** "Every method under 10 lines" or "cyclomatic complexity below 5" become goals people game. Use metrics to find candidates, then use judgement.

## Practical playground

`PrintBillSummary` is a long method with three commented sections. Extract each section into a well-named private method **without changing the printed output**. Run it before and after; the output must be identical. That output is your characterisation test.

:::playground type=csharp title="Extract Method on a long method"
```csharp file=Program.cs
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

public static class BillReport
{
    public static string PrintBillSummary(string contractNo, List<(string Item, decimal Qty, decimal Rate)> lines, decimal advance)
    {
        // --- gross ---
        decimal gross = 0;
        foreach (var l in lines) gross += Math.Round(l.Qty * l.Rate, 2, MidpointRounding.AwayFromZero);

        // --- deductions ---
        var retention = Math.Round(gross * 0.05m, 2, MidpointRounding.AwayFromZero);
        var tds = Math.Round(gross * 0.02m, 2, MidpointRounding.AwayFromZero);
        var recovery = Math.Min(Math.Round(gross * 0.10m, 2, MidpointRounding.AwayFromZero), advance);

        // --- format ---
        var c = CultureInfo.InvariantCulture;
        return string.Join(Environment.NewLine,
            $"Contract {contractNo}",
            $"Gross:     {gross.ToString("N2", c)}",
            $"Retention: {retention.ToString("N2", c)}",
            $"TDS:       {tds.ToString("N2", c)}",
            $"Advance:   {recovery.ToString("N2", c)}",
            $"Net:       {(gross - retention - tds - recovery).ToString("N2", c)}");
    }
}

public static class Program
{
    public static void Main()
    {
        var lines = new List<(string, decimal, decimal)> { ("EW-01", 1_200m, 450m), ("GSB-02", 310.5m, 2_150m) };
        Console.WriteLine(BillReport.PrintBillSummary("NH-48/PKG-3", lines, 50_000m));
    }
}
```
:::

## Exercises

:::exercise id=m04-code-smells-ex1 difficulty=beginner kind=code title="Cure primitive obsession with a Chainage value object"
Chainages are passed around as `int km, int m` pairs and strings like `"12+350"`, parsed differently in four places. Implement `Chainage` and `ChainageRange` so the rules live in one place.
::requirements
- `Chainage.Parse("12+350")` → 12,350 metres. Metres must be exactly three digits.
- `ToString()` gives `"12+350"`; `Chainage.Parse("0+005").ToString()` gives `"0+005"`.
- Invalid text (`"12350"`, `"12+35"`, `"a+100"`, `""`) throws `FormatException`.
- `new ChainageRange(from, to)` throws `ArgumentException` when `to` is not after `from`; `LengthMetres` returns the difference.
::acceptance
- All parse, format and range tests pass.
- No caller needs to know the "km+metres" format.
::hint
A `readonly record struct` gives you value equality for free.
::hint
A regex like `^(\d{1,4})\+(\d{3})$` enforces the format.
::hint
Store one number, total metres. Derive km and metres in `ToString` with `/ 1000` and `% 1000`.
::hint
```csharp
return new Chainage(int.Parse(m.Groups[1].Value) * 1000 + int.Parse(m.Groups[2].Value));
```
::starter
```csharp file=Chainage.cs
using System;
using System.Text.RegularExpressions;

public readonly record struct Chainage(int Metres)
{
    public static Chainage Parse(string text) => throw new NotImplementedException();
    public override string ToString() => throw new NotImplementedException();
}

public sealed record ChainageRange
{
    public Chainage From { get; }
    public Chainage To { get; }

    public ChainageRange(Chainage from, Chainage to) => throw new NotImplementedException();

    public int LengthMetres => throw new NotImplementedException();
}
```
::tests
```csharp file=ChainageTests.cs
using System;
using Xunit;

public class ChainageTests
{
    [Fact] public void Parses_km_and_metres() => Assert.Equal(12_350, Chainage.Parse("12+350").Metres);
    [Fact] public void Formats_back() => Assert.Equal("12+350", Chainage.Parse("12+350").ToString());
    [Fact] public void Pads_metres() => Assert.Equal("0+005", Chainage.Parse("0+005").ToString());
    [Fact] public void Values_are_equal_by_value() => Assert.Equal(Chainage.Parse("3+000"), new Chainage(3000));

    [Theory]
    [InlineData("12350")]
    [InlineData("12+35")]
    [InlineData("a+100")]
    [InlineData("")]
    public void Rejects_bad_format(string text) => Assert.Throws<FormatException>(() => Chainage.Parse(text));

    [Fact]
    public void Range_length() =>
        Assert.Equal(1_650, new ChainageRange(Chainage.Parse("12+350"), Chainage.Parse("14+000")).LengthMetres);

    [Fact]
    public void Range_must_go_forward() =>
        Assert.Throws<ArgumentException>(() => new ChainageRange(Chainage.Parse("14+000"), Chainage.Parse("12+350")));
}
```
::solution
```csharp file=Chainage.cs
using System;
using System.Globalization;
using System.Text.RegularExpressions;

public readonly record struct Chainage(int Metres)
{
    private static readonly Regex Format = new(@"^(\d{1,4})\+(\d{3})$");

    public static Chainage Parse(string text)
    {
        var m = Format.Match(text?.Trim() ?? "");
        if (!m.Success) throw new FormatException($"Chainage '{text}' must look like 12+350.");
        return new Chainage(int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) * 1000
                          + int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture));
    }

    public override string ToString() => $"{Metres / 1000}+{Metres % 1000:000}";
}

public sealed record ChainageRange
{
    public Chainage From { get; }
    public Chainage To { get; }

    public ChainageRange(Chainage from, Chainage to)
    {
        if (to.Metres <= from.Metres) throw new ArgumentException($"End {to} must be after start {from}.");
        From = from;
        To = to;
    }

    public int LengthMetres => To.Metres - From.Metres;
}
```

Four parsers become one, and a `ChainageRange` that runs backwards can no longer exist anywhere in the system.
::mistakes
- Storing km and metres separately, which makes comparison and arithmetic awkward.
- Accepting `"12+35"` as 12,035 m: ambiguous input should be rejected, not guessed.
- Validating in the callers instead of the constructor.
:::

:::exercise id=m04-code-smells-ex2 difficulty=beginner kind=written title="Name the smells"
Name every smell you can find in this code, and the refactoring you'd apply first for each.

```csharp
public class SiteReportService : BaseReportService
{
    public string? CachedWeather;   // set only when includeWeather is true

    public string Build(string projectCode, int y, int m, bool includeWeather, bool includePhotos,
                        bool pdf, string engineerName, string engineerMobile, string engineerEmail)
    {
        var state = _projects.Get(projectCode).Contract.Client.Address.State.Name;
        if (includeWeather) CachedWeather = _weather.Get(state);
        // 150 lines...
    }

    public override void Archive() { /* not used for site reports */ }
}
```
::acceptance
- At least five smells named correctly.
- Each with a concrete first refactoring.
::hint
Count the parameters, then look at which ones travel together.
::hint
Look at the field's lifetime, the long chain of dots, and the empty override.
::hint
Boolean flags that change output format are also worth naming.
::solution
- **Long parameter list** (9) → *Introduce Parameter Object* `SiteReportRequest`.
- **Data clump** — `engineerName`, `engineerMobile`, `engineerEmail` → *Extract Class* `EngineerContact` (and `y, m` → `YearMonth`).
- **Flag arguments** — `pdf`, `includePhotos`, `includeWeather` → split into separate methods or a request object with clear options; `pdf` likely belongs to a separate renderer (divergent change).
- **Temporary field** — `CachedWeather` → make it a local variable or a parameter; it leaks state between calls.
- **Message chain** — `.Contract.Client.Address.State.Name` → *Hide Delegate*: `_projects.GetClientState(projectCode)`.
- **Long method** (150 lines) → *Extract Method* by section.
- **Refused bequest** — empty `Archive()` override → *Replace Inheritance with Delegation*; the base class probably isn't a true "is-a".
- **Primitive obsession** — `projectCode`, `engineerMobile` as strings → value objects where rules exist.
::mistakes
- Calling the base class a "large class" without evidence. Name what you can see.
:::

:::exercise id=m04-code-smells-ex3 difficulty=intermediate kind=code title="Move Method to cure feature envy"
`BillingService.CalculateRetentionRelease` reads five properties of `Contract` and uses nothing of its own. Move the logic into `Contract.RetentionReleasable(DateOnly asOf)` and delete it from `BillingService`.

Rules:
- Nothing is releasable before `CompletionDate + DefectLiabilityDays`.
- Nothing is releasable while `HasOpenDefects` is true.
- Otherwise, releasable = `RetentionHeld − RetentionReleased` (never negative).
::acceptance
- `Contract.RetentionReleasable` returns the right amount in all three cases.
- `BillingService` no longer has `CalculateRetentionRelease`.
- `BillingService.ReleaseRetention` still works, by asking the contract.
::hint
Copy the method body into `Contract` first, replacing `c.` with nothing. Then make the old method call the new one. Then delete the old one.
::hint
Once the calculation is inside `Contract`, ask: does anything outside still need the raw fields?
::hint
`ReleaseRetention` becomes: `var amount = contract.RetentionReleasable(asOf); contract.RecordRelease(amount); return amount;`
::starter
```csharp file=Retention.cs
using System;

public sealed class Contract
{
    public required string ContractNo { get; init; }
    public required DateOnly CompletionDate { get; init; }
    public int DefectLiabilityDays { get; init; } = 365;
    public decimal RetentionHeld { get; set; }
    public decimal RetentionReleased { get; set; }
    public bool HasOpenDefects { get; set; }

    public decimal RetentionReleasable(DateOnly asOf) => throw new NotImplementedException();

    public void RecordRelease(decimal amount)
    {
        if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
        RetentionReleased += amount;
    }
}

public sealed class BillingService
{
    // Feature envy: uses only Contract's data.
    public decimal CalculateRetentionRelease(Contract c, DateOnly asOf)
    {
        if (asOf < c.CompletionDate.AddDays(c.DefectLiabilityDays)) return 0m;
        if (c.HasOpenDefects) return 0m;
        return Math.Max(0m, c.RetentionHeld - c.RetentionReleased);
    }

    public decimal ReleaseRetention(Contract c, DateOnly asOf)
    {
        var amount = CalculateRetentionRelease(c, asOf);
        c.RecordRelease(amount);
        return amount;
    }
}
```
::tests
```csharp file=RetentionTests.cs
using System;
using Xunit;

public class RetentionTests
{
    private static Contract NewContract() => new()
    {
        ContractNo = "NH-48/PKG-3",
        CompletionDate = new DateOnly(2025, 3, 31),
        RetentionHeld = 12_50_000m,
        RetentionReleased = 2_50_000m,
    };

    [Fact] public void Nothing_before_dlp_ends() => Assert.Equal(0m, NewContract().RetentionReleasable(new DateOnly(2026, 3, 30)));

    [Fact] public void Balance_after_dlp() => Assert.Equal(10_00_000m, NewContract().RetentionReleasable(new DateOnly(2026, 3, 31)));

    [Fact]
    public void Nothing_with_open_defects()
    {
        var c = NewContract();
        c.HasOpenDefects = true;
        Assert.Equal(0m, c.RetentionReleasable(new DateOnly(2026, 6, 1)));
    }

    [Fact]
    public void Service_releases_by_asking_the_contract()
    {
        var c = NewContract();
        Assert.Equal(10_00_000m, new BillingService().ReleaseRetention(c, new DateOnly(2026, 4, 1)));
        Assert.Equal(0m, c.RetentionReleasable(new DateOnly(2026, 4, 2)));
    }

    [Fact]
    public void Envious_method_is_gone() => Assert.Null(typeof(BillingService).GetMethod("CalculateRetentionRelease"));
}
```
::solution
```csharp file=Retention.cs
using System;

public sealed class Contract
{
    public required string ContractNo { get; init; }
    public required DateOnly CompletionDate { get; init; }
    public int DefectLiabilityDays { get; init; } = 365;
    public decimal RetentionHeld { get; set; }
    public decimal RetentionReleased { get; set; }
    public bool HasOpenDefects { get; set; }

    public decimal RetentionReleasable(DateOnly asOf)
    {
        if (asOf < CompletionDate.AddDays(DefectLiabilityDays)) return 0m;
        if (HasOpenDefects) return 0m;
        return Math.Max(0m, RetentionHeld - RetentionReleased);
    }

    public void RecordRelease(decimal amount)
    {
        if (amount < 0) throw new ArgumentOutOfRangeException(nameof(amount));
        RetentionReleased += amount;
    }
}

public sealed class BillingService
{
    public decimal ReleaseRetention(Contract c, DateOnly asOf)
    {
        var amount = c.RetentionReleasable(asOf);
        c.RecordRelease(amount);
        return amount;
    }
}
```

The next step (not required here) is to make `RetentionHeld`, `RetentionReleased` and `HasOpenDefects` private-set, since nothing outside needs to write them any more. That's how Move Method leads to better encapsulation.
::mistakes
- Moving the method but leaving a forwarding copy in `BillingService` "for compatibility" inside the same codebase — a middle man.
- Changing behaviour while moving (for example, adding a partial release). Move first, change later, in separate commits.
:::

:::exercise id=m04-code-smells-ex4 difficulty=intermediate kind=code title="Replace the deduction switch with rules"
`DeductionCalculator` has a `switch` with a case for every **combination** of deductions. Replace it with one class per deduction and a `RaBillDeductions` aggregator, then delete `DeductionCalculator`.
::requirements
- `RetentionRule(percent)`, `IncomeTaxTdsRule(percent)` and `AdvanceRecoveryRule(percentOfBill)` implement `IDeductionRule`.
- Advance recovery is `percentOfBill` of gross, but never more than the outstanding advance.
- Every amount is rounded to 2 decimals, half away from zero.
- `RaBillDeductions.Total(gross, outstandingAdvance)` sums all configured rules.
::acceptance
- Gross ₹10,00,000 with 5 % retention, 2 % TDS, 10 % advance recovery and ₹60,000 outstanding → total ₹1,30,000.
- A new rule defined only in the test file works without changing `RaBillDeductions`.
- `DeductionCalculator` no longer exists.
::hint
Each `case` in the old switch adds the same pieces in different combinations. What are the pieces?
::hint
The pieces are the rules. A contract's configuration becomes a *list* of rules instead of a mode string.
::hint
`RaBillDeductions` takes `IEnumerable<IDeductionRule>` and sums `rule.Amount(gross, outstanding)`.
::hint
```csharp
public decimal Amount(decimal gross, decimal outstanding) => Math.Min(Round(gross * percent / 100m), outstanding);
```
::starter
```csharp file=Deductions.cs
using System;
using System.Collections.Generic;
using System.Linq;

public static class DeductionCalculator
{
    public static decimal Calculate(string mode, decimal gross, decimal outstandingAdvance)
    {
        decimal R(decimal v) => Math.Round(v, 2, MidpointRounding.AwayFromZero);
        switch (mode)
        {
            case "RET": return R(gross * 0.05m);
            case "RET+TDS": return R(gross * 0.05m) + R(gross * 0.02m);
            case "RET+ADV": return R(gross * 0.05m) + Math.Min(R(gross * 0.10m), outstandingAdvance);
            case "RET+TDS+ADV": return R(gross * 0.05m) + R(gross * 0.02m) + Math.Min(R(gross * 0.10m), outstandingAdvance);
            default: throw new ArgumentException($"Unknown mode {mode}");
        }
    }
}

public interface IDeductionRule
{
    string Code { get; }
    decimal Amount(decimal gross, decimal outstandingAdvance);
}

public sealed class RetentionRule(decimal percent) : IDeductionRule
{
    public string Code => "RETENTION";
    public decimal Amount(decimal gross, decimal outstandingAdvance) => throw new NotImplementedException();
}

public sealed class IncomeTaxTdsRule(decimal percent) : IDeductionRule
{
    public string Code => "TDS";
    public decimal Amount(decimal gross, decimal outstandingAdvance) => throw new NotImplementedException();
}

public sealed class AdvanceRecoveryRule(decimal percentOfBill) : IDeductionRule
{
    public string Code => "ADVANCE";
    public decimal Amount(decimal gross, decimal outstandingAdvance) => throw new NotImplementedException();
}

public sealed class RaBillDeductions(IEnumerable<IDeductionRule> rules)
{
    public decimal Total(decimal gross, decimal outstandingAdvance) => throw new NotImplementedException();
}
```
::tests
```csharp file=DeductionTests.cs
using System;
using Xunit;

public class DeductionTests
{
    private sealed class LabourCessRule : IDeductionRule
    {
        public string Code => "CESS";
        public decimal Amount(decimal gross, decimal outstandingAdvance) => Math.Round(gross * 0.01m, 2);
    }

    [Fact]
    public void Full_set_of_rules()
    {
        IDeductionRule[] rules = { new RetentionRule(5m), new IncomeTaxTdsRule(2m), new AdvanceRecoveryRule(10m) };
        Assert.Equal(1_30_000m, new RaBillDeductions(rules).Total(10_00_000m, 60_000m));
    }

    [Fact]
    public void Advance_recovery_never_exceeds_outstanding() =>
        Assert.Equal(60_000m, new AdvanceRecoveryRule(10m).Amount(10_00_000m, 60_000m));

    [Fact]
    public void Advance_recovery_is_percent_when_enough_outstanding() =>
        Assert.Equal(1_00_000m, new AdvanceRecoveryRule(10m).Amount(10_00_000m, 5_00_000m));

    [Fact]
    public void Rounds_half_away_from_zero() => Assert.Equal(0.05m, new RetentionRule(5m).Amount(0.9m, 0m));

    [Fact]
    public void New_rule_needs_no_change_to_aggregator()
    {
        IDeductionRule[] rules = { new RetentionRule(5m), new LabourCessRule() };
        Assert.Equal(60_000m, new RaBillDeductions(rules).Total(10_00_000m, 0m));
    }

    [Fact]
    public void Switch_class_is_gone() => Assert.Null(Type.GetType("DeductionCalculator"));
}
```
::solution
```csharp file=Deductions.cs
using System;
using System.Collections.Generic;
using System.Linq;

public interface IDeductionRule
{
    string Code { get; }
    decimal Amount(decimal gross, decimal outstandingAdvance);
}

internal static class Rupees
{
    public static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}

public sealed class RetentionRule(decimal percent) : IDeductionRule
{
    public string Code => "RETENTION";
    public decimal Amount(decimal gross, decimal outstandingAdvance) => Rupees.Round(gross * percent / 100m);
}

public sealed class IncomeTaxTdsRule(decimal percent) : IDeductionRule
{
    public string Code => "TDS";
    public decimal Amount(decimal gross, decimal outstandingAdvance) => Rupees.Round(gross * percent / 100m);
}

public sealed class AdvanceRecoveryRule(decimal percentOfBill) : IDeductionRule
{
    public string Code => "ADVANCE";
    public decimal Amount(decimal gross, decimal outstandingAdvance) =>
        Math.Min(Rupees.Round(gross * percentOfBill / 100m), outstandingAdvance);
}

public sealed class RaBillDeductions(IEnumerable<IDeductionRule> rules)
{
    private readonly IReadOnlyList<IDeductionRule> _rules = rules.ToList();
    public decimal Total(decimal gross, decimal outstandingAdvance) => _rules.Sum(r => r.Amount(gross, outstandingAdvance));
}
```

Four combination cases (nine in the real system) became three rules. A new deduction is one class plus one line of configuration. The `Rupees.Round` helper is shared because the rounding rule is one piece of knowledge.
::alternatives
If deductions are purely "percent of gross" with no special logic, a single `PercentDeduction(code, percent)` class configured from the database is simpler than one class per deduction. Keep separate classes only for rules with real differences, like the advance cap.
::mistakes
- Keeping the mode string and mapping it to rules in a new switch — the combinations are still enumerated.
- Making `AdvanceRecoveryRule` mutate an outstanding balance field: that recreates the temporary-field bug.
:::

:::exercise id=m04-code-smells-ex5 difficulty=advanced kind=written title="Build and prioritise a technical-debt register"
You lead a team of six maintaining a project-monitoring platform. The backlog has these debt items. Using the quadrant and hotspot thinking, classify each, estimate whether it's paying interest, and propose an order of work for the next quarter, assuming about 20 % of capacity for debt (a common team convention, not a rule).

| # | Item | Commits in last 6 months | Incidents | Notes |
|---|---|---|---|---|
| A | `ProgressReportBuilder` — 2,400 lines, no tests | 61 | 3 billing errors | Changed for every client |
| B | Old PDF export library, unsupported | 2 | 0 | Works; security scan flags it |
| C | Copy-pasted GSTIN validation in 7 places | 9 | 1 | Format change expected |
| D | Admin screens with inline SQL | 1 | 0 | Rarely used |
| E | Shortcut: single region, no replica, "until go-live" (chosen 2 years ago) | — | 1 outage, 40 min | Customer SLA now 99.9 % |
| F | Inconsistent naming in DTOs | 14 | 0 | Annoys developers |
::acceptance
- Each item placed in a quadrant with a reason.
- Interest assessed from change frequency and impact, not ugliness.
- An ordered plan with the first concrete step for the top two items.
- At least one item explicitly left alone, with the reason.
::hint
Interest is paid when code changes or when its risk materialises. Which items change often? Which carry risk even without change?
::hint
Security and availability debt can charge interest without any commits.
::hint
For the biggest hotspot, what must exist before you refactor it?
::hint
Think in increments: what can be done in two weeks that reduces interest straight away?
::solution
**Classification**

- **A** — reckless/inadvertent (grew without design). Highest interest: 61 changes, 3 incidents. **Top priority.**
- **B** — prudent/inadvertent (was fine when chosen). Low change, but **security risk** is interest. Medium priority; time-box a replacement.
- **C** — reckless/inadvertent duplication; a known upcoming change turns it into shotgun surgery. **High priority, cheap**: one `Gstin` value object.
- **D** — any quadrant; almost no interest. **Leave it**, but add a note; fix if a change is ever needed.
- **E** — prudent/deliberate *when taken*, but the plan was never executed, and the SLA changed. Now its interest is real (outage risk vs 99.9 %, which allows about 43 minutes of downtime a month). **High priority.**
- **F** — low interest; fix opportunistically (boy-scout rule) when touching those DTOs.

**Order:** C (a week, prevents a known incident) → A → E (replica plus tested failover) → B (replace behind an `IPdfRenderer` port) → F opportunistically → D only if touched.

**First steps:** for **A**, golden-file tests for five real monthly reports, then *Extract Method* on the financial-progress section that caused the billing errors. For **C**, create `Gstin.Parse` and replace one call site per commit.
::mistakes
- Ordering by ugliness ("D's SQL is the worst code") instead of by interest.
- Proposing a rewrite of A from scratch instead of incremental refactoring behind tests.
- Treating E as "not code" and ignoring it: architectural debt is debt too.
:::

## Automated testing

Tests make refactoring safe, and value objects make tests sharper.

**1. Characterisation (golden) tests before refactoring.** Pin today's output for real inputs:

```csharp
public class RaBillCharacterisationTests
{
    [Fact]
    public void Bill_7_matches_legacy_result()
    {
        var terms = new ContractTerms("NH-48/PKG-3",
            new Dictionary<string, BoqItem> { ["EW-01"] = new("EW-01", "Earthwork", "m3", Money.Rupees(450m)) },
            new IDeductionRule[] { new RetentionRule(5m), new IncomeTaxTdsRule(2m), new AdvanceRecoveryRule(10m) });
        var sheet = new MeasurementSheet();
        sheet.Add(new MeasurementEntry("EW-01",
            new ChainageRange(Chainage.Parse("12+000"), Chainage.Parse("12+500"), CarriagewaySide.Left), 1_200m));

        var bill = RaBillCalculator.Calculate(terms, 7, sheet, Money.Rupees(30_000m));

        // 1,200 x 450 = 5,40,000; retention 27,000; TDS 10,800; advance min(54,000, 30,000) = 30,000
        Assert.Equal(5_40_000m, bill.Gross.Amount);
        Assert.Equal(4_72_200m, bill.NetPayable.Amount);
    }
}
```

Run the same inputs through the old `RaBillProcessor` and the new code during the transition, and assert they agree. Once the old code is deleted, these become ordinary regression tests.

**2. Value-object tests.** `Chainage`, `Gstin` and `Money` each get a small `[Theory]` table of valid and invalid inputs. Every class that uses them inherits that safety.

**3. Rule tests in isolation.** Each `IDeductionRule` is tested alone with two or three rows, including the boundary (advance recovery exactly equal to outstanding).

**4. Guard against regression.** Roslyn analyzers such as CA1502 (excessive cyclomatic complexity) can warn in CI. Keep them as warnings, not hard gates, to avoid metric-gaming.

## Real-world application

- **Billing and finance systems** accumulate switch-on-combination and temporary-field smells, because rules are added contract by contract. Rule objects and explicit inputs fix both.
- **Government-integration code** (GST, e-way bills, PFMS) is prone to primitive obsession: GSTINs, PANs, IFSC codes and state codes as strings. Value objects pay off fast when formats change.
- **Hotspot analysis** from version control is used by many teams to direct refactoring effort, often with tools that combine `git log` churn with complexity metrics.
- **Debt registers** are commonly kept as labelled backlog items with an "interest" note, so product owners can weigh them against features.
- **Strangler migrations**: when a module is too smelly to refactor safely, teams wrap it and replace it piece by piece ([Strangler fig](#/lesson/m16-strangler-acl)).

## Interview questions

:::interview
::q beginner
What is a code smell? Is it a bug?
::a
A surface sign in code that *usually* indicates a deeper design problem, such as a very long method, a class with many unrelated responsibilities, or a method with many parameters. It's not a bug: the code works. It signals that future changes will be slower or riskier. It's a heuristic, so judgement decides whether to act.
::q beginner
What does "refactoring" mean, precisely?
::a
Changing the internal structure of code without changing its observable behaviour, in small steps, each verified by tests. Rename, Extract Method, Move Method and Introduce Parameter Object are examples. If behaviour changes, it's a feature or fix, and it should be in a separate commit from the refactoring.
::q intermediate
Explain feature envy and how to fix it.
::a
A method that uses another object's data more than its own — for example, a `BillingService` method that reads five properties of `Contract` to compute retention. The rule is far from its data, and `Contract` must expose internals. Fix with *Move Method*: put the calculation on `Contract` and let the service ask. Then tighten `Contract`'s setters, since outsiders no longer need them. The exception is code whose job is to combine many objects, such as a report query.
::q intermediate
What's the difference between shotgun surgery and divergent change?
::a
They're mirror images. **Shotgun surgery**: one change requires edits in many classes (GSTIN validation copied into seven places). Fix by consolidating the logic into one place. **Divergent change**: one class changes for many unrelated reasons (a processor that changes for tax rules, email templates and database schema). Fix by splitting the class by reason to change. Together they describe misplaced responsibility in both directions.
::q advanced
Explain Fowler's technical debt quadrant and how you'd use it with a product owner.
::a
Two axes: deliberate vs inadvertent, prudent vs reckless. Prudent-deliberate debt is a business trade with a plan; reckless-deliberate ("no time for tests") is usually a false economy; reckless-inadvertent reveals skill gaps; prudent-inadvertent is the normal result of learning. With a product owner I'd use it to frame each item's *origin*, then talk about *interest* — cost per change and risk (incidents, security, SLA) — and prioritise by interest × likelihood of change, repaying in increments alongside features.
::q advanced
You inherit a 3,000-line class that causes most of the team's bugs. How do you approach it?
::a
Don't rewrite it. Confirm it's a hotspot (churn, incidents). Then: (1) characterisation tests with golden files for real inputs; (2) find seams to inject dependencies; (3) extract the most-changed, most-buggy section first (Extract Method, then Extract Class), committing on green; (4) introduce value objects, which often shrinks methods; (5) route new features through the extracted classes so the old one shrinks. Measure progress by incidents and change lead time, not line count.
:::

## Summary and revision

**Key takeaways**

- A smell is a *surface* sign that *usually* points to a deeper problem. Use judgement.
- Refactoring changes structure, not behaviour: tests first, small steps, commit on green, never mixed with features.
- Smells come in families: size (long method, large class, divergent change), value (primitive obsession, data clumps, long parameter list), placement (feature envy, shotgun surgery, message chains, middle man), state (temporary field), hierarchy (refused bequest, speculative generality), and conditionals (switch statements).
- Technical debt has principal and interest; interest is paid only when code changes or its risk materialises.
- Classify debt with the quadrant; prioritise by hotspots (complexity × change frequency) and business impact.
- Don't over-correct: over-extraction, wrapper value objects and metric targets are smells of their own.

**Terminology**: code smell, refactoring, characterisation test, Extract Method, Move Method, Introduce Parameter Object, Replace Primitive with Object, Replace Conditional with Polymorphism, Hide Delegate, Remove Middle Man, technical debt, principal, interest, hotspot.

:::flashcards
Q: What is a code smell?
A: A surface indication that usually corresponds to a deeper design problem. A heuristic, not a bug.
Q: Feature envy — fix?
A: Move Method: put the logic on the class whose data it uses.
Q: Data clumps — fix?
A: Extract Class / Introduce Parameter Object (e.g. ChainageRange for fromKm, fromM, toKm, toM, side).
Q: Primitive obsession — fix?
A: Replace Primitive with Object: value objects like Gstin, Money, Chainage that validate themselves.
Q: Shotgun surgery vs divergent change?
A: Shotgun: one change, many classes (consolidate). Divergent: one class, many reasons to change (split).
Q: Message chain vs middle man?
A: Chain: a.B.C.D navigation (Hide Delegate). Middle man: class that only forwards (Remove Middle Man). Balance them.
Q: Temporary field — fix?
A: Extract Class for the field and the code that uses it, or pass the value as an explicit input.
Q: Refused bequest — fix?
A: Replace Inheritance with Delegation, or Push Down Method to the subclasses that need it.
Q: Four quadrants of technical debt?
A: Prudent-deliberate, reckless-deliberate, reckless-inadvertent, prudent-inadvertent.
Q: Where does technical-debt interest get paid?
A: In code that changes (or risk that materialises). Prioritise hotspots: complex and frequently changed.
:::

## Knowledge check

:::quiz pass=70
::q single
A method `CalculateGst(Invoice inv)` in `ReportService` reads `inv.Lines`, `inv.SupplierGstin`, `inv.BuyerGstin` and `inv.PlaceOfSupply`, and nothing from `ReportService`. Which smell and fix?
- [ ] Middle man; Remove Middle Man.
- [x] Feature envy; Move Method to `Invoice` (or a tax module that owns the rule).
- [ ] Large class; Extract Class.
- [ ] Speculative generality; Inline Method.
> The method envies `Invoice`'s data. Moving it puts the rule next to the data it uses.
::q single
GSTIN validation is copied into seven classes, and the format is about to change. What is this situation called, and what's the first refactoring?
- [ ] Divergent change; split the classes.
- [x] Shotgun surgery waiting to happen; Replace Primitive with Object (a `Gstin` value object) and route every caller through it.
- [ ] Message chain; Hide Delegate.
- [ ] Refused bequest; Replace Inheritance with Delegation.
> One change would need seven edits. Consolidating the knowledge into one type removes the scatter.
::q single
A "preview bill" button reduces the contractor's outstanding advance each time it's clicked. Which smell most likely caused this?
- [ ] Long parameter list
- [x] Temporary field — mutable state on the service that's only meaningful for one calculation
- [ ] Middle man
- [ ] Speculative generality
> The advance balance was a field mutated as a side effect. Passing it as an explicit input makes the calculation repeatable.
::q multi
Which are signs that you should *not* refactor a smelly module right now? (Select all that apply.)
- [x] It hasn't changed in three years and has no incidents.
- [x] It's scheduled to be replaced next quarter via a strangler migration.
- [ ] You're about to add a feature to it.
- [x] There are no tests and no time to write characterisation tests before the change.
> Untouched code charges no interest; code about to be replaced isn't worth polishing; and refactoring without tests is risky. (In the last case, the right move is usually to add tests first, then refactor.)
::q single
Your team says "no time for tests, we'll add them later" to hit a demo. Which quadrant?
- [ ] Prudent and deliberate
- [x] Reckless and deliberate
- [ ] Reckless and inadvertent
- [ ] Prudent and inadvertent
> It's a conscious choice, but without a realistic repayment plan and with a cost that arrives almost immediately.
::q single
How should you prioritise technical-debt items?
- [ ] By how ugly the code looks.
- [ ] Alphabetically by module.
- [x] By interest: change frequency and business impact (incidents, security, SLA risk), plus how cheap the fix is.
- [ ] Always fix the oldest debt first.
> Interest is paid where code changes or risk materialises. That's where repayment buys the most.
::q single
A teammate's refactoring PR also changes how retention is rounded. What's the best review comment?
- [ ] Approve; it's all improvement.
- [x] Split it: one PR for the behaviour-preserving refactoring, another for the rounding change with its own tests.
- [ ] Reject all refactoring PRs.
- [ ] Ask them to squash it into one commit.
> Mixing structural and behavioural changes makes review and revert hard.
:::

## Completion criteria

You have finished this lesson when you can:

- [ ] Score at least 70 % on the knowledge check.
- [ ] Complete exercises 1, 3 and 4, with `dotnet test` passing.
- [ ] Name all 14 smells from memory with one refactoring each.
- [ ] Place three debt items from your own work in the quadrant and say which one charges the most interest.
