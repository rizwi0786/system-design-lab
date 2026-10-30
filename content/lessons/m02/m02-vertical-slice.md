---
id: m02-vertical-slice
title: Vertical Slice Architecture
module: m02
level: intermediate
status: reviewed
template: lesson
minutes: 65
prerequisites: [m02-layered, m02-clean-onion, m03-dependency-injection]
related: [m08-vertical-slice, m02-modular-monolith, m02-coupling-cohesion, m06-mediator, m08-cqrs-fundamentals]
tags: [architecture, feature-folders, minimal-apis, cqrs]
patterns: [Vertical Slice]
summary: Organise code by feature instead of by technical layer, so everything one use case needs (endpoint, validation, handler, data access) lives together and changes together.
references:
  - title: "Jimmy Bogard — Vertical Slice Architecture"
    url: https://www.jimmybogard.com/vertical-slice-architecture/
  - title: "Microsoft Learn — Minimal APIs: route groups and route handlers"
    url: https://learn.microsoft.com/aspnet/core/fundamentals/minimal-apis/route-handlers
  - title: "Martin Fowler — Presentation Domain Data Layering"
    url: https://martinfowler.com/bliki/PresentationDomainDataLayering.html
---

Most of us learn to build web apps in layers: controllers in one folder, services in another, repositories in a third. That works. But when you add one feature, you end up touching five folders and three shared classes. Vertical Slice Architecture flips the organisation: **one folder per feature, holding everything that feature needs.**

This is an introductory lesson. We build a small return-request API for an online marketplace, compare it with the layered version, and learn when slices help and when they don't. The deeper DDD-flavoured version is in [Vertical slice architecture in practice](#/lesson/m08-vertical-slice).

## Learning objectives

By the end of this lesson you will be able to:

1. Explain the difference between organising code by technical layer and by feature (vertical slice).
2. Build an ASP.NET Core minimal API where each use case is one slice: request, validator, handler and endpoint mapping.
3. Decide what belongs in a slice and what belongs in a small shared kernel.
4. Add cross-cutting behaviour (validation, logging) once, without copying it into every slice.
5. Write tests per slice, and an architecture test that stops slices from reaching into each other.
6. Recognise when vertical slices are overkill and plain layers are the simpler choice.

## Prerequisites

- [Layered architecture](#/lesson/m02-layered): you should know what presentation, business and data layers are, because we compare against them.
- [Clean Architecture and Onion Architecture](#/lesson/m02-clean-onion): helpful for understanding what slices keep from those styles and what they drop.
- [Dependency injection](#/lesson/m03-dependency-injection): each handler is registered in the DI container.

You can still follow if you have only built one ASP.NET Core API. Read the beginner section first.

## Explain it like I'm a beginner

Think of a large hospital. One way to organise it is by **job type**: all the receptionists sit on floor 1, all the nurses on floor 2, all the doctors on floor 3, all the lab technicians on floor 4. A patient with a broken arm visits floor 1, then 3, then 4, then 2, then 3 again. Every patient walks through every floor.

Another way is by **department**: the orthopaedics wing has its own reception desk, nurses, doctors and X-ray room. The broken-arm patient stays in one wing. If orthopaedics changes how it books X-rays, cardiology doesn't notice.

Software can be organised the same two ways.

- **By technical layer (horizontal layers):** `Controllers/`, `Services/`, `Repositories/`, `Models/`. Every feature is spread across all of them.
- **By feature (vertical slices):** `Features/SubmitReturn/`, `Features/ApproveReturn/`, `Features/GetOpenReturns/`. Each folder has its own request type, rules and data access.

A "slice" is called *vertical* because, if you draw the layers as horizontal bands (UI on top, database at the bottom), one feature cuts straight down through all of them, like a slice of layered cake.

The core rule is short: **things that change together should live together.** When the support team asks "let customers attach a photo to the return request", you open one folder, not five.

## First-principles explanation

### What it is

Vertical Slice Architecture (VSA) is a way of organising an application around **use cases** (the things a user does, such as "request a return") instead of around technical roles. Each slice contains the code for one request from the edge of the system to the database and back. Slices share as little as possible. Each one is free to choose its own approach: one slice may use a rich domain object, another may run one SQL query and return a flat list.

The name and the modern popularity come mainly from Jimmy Bogard's writing, but the underlying idea is older: "package by feature" and the principle of **high cohesion, low coupling** (see [Coupling, cohesion, modularity and separation of concerns](#/lesson/m02-coupling-cohesion)).

### Why it exists — the problem with layers at scale

Layers are not wrong. They solve a real problem: keeping UI code out of database code. But in a growing business application, three costs appear.

1. **Changes are scattered.** A typical feature request ("let sellers reject a return with a reason") touches the controller, a DTO, the service interface, the service class, the repository interface, the repository class and a mapper. That is 7 files in 5 folders for one change.
2. **Shared services grow into god classes.** `ReturnService` starts with 3 methods. Two years later it has 40, injects 12 dependencies, and every feature's tests must construct all 12. A change for one feature can break another, because they share private helper methods.
3. **Abstractions that nobody needed.** Every repository method is one-to-one with a service method, which is one-to-one with a controller action. The layers pass data down and back up without adding logic. You pay for the indirection on every change.

Vertical slices attack all three: one change is in one folder, there is no shared service to grow, and each slice adds an abstraction only where it actually helps.

### How it works

A slice usually has four small parts. In C# they often sit in one file or one folder:

| Part | Job | Example |
|---|---|---|
| **Request** (command or query) | The input data for this use case | `SubmitReturnCommand(CityCode, OrderNumber, Reason, RequestedBy, PickupBy)` |
| **Validator** | Rejects bad input before any work | Order number must look like `ORD-10000400` |
| **Handler** | Does the work: loads data, applies rules, saves | Creates the return request, saves it, returns its id |
| **Endpoint** | Maps HTTP to the handler | `POST /returns` |

Requests that **change** data are commands; requests that only **read** are queries. This split is a light form of CQRS (separating reads from writes, covered in [CQRS fundamentals](#/lesson/m08-cqrs-fundamentals)). It matters because the two kinds have different needs. A command needs validation, business rules and a transaction. A query needs a fast projection, often straight from the database into a response record, with no domain object at all.

Not everything goes in slices. A small **shared kernel** holds things that are truly common: the database context or store, the domain entities that several slices change, a `Result` type, authentication setup. The test for "shared or not" is simple: *would a change to this code be correct for every slice that uses it?* If yes, share it. If it would only be correct for some, copy it or keep it in the slice.

### Coupling within a slice, not across slices

In a layered app, coupling runs **horizontally**: all controllers depend on all services through shared interfaces. In VSA, coupling runs **vertically**: the parts of one slice are tightly coupled to each other, on purpose, and loosely coupled to other slices. Slices should not call each other's handlers. If "approve return" needs to notify the customer, it raises an event or calls a shared service, rather than calling the "send notification" slice's handler directly.

### What happens without it

Nothing breaks on day one. The cost shows up as the app grows. In a layered codebase with 60 use cases, adding use case 61 still touches 5 folders, and the shared service now has 60 methods. Code reviews get harder because each pull request is spread across the tree. New team members ask "where does the approval logic live?" and the answer is "partly in four places".

### When it is useful

- Business applications with **many use cases** that are mostly independent: forms, approvals, reports, dashboards.
- Teams where **different people own different features**.
- Apps where reads and writes have very different shapes (heavy reporting plus simple writes).
- A [modular monolith](#/lesson/m02-modular-monolith): slices live inside each module.

### When it is unnecessary

- A **small CRUD app** with 8 endpoints that map directly to 3 tables. Layers or even a single `Program.cs` are clearer.
- A **library or engine** whose core is one algorithm (a pricing engine, a scheduler). That code is organised around the algorithm, not around HTTP requests.
- Teams that don't yet agree on what a "feature" is. Slices need a shared understanding of use-case boundaries, or you get 200 tiny folders with copied code.

### Trade-offs it introduces

| You gain | You pay |
|---|---|
| One change, one folder | Some duplication between slices (two slices may map the same entity slightly differently) |
| No giant shared service | You must actively decide what goes into the shared kernel, or it becomes a dumping ground |
| Each slice can pick the simplest approach | Inconsistency risk: slice A uses a domain model, slice B writes raw SQL, and new people find it confusing |
| Easy to delete a feature (delete the folder) | Cross-cutting concerns need a deliberate mechanism (decorators, endpoint filters) |
| Tests per use case | Business rules shared by several slices must live in the domain model, or they get copied and drift |

The last row matters most. Vertical slices do **not** mean "no domain model". If the rule "a return can only be approved once" is checked in two slices, put it on the `ReturnRequest` entity so there is one place to change it.

## Visual explanation

### Layers versus slices

```mermaid
flowchart TB
    subgraph Layered["Organised by layer"]
        direction TB
        C1["Controllers: ReturnsController"] --> S1["Services: ReturnService (40 methods)"]
        S1 --> R1["Repositories: ReturnRepository"]
        R1 --> D1[("Database")]
    end
    subgraph Sliced["Organised by feature"]
        direction TB
        F1["SubmitReturn: endpoint, validator, handler"] --> D2[("Database")]
        F2["ApproveReturn: endpoint, handler"] --> D2
        F3["GetOpenReturns: endpoint, query"] --> D2
        F1 -.-> K["Shared kernel: ReturnRequest entity, store, Result"]
        F2 -.-> K
        F3 -.-> K
    end
```

How to read it: on the left, every request passes through the same three horizontal boxes. The middle box, `ReturnService`, is shared by every use case, so it grows with each new feature. On the right, each feature is its own box that goes straight to the database. The dotted arrows show that slices depend on a small shared kernel, but there are **no arrows between slices**. Adding a fourth feature means adding a fourth box, without editing the other three.

### One request through a slice

```mermaid
sequenceDiagram
    participant E as Customer app
    participant EP as POST /returns endpoint
    participant V as SubmitReturnValidator
    participant H as SubmitReturnHandler
    participant S as IReturnStore
    E->>EP: JSON body with city, order number, reason, pickup date
    EP->>H: HandleAsync(command)
    H->>V: Validate(command, today)
    V-->>H: no errors
    H->>S: AddAsync(new ReturnRequest)
    S-->>H: saved
    H-->>EP: Ok with id and status
    EP-->>E: 201 Created with Location header
```

This is the full path for "request a return". The endpoint does only HTTP work: it binds the JSON body, adds the signed-in customer's id to build a command, and turns the handler's result into a status code. The handler owns the use case: it asks the validator, builds the entity and saves it. If validation fails, the handler returns the errors and the endpoint replies `400` with a problem-details body. Notice that nothing here mentions approvals or reports. Those live in other slices.

## Step-by-step example

The scenario: an online marketplace (think of a store like Flipkart or Amazon) lets customers **request a return**. A customer in Bengaluru says "the shoes on order ORD-10000400 are the wrong size, please pick them up by Friday". A seller-support agent approves or rejects the request. The city operations manager wants a list of open requests whose pickup date has already passed, because every overdue return is an unhappy customer and, often, a support call.

### Step 1 — the layered starting point

```csharp
// Controllers/ReturnsController.cs
[HttpPost] public async Task<IActionResult> Submit(SubmitDto dto) => Ok(await _service.SubmitAsync(dto));
[HttpPost("{id}/approve")] public async Task<IActionResult> Approve(Guid id, ApproveDto dto) => ...;
[HttpGet("open")] public async Task<IActionResult> Open(string city) => ...;

// Services/ReturnService.cs — shared by all three, plus 20 more methods later
public async Task<Guid> SubmitAsync(SubmitDto dto) { Validate(dto); var e = _mapper.Map(dto); await _repo.AddAsync(e); return e.Id; }
public async Task ApproveAsync(Guid id, ApproveDto dto) { ... }
public async Task<List<OpenDto>> GetOpenAsync(string city) { var all = await _repo.GetAllAsync(); ... }
```

Three features, one service, one repository. `GetOpenAsync` loads **every** return request and filters in memory, because the repository only offers `GetAllAsync`. Adding a better query means adding a repository method that only one service method uses.

### Step 2 — draw the use cases

List what users actually do. Here it is three: submit, approve, list open. Each becomes a folder under `Features/Returns/`.

### Step 3 — move each method into its slice

For each service method, create a request record, a handler and an endpoint mapping. The validation logic used only by "submit" moves into the submit slice. The query for "open returns" moves into its slice and filters at the source.

### Step 4 — keep the shared rules in the entity

"Only a submitted return can be approved" is a business rule about the `ReturnRequest` itself. It goes on the entity as `Approve(...)`, so a future "bulk approve" slice gets the same rule for free.

### Step 5 — delete the service

Once all three methods have moved, `ReturnService` and its interface are empty. Delete them. That deletion is the moment you know the refactor worked.

## Production-style C# implementation

Project structure:

```text
ShopEase.Api/
  Program.cs
  Shared/
    ReturnRequest.cs     (entity, shared by slices that change it)
    ReturnStore.cs       (storage abstraction and in-memory implementation)
    HandlerResult.cs
  Features/
    Returns/
      SubmitReturn.cs    (command, validator, handler, endpoint)
      ApproveReturn.cs
      GetOpenReturns.cs  (query, handler, endpoint)
ShopEase.Tests/
  Features/Returns/SubmitReturnTests.cs
  Features/Returns/ApproveReturnTests.cs
  ArchitectureTests.cs
```

One file per slice is a common convention for small slices. When a slice grows past roughly 150–200 lines, give it a folder with one file per part. That threshold is a team habit, not a rule.

In production the store would be EF Core over PostgreSQL. Here it is an in-memory implementation behind an interface, so the code compiles and runs with no database. In PostgreSQL you would also add a partial unique index, `CREATE UNIQUE INDEX ux_open_return ON return_requests (order_number) WHERE status = 'Submitted';`, so a customer who double-taps "Request return" gets one open request, not two. Rules that must hold under concurrency belong in the database, not only in a handler's `if`.

```csharp file=Shared/ReturnRequest.cs
namespace ShopEase.Shared;

public enum ReturnStatus { Submitted, Approved, Rejected }

/// <summary>A customer's request to return an item from a delivered order.</summary>
public sealed class ReturnRequest
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string CityCode { get; init; }       // e.g. "BLR", used to route pickups to a city hub
    public required string OrderNumber { get; init; }    // e.g. "ORD-10000400"
    public required string Reason { get; init; }         // e.g. "Wrong size: ordered UK 9, received UK 7"
    public required string RequestedBy { get; init; }    // customer id, taken from the signed-in user
    public DateTimeOffset RequestedAt { get; init; }
    public DateOnly PickupBy { get; init; }              // pickup date the customer chose
    public ReturnStatus Status { get; private set; } = ReturnStatus.Submitted;
    public string? ReviewedBy { get; private set; }
    public string? Remarks { get; private set; }

    /// <summary>Shared business rule: only a submitted request can be approved, and only once.</summary>
    public void Approve(string agent, string? remarks)
    {
        if (Status != ReturnStatus.Submitted)
            throw new InvalidOperationException($"Return request {Id} is already {Status}.");
        if (string.IsNullOrWhiteSpace(agent))
            throw new ArgumentException("Reviewer is required.", nameof(agent));
        Status = ReturnStatus.Approved;
        ReviewedBy = agent;
        Remarks = remarks;
    }
}
```

```csharp file=Shared/ReturnStore.cs
using System.Collections.Concurrent;

namespace ShopEase.Shared;

public interface IReturnStore
{
    Task AddAsync(ReturnRequest request, CancellationToken ct);
    Task<ReturnRequest?> FindAsync(Guid id, CancellationToken ct);
    /// <summary>Read-side access. With EF Core this would be an IQueryable with AsNoTracking.</summary>
    IEnumerable<ReturnRequest> Query();
    Task SaveChangesAsync(CancellationToken ct);
}

public sealed class InMemoryReturnStore : IReturnStore
{
    private readonly ConcurrentDictionary<Guid, ReturnRequest> _items = new();

    public Task AddAsync(ReturnRequest request, CancellationToken ct)
    {
        if (!_items.TryAdd(request.Id, request))
            throw new InvalidOperationException($"Duplicate return request id {request.Id}.");
        return Task.CompletedTask;
    }

    public Task<ReturnRequest?> FindAsync(Guid id, CancellationToken ct) =>
        Task.FromResult(_items.TryGetValue(id, out var r) ? r : null);

    public IEnumerable<ReturnRequest> Query() => _items.Values;

    public Task SaveChangesAsync(CancellationToken ct) => Task.CompletedTask;
}
```

```csharp file=Shared/HandlerResult.cs
namespace ShopEase.Shared;

/// <summary>What a command handler returns: a value, validation errors, or a named failure.</summary>
public sealed record HandlerResult<T>(T? Value, IDictionary<string, string[]>? Errors, string? Failure)
{
    public static HandlerResult<T> Ok(T value) => new(value, null, null);
    public static HandlerResult<T> Invalid(IDictionary<string, string[]> errors) => new(default, errors, null);
    public static HandlerResult<T> Fail(string failure) => new(default, null, failure);
    public bool IsSuccess => Errors is null && Failure is null;
}
```

Now the three slices. Each file holds every part of one use case, in reading order: request, validator, handler, endpoint.

Notice who fills in `RequestedBy` and the approving agent: the **endpoint**, from the signed-in user (`ClaimsPrincipal`), never the JSON body. If the body could name the customer or the agent, anyone could request returns on someone else's orders or approve as someone else. The HTTP body carries only what the user is allowed to choose.

```csharp file=Features/Returns/SubmitReturn.cs
using System.Security.Claims;
using System.Text.RegularExpressions;
using ShopEase.Shared;

namespace ShopEase.Features.Returns.Submit;

/// <summary>What the customer sends over HTTP.</summary>
public sealed record SubmitReturnRequest(string CityCode, string OrderNumber, string Reason, DateOnly PickupBy);

/// <summary>What the handler runs: the request plus who is asking.</summary>
public sealed record SubmitReturnCommand(string CityCode, string OrderNumber, string Reason, string RequestedBy, DateOnly PickupBy);
public sealed record SubmitReturnResponse(Guid Id, string Status);

public static partial class SubmitReturnValidator
{
    [GeneratedRegex(@"^ORD-[0-9]{8}$")]
    private static partial Regex OrderNumberPattern();

    public static Dictionary<string, string[]> Validate(SubmitReturnCommand c, DateOnly today)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(c.CityCode)) errors["CityCode"] = ["City code is required."];
        if (string.IsNullOrWhiteSpace(c.OrderNumber) || !OrderNumberPattern().IsMatch(c.OrderNumber))
            errors["OrderNumber"] = ["Order number must look like ORD-10000400."];
        if (string.IsNullOrWhiteSpace(c.Reason) || c.Reason.Length > 200)
            errors["Reason"] = ["Reason is required and must be at most 200 characters."];
        if (string.IsNullOrWhiteSpace(c.RequestedBy)) errors["RequestedBy"] = ["Customer is required."];
        if (c.PickupBy < today) errors["PickupBy"] = ["Pickup date cannot be in the past."];
        return errors;
    }
}

public sealed class SubmitReturnHandler(IReturnStore store, TimeProvider clock)
{
    public async Task<HandlerResult<SubmitReturnResponse>> HandleAsync(SubmitReturnCommand cmd, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var errors = SubmitReturnValidator.Validate(cmd, DateOnly.FromDateTime(now.UtcDateTime));
        if (errors.Count > 0) return HandlerResult<SubmitReturnResponse>.Invalid(errors);

        var request = new ReturnRequest
        {
            CityCode = cmd.CityCode.Trim().ToUpperInvariant(),
            OrderNumber = cmd.OrderNumber,
            Reason = cmd.Reason.Trim(),
            RequestedBy = cmd.RequestedBy,
            RequestedAt = now,
            PickupBy = cmd.PickupBy,
        };
        await store.AddAsync(request, ct);
        await store.SaveChangesAsync(ct);
        return HandlerResult<SubmitReturnResponse>.Ok(new(request.Id, request.Status.ToString()));
    }
}

public static class SubmitReturnEndpoint
{
    public static RouteGroupBuilder MapSubmitReturn(this RouteGroupBuilder group)
    {
        group.MapPost("/", async (SubmitReturnRequest body, ClaimsPrincipal user, SubmitReturnHandler handler, CancellationToken ct) =>
        {
            var customerId = user.Identity?.Name;
            if (string.IsNullOrEmpty(customerId)) return Results.Unauthorized();

            var cmd = new SubmitReturnCommand(body.CityCode, body.OrderNumber, body.Reason, customerId, body.PickupBy);
            var result = await handler.HandleAsync(cmd, ct);
            return result.IsSuccess
                ? Results.Created($"/returns/{result.Value!.Id}", result.Value)
                : Results.ValidationProblem(result.Errors!);
        });
        return group;
    }
}
```

```csharp file=Features/Returns/ApproveReturn.cs
using System.Security.Claims;
using ShopEase.Shared;

namespace ShopEase.Features.Returns.Approve;

public sealed record ApproveReturnRequest(string? Remarks);

public sealed class ApproveReturnHandler(IReturnStore store, ILogger<ApproveReturnHandler> logger)
{
    public const string NotFound = "not-found";
    public const string AlreadyReviewed = "already-reviewed";

    public async Task<HandlerResult<string>> HandleAsync(Guid id, string agent, string? remarks, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(agent))
            return HandlerResult<string>.Invalid(new Dictionary<string, string[]> { ["Agent"] = ["Agent is required."] });

        var request = await store.FindAsync(id, ct);
        if (request is null) return HandlerResult<string>.Fail(NotFound);
        if (request.Status != ReturnStatus.Submitted) return HandlerResult<string>.Fail(AlreadyReviewed);

        request.Approve(agent, remarks);   // the rule itself lives on the entity
        await store.SaveChangesAsync(ct);
        logger.LogInformation("Return {Id} for {OrderNumber} approved by {Agent}", id, request.OrderNumber, agent);
        return HandlerResult<string>.Ok(request.Status.ToString());
    }
}

public static class ApproveReturnEndpoint
{
    public static RouteGroupBuilder MapApproveReturn(this RouteGroupBuilder group)
    {
        group.MapPost("/{id:guid}/approve", async (Guid id, ApproveReturnRequest body, ClaimsPrincipal user,
                                                   ApproveReturnHandler handler, CancellationToken ct) =>
        {
            var r = await handler.HandleAsync(id, user.Identity?.Name ?? "", body.Remarks, ct);
            if (r.IsSuccess) return Results.Ok(new { id, status = r.Value });
            if (r.Errors is not null) return Results.ValidationProblem(r.Errors);
            return r.Failure == ApproveReturnHandler.NotFound
                ? Results.NotFound()
                : Results.Problem("Return request has already been reviewed.", statusCode: StatusCodes.Status409Conflict);
        });
        return group;
    }
}
```

The status check in the handler protects against a second click, but not against two agents clicking "approve" at the same instant: both could load the row while it is still `Submitted`. In production, give the entity a concurrency token (with EF Core on PostgreSQL, map the system column `xmin` as a row version). The second `SaveChangesAsync` then throws `DbUpdateConcurrencyException`, which the endpoint turns into the same `409`.

```csharp file=Features/Returns/GetOpenReturns.cs
using ShopEase.Shared;

namespace ShopEase.Features.Returns.GetOpen;

public sealed record OpenReturnItem(Guid Id, string OrderNumber, string Reason, DateOnly PickupBy, int DaysOverdue);

/// <summary>A read-only slice: no entity behaviour, just a projection straight into the response shape.</summary>
public sealed class GetOpenReturnsHandler(IReturnStore store, TimeProvider clock)
{
    public IReadOnlyList<OpenReturnItem> Handle(string cityCode)
    {
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
        return store.Query()
            .Where(r => r.Status == ReturnStatus.Submitted
                     && string.Equals(r.CityCode, cityCode, StringComparison.OrdinalIgnoreCase))
            .Select(r => new OpenReturnItem(r.Id, r.OrderNumber, r.Reason, r.PickupBy,
                         Math.Max(0, today.DayNumber - r.PickupBy.DayNumber)))
            .OrderByDescending(x => x.DaysOverdue)
            .ThenBy(x => x.PickupBy)
            .ToList();
    }
}

public static class GetOpenReturnsEndpoint
{
    public static RouteGroupBuilder MapGetOpenReturns(this RouteGroupBuilder group)
    {
        group.MapGet("/open", (string city, GetOpenReturnsHandler handler) =>
            string.IsNullOrWhiteSpace(city)
                ? Results.Problem("Query parameter 'city' is required.", statusCode: StatusCodes.Status400BadRequest)
                : Results.Ok(handler.Handle(city)));
        return group;
    }
}
```

Finally, wiring. Each slice registers its handler and maps its endpoint. Some teams auto-discover slices with reflection. With only a handful of slices, explicit lines are easier to read and search.

```csharp file=Program.cs
using ShopEase.Features.Returns.Approve;
using ShopEase.Features.Returns.GetOpen;
using ShopEase.Features.Returns.Submit;
using ShopEase.Shared;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IReturnStore, InMemoryReturnStore>();   // EF Core DbContext (scoped) in production

// One line per slice. Handlers are scoped, matching the lifetime a DbContext would have.
builder.Services.AddScoped<SubmitReturnHandler>();
builder.Services.AddScoped<ApproveReturnHandler>();
builder.Services.AddScoped<GetOpenReturnsHandler>();

// A real app adds authentication here, e.g. AddAuthentication().AddJwtBearer(...),
// plus AddAuthorization() and RequireAuthorization() on the group (agents-only policy on /approve).
// They are left out so this sample compiles without extra packages.

var app = builder.Build();

var returns = app.MapGroup("/returns").WithTags("Returns");
returns.MapSubmitReturn()
       .MapApproveReturn()
       .MapGetOpenReturns();

app.Run();
```

**Why no mediator library?** Many VSA examples use MediatR, which sends a request object to its handler through a mediator. It adds pipeline behaviours (one place for logging and validation) and removes the need to inject handlers by type. It also adds a layer of indirection: "go to definition" on `Send(command)` doesn't take you to the handler. With minimal APIs, injecting the handler directly into the endpoint is often enough. Choose a mediator when you have dozens of slices and want a uniform pipeline. Note that MediatR moved to a commercial licence for some uses in 2025, so check its current terms before adopting it.

### Cross-cutting concerns without a mediator

Two built-in options keep validation and logging out of each handler:

- **Endpoint filters** (`IEndpointFilter`) run around a minimal API handler. You can add one to the whole `/returns` group with `group.AddEndpointFilter<...>()`.
- **Decorators**: wrap a generic `IHandler<TRequest, TResponse>` in a `ValidationDecorator` or `LoggingDecorator`. Exercise 4 builds one.

## Bad design vs good design

**Bad: slices that call each other.**

```csharp
public sealed class ApproveReturnHandler(SubmitReturnHandler submit, GetOpenReturnsHandler open)
{
    public async Task Handle(Guid id)
    {
        var stillOpen = open.Handle("BLR").Any(x => x.Id == id);   // reusing another slice's query
        // ...
    }
}
```

Problems:

- Approve now breaks when someone changes the "open returns" response for the dashboard, for example by adding paging.
- The coupling is hidden: nothing in the folder structure tells you the slices depend on each other.
- Each slice was meant to be deletable. Now neither can be deleted alone.

**Bad: the shared kernel as a dumping ground.** A `Shared/Helpers.cs` file with 30 static methods, each used by one slice "in case someone needs it later". That is the old god service under a new name.

**Good:** each slice reads what it needs from the store itself. Rules that several slices rely on live on the entity (`ReturnRequest.Approve`). The shared folder holds only the entity, the store and the result type. If two slices need the same complex query, extract it into a named query object in the shared kernel, and only once the second slice actually exists.

**Is the improvement always worth it?** No. For a 6-endpoint internal tool with one developer, a single controller and a `DbContext` are simpler. Slices pay off when the number of use cases and people grows. A useful heuristic: once a shared service passes about 10 public methods, or more than two people regularly edit it in the same week, consider slicing.

:::callout type=tradeoff title="Duplication is cheaper than the wrong abstraction"
Two slices that map a `ReturnRequest` to slightly different response records will look like duplication. Leave it. They serve different screens and will change for different reasons. Merge code only when the two copies must change together for the same reason.
:::

:::callout type=mistake title="Slices are not microservices"
A slice is a folder in one deployable app, sharing one database. Don't give each slice its own database or deploy it separately. That brings all the costs of [microservices](#/lesson/m02-microservices) with none of the planning.
:::

## Practical playground

Open the starter below. It has a tiny in-memory slice for requesting returns and one for listing open ones. Run it, then add a third slice, "reject a return with a reason", without editing the other two classes.

:::playground type=csharp title="Add a slice without touching the others"
```csharp file=Program.cs
using System;
using System.Collections.Generic;
using System.Linq;

public enum Status { Submitted, Approved, Rejected }

public sealed class ReturnRequest
{
    public Guid Id { get; } = Guid.NewGuid();
    public required string OrderNumber { get; init; }
    public required string Reason { get; init; }
    public Status Status { get; set; } = Status.Submitted;
    public string? RejectionNote { get; set; }
}

public sealed class Store { public List<ReturnRequest> Items { get; } = new(); }

// Slice 1: submit
public sealed record SubmitReturn(string OrderNumber, string Reason);
public sealed class SubmitReturnHandler(Store store)
{
    public Guid Handle(SubmitReturn cmd)
    {
        var ret = new ReturnRequest { OrderNumber = cmd.OrderNumber, Reason = cmd.Reason };
        store.Items.Add(ret);
        return ret.Id;
    }
}

// Slice 2: list open
public sealed record OpenReturn(string OrderNumber, string Reason);
public sealed class ListOpenReturnsHandler(Store store)
{
    public IReadOnlyList<OpenReturn> Handle() =>
        store.Items.Where(r => r.Status == Status.Submitted).Select(r => new OpenReturn(r.OrderNumber, r.Reason)).ToList();
}

// TODO Slice 3: RejectReturn(Guid Id, string Note) with a RejectReturnHandler.
// Rules: the note is required, and only a Submitted return can be rejected (it sets RejectionNote).

public static class Program
{
    public static void Main()
    {
        var store = new Store();
        var submit = new SubmitReturnHandler(store);
        var a = submit.Handle(new SubmitReturn("ORD-10000400", "Wrong size: received UK 7"));
        var b = submit.Handle(new SubmitReturn("ORD-10000600", "Screen cracked on arrival"));
        Console.WriteLine($"Submitted {a} and {b}");
        foreach (var r in new ListOpenReturnsHandler(store).Handle())
            Console.WriteLine($"Open: {r.OrderNumber} {r.Reason}");
    }
}
```
:::

## Exercises

:::exercise id=m02-vertical-slice-ex1 difficulty=beginner kind=code title="Write the overdue-returns query slice"
The Bengaluru operations manager wants a list of overdue return requests for one city. Implement `GetOverdueReturnsHandler.Handle`.
::requirements
- Include only return requests with status `Submitted` for the requested city (case-insensitive city code).
- A request is overdue when its `PickupBy` date is **before** today. A pickup due today is not overdue yet.
- `DaysOverdue` = whole days between `PickupBy` and today.
- Sort by `DaysOverdue` descending, then by `OrderNumber` ascending (ordinal).
::acceptance
- Due 3 days ago appears with `DaysOverdue = 3`.
- Approved requests and other cities are excluded.
- A request with pickup due today does not appear.
- Ties on days are ordered by order number.
::hint
This is a query slice. You don't need any domain behaviour, only filter, project and sort.
::hint
`DateOnly.DayNumber` gives an integer day count, so subtraction gives whole days.
::hint
Chain `Where` (status, city, `PickupBy < today`) then `Select` into `OverdueItem`, then `OrderByDescending(...).ThenBy(..., StringComparer.Ordinal)`.
::hint
```csharp
.Where(r => r.Status == ReturnStatus.Submitted && string.Equals(r.CityCode, q.CityCode, StringComparison.OrdinalIgnoreCase) && r.PickupBy < q.Today)
```
::starter
```csharp file=GetOverdueReturns.cs
using System;
using System.Collections.Generic;
using System.Linq;

public enum ReturnStatus { Submitted, Approved, Rejected }

public sealed record ReturnRow(Guid Id, string CityCode, string OrderNumber, DateOnly PickupBy, ReturnStatus Status);

public sealed record GetOverdueReturnsQuery(string CityCode, DateOnly Today);
public sealed record OverdueItem(Guid Id, string OrderNumber, DateOnly PickupBy, int DaysOverdue);

public sealed class GetOverdueReturnsHandler(IEnumerable<ReturnRow> rows)
{
    public IReadOnlyList<OverdueItem> Handle(GetOverdueReturnsQuery q) => throw new NotImplementedException();
}
```
::tests
```csharp file=GetOverdueReturnsTests.cs
using System;
using System.Linq;
using Xunit;

public class GetOverdueReturnsTests
{
    private static readonly DateOnly Today = new(2026, 10, 20);
    private static ReturnRow Row(string city, string order, int dueOffsetDays, ReturnStatus s = ReturnStatus.Submitted) =>
        new(Guid.NewGuid(), city, order, Today.AddDays(dueOffsetDays), s);

    [Fact]
    public void Returns_days_overdue()
    {
        var h = new GetOverdueReturnsHandler(new[] { Row("BLR", "ORD-10000400", -3) });
        var item = Assert.Single(h.Handle(new GetOverdueReturnsQuery("BLR", Today)));
        Assert.Equal(3, item.DaysOverdue);
    }

    [Fact]
    public void Excludes_approved_other_cities_and_due_today()
    {
        var h = new GetOverdueReturnsHandler(new[]
        {
            Row("BLR", "ORD-00000001", -2, ReturnStatus.Approved),
            Row("HYD", "ORD-00000002", -5),
            Row("BLR", "ORD-00000003", 0),
            Row("blr", "ORD-00000004", -1),
        });
        var result = h.Handle(new GetOverdueReturnsQuery("BLR", Today));
        Assert.Equal("ORD-00000004", Assert.Single(result).OrderNumber);
    }

    [Fact]
    public void Sorted_by_days_desc_then_order_number()
    {
        var h = new GetOverdueReturnsHandler(new[]
        {
            Row("BLR", "ORD-10000600", -2), Row("BLR", "ORD-10000400", -2), Row("BLR", "ORD-09000000", -7),
        });
        var orders = h.Handle(new GetOverdueReturnsQuery("BLR", Today)).Select(x => x.OrderNumber).ToArray();
        Assert.Equal(new[] { "ORD-09000000", "ORD-10000400", "ORD-10000600" }, orders);
    }
}
```
::solution
Filter at the source, project straight into the response record, then sort. No entity methods, no service class.

```csharp file=GetOverdueReturns.cs
using System;
using System.Collections.Generic;
using System.Linq;

public enum ReturnStatus { Submitted, Approved, Rejected }

public sealed record ReturnRow(Guid Id, string CityCode, string OrderNumber, DateOnly PickupBy, ReturnStatus Status);

public sealed record GetOverdueReturnsQuery(string CityCode, DateOnly Today);
public sealed record OverdueItem(Guid Id, string OrderNumber, DateOnly PickupBy, int DaysOverdue);

public sealed class GetOverdueReturnsHandler(IEnumerable<ReturnRow> rows)
{
    public IReadOnlyList<OverdueItem> Handle(GetOverdueReturnsQuery q) =>
        rows.Where(r => r.Status == ReturnStatus.Submitted
                     && string.Equals(r.CityCode, q.CityCode, StringComparison.OrdinalIgnoreCase)
                     && r.PickupBy < q.Today)
            .Select(r => new OverdueItem(r.Id, r.OrderNumber, r.PickupBy, q.Today.DayNumber - r.PickupBy.DayNumber))
            .OrderByDescending(x => x.DaysOverdue)
            .ThenBy(x => x.OrderNumber, StringComparer.Ordinal)
            .ToList();
}
```

With EF Core, the same `Where`/`Select` runs as SQL, so only the overdue rows leave the database. That is the key benefit of a query slice over a shared `GetAllAsync` repository method.
::mistakes
- Using `<=` and counting "due today" as overdue.
- Comparing city codes with `==`, which fails for `blr` vs `BLR`.
- Sorting order numbers with the default culture-aware comparer. Ordinal comparison is predictable, and because order numbers have a fixed width (`ORD-` plus 8 digits) ordinal order is also numeric order.
- Computing `today` from the server's UTC date. Between midnight and 05:30 IST, UTC is still on the previous day, so a Bengaluru pickup looks one day less overdue. Pass the city's local date in, as the query does here.
::extensions
Add paging with `skip` and `take`, and a `minDaysOverdue` filter so the dashboard can show only requests more than 2 days late. In PostgreSQL, back the query with an index on `(city_code, pickup_by) WHERE status = 'Submitted'`.
:::

:::exercise id=m02-vertical-slice-ex2 difficulty=beginner kind=code title="Validate the submit command"
Implement `SubmitReturnValidator.Validate`. It returns a dictionary of field name to error messages, in the format `Results.ValidationProblem` expects. An empty dictionary means valid.
::requirements
- `CityCode` is required.
- `OrderNumber` must be `ORD-` followed by exactly 8 digits, such as `ORD-10000400` or `ORD-00000042`.
- `Reason` is required and at most 200 characters.
- `PickupBy` must not be before `today`.
::acceptance
- A valid command returns an empty dictionary.
- `10000400`, `ORD-1000040`, `ORD-` and `ord-10000400` all fail with key `OrderNumber`.
- Several problems produce several keys at once, not just the first one.
::hint
Collect all errors. Don't return early on the first one, because the user wants to fix every field in one go.
::hint
A regular expression is the simplest check for an order number: start, the literal `ORD-`, eight digits, end.
::hint
The pattern is `^ORD-[0-9]{8}$`. Prefer `[0-9]` over `\d`: in .NET, `\d` also matches other Unicode digits such as Devanagari `४`.
::hint
```csharp
var errors = new Dictionary<string, string[]>();
if (string.IsNullOrWhiteSpace(c.CityCode)) errors["CityCode"] = new[] { "Required." };
```
::starter
```csharp file=SubmitReturnValidator.cs
using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

public sealed record SubmitReturnCommand(string CityCode, string OrderNumber, string Reason, DateOnly PickupBy);

public static class SubmitReturnValidator
{
    public static Dictionary<string, string[]> Validate(SubmitReturnCommand c, DateOnly today) => throw new NotImplementedException();
}
```
::tests
```csharp file=SubmitReturnValidatorTests.cs
using System;
using Xunit;

public class SubmitReturnValidatorTests
{
    private static readonly DateOnly Today = new(2026, 10, 20);
    private static SubmitReturnCommand Valid() => new("BLR", "ORD-10000400", "Wrong size: received UK 7", Today);

    [Fact] public void Valid_command_has_no_errors() => Assert.Empty(SubmitReturnValidator.Validate(Valid(), Today));

    [Theory]
    [InlineData("10000400")]
    [InlineData("ORD-1000040")]
    [InlineData("ORD-")]
    [InlineData("ord-10000400")]
    [InlineData("ORD-100004001")]
    [InlineData("ORD-1000040٤")]
    public void Bad_order_number(string order) =>
        Assert.True(SubmitReturnValidator.Validate(Valid() with { OrderNumber = order }, Today).ContainsKey("OrderNumber"));

    [Fact] public void Leading_zeros_are_valid() =>
        Assert.Empty(SubmitReturnValidator.Validate(Valid() with { OrderNumber = "ORD-00000042" }, Today));

    [Fact]
    public void Reports_all_errors_at_once()
    {
        var e = SubmitReturnValidator.Validate(new SubmitReturnCommand("", "bad", new string('x', 201), Today.AddDays(-1)), Today);
        Assert.Equal(4, e.Count);
        Assert.True(e.ContainsKey("CityCode") && e.ContainsKey("OrderNumber") && e.ContainsKey("Reason") && e.ContainsKey("PickupBy"));
    }
}
```
::solution
```csharp file=SubmitReturnValidator.cs
using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

public sealed record SubmitReturnCommand(string CityCode, string OrderNumber, string Reason, DateOnly PickupBy);

public static class SubmitReturnValidator
{
    private static readonly Regex OrderNumber = new(@"^ORD-[0-9]{8}$", RegexOptions.Compiled);

    public static Dictionary<string, string[]> Validate(SubmitReturnCommand c, DateOnly today)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(c.CityCode)) errors["CityCode"] = new[] { "City code is required." };
        if (string.IsNullOrWhiteSpace(c.OrderNumber) || !OrderNumber.IsMatch(c.OrderNumber))
            errors["OrderNumber"] = new[] { "Order number must look like ORD-10000400." };
        if (string.IsNullOrWhiteSpace(c.Reason) || c.Reason.Length > 200)
            errors["Reason"] = new[] { "Reason is required and must be at most 200 characters." };
        if (c.PickupBy < today) errors["PickupBy"] = new[] { "Pickup date cannot be in the past." };
        return errors;
    }
}
```

The validator sits in the submit slice because only submit uses these rules. If a "cancel order" or "track order" slice later needs the same order-number rule, move just that rule into a shared `OrderNumber` value object, which is a better home than a shared validator.
::mistakes
- Returning after the first error.
- Forgetting the `^` and `$` anchors, so `xORD-10000400y` passes.
- Using `\d`, which accepts non-ASCII digits such as Arabic-Indic `٤` (the last test case).
- Using `DateTime.Now` inside the validator instead of passing `today`, which makes tests depend on the clock.
:::

:::exercise id=m02-vertical-slice-ex3 difficulty=intermediate kind=design title="Re-slice a layered seller-payout module"
The same marketplace pays its sellers every week. Each payout is created from the week's delivered orders minus commissions, returns and fees, submitted for review, and then approved or rejected by the finance team. The seller-payout module is organised like this:

```text
Controllers/PayoutsController.cs        (Create, Submit, Approve, Reject, GetById, ListPending, ExportPdf)
Services/IPayoutService.cs, PayoutService.cs   (14 public methods, 9 constructor dependencies)
Repositories/IPayoutRepository.cs, PayoutRepository.cs
Dtos/ (11 DTO classes)
Mappers/PayoutMapper.cs
Validators/PayoutValidator.cs  (one class with rules for create, submit and approve mixed together)
```

Propose a vertical-slice structure. Show the folder tree, say what goes into the shared kernel and why, and explain where the rule "a payout can only be approved after it was submitted, and the approved amount cannot exceed the requested amount" lives.
::acceptance
- One slice per use case, with names that are verbs (`ApprovePayout`, not `PayoutApproval`).
- The shared kernel is small and each item in it has a reason.
- The approval rule lives in exactly one place that every slice which changes a payout goes through.
- PDF export is treated as a query slice, and you note any extra dependency it alone needs.
::hint
Start by listing the seven controller actions. Each is a candidate slice.
::hint
Which of the 9 dependencies does each slice actually need? A PDF renderer is only needed by export.
::hint
Rules about a payout's lifecycle belong on the `Payout` entity, not in a slice and not in a shared validator.
::hint
Shape: `Features/Payouts/{CreatePayout, SubmitPayout, ApprovePayout, RejectPayout, GetPayout, ListPendingPayouts, ExportPayoutPdf}` plus `Shared/{Payout.cs, PayoutStatus.cs, PayoutsDbContext.cs, Money.cs}`.
::solution
```text
Payouts/
  Shared/
    Payout.cs            entity with Submit(), Approve(amount, by), Reject(reason)
    PayoutStatus.cs
    Money.cs             value object, rounding rules for INR (paise)
    PayoutsDbContext.cs
  Features/Payouts/
    CreatePayout.cs        command + validator + handler + endpoint
    SubmitPayout.cs
    ApprovePayout.cs
    RejectPayout.cs
    GetPayout.cs           query, projects to PayoutDetails
    ListPendingPayouts.cs  query, paged, AsNoTracking
    ExportPayoutPdf/       folder, because it has a template file and an IPdfRenderer dependency
      ExportPayoutPdf.cs
      PayoutStatementTemplate.cshtml
```

```mermaid
classDiagram
    class Payout {
        +PayoutStatus Status
        +decimal RequestedAmount
        +decimal ApprovedAmount
        +Submit()
        +Approve(decimal amount, string by)
        +Reject(string reason)
    }
    class ApprovePayoutHandler {
        +HandleAsync(ApprovePayoutCommand cmd) Task
    }
    class SubmitPayoutHandler {
        +HandleAsync(SubmitPayoutCommand cmd) Task
    }
    class ExportPayoutPdfHandler {
        +HandleAsync(Guid id) Task
    }
    class IPdfRenderer {
        <<interface>>
    }
    ApprovePayoutHandler --> Payout : calls Approve
    SubmitPayoutHandler --> Payout : calls Submit
    ExportPayoutPdfHandler --> IPdfRenderer
```

The diagram shows the key idea: the two command handlers only call methods on `Payout`, so the lifecycle rules live in the entity, while the export handler is the only class that knows about `IPdfRenderer`.

**Shared kernel reasons.** `Payout` is changed by four slices, so its invariants must be in one place. `Money` exists because rounding rules for INR must be identical everywhere: a payout of ₹48,312.675 must round the same way on screen, in the PDF and in the bank file. The `DbContext` is infrastructure that every slice uses.

**The approval rule** lives in `Payout.Approve`: it throws (or returns a failure) if `Status != Submitted` or `amount > RequestedAmount`. `ApprovePayoutHandler` only loads the payout, calls `Approve`, and saves. Because approving money is sensitive, the handler should also record who approved it (from the signed-in user) and rely on a concurrency token so two finance users cannot approve the same payout twice.

**What disappears:** `PayoutService`, `IPayoutService`, `IPayoutRepository` and `PayoutMapper`. Each slice maps its own response. The 9-dependency constructor becomes 1–2 dependencies per handler. `IPdfRenderer` is now injected only into the export slice.

**Validation:** the old `PayoutValidator` splits into per-slice input validators (shape of the request). Lifecycle rules move to the entity.
::alternatives
If the team already uses Clean Architecture with separate projects, you can keep the `Domain` project for `Payout` and `Money` and put slices inside the `Application` project. That is a common hybrid.
::mistakes
- Making `PayoutLifecycle` a slice. It isn't a use case.
- Putting the approval rule in `ApprovePayoutValidator`, so a future `BulkApprovePayouts` slice skips it.
- Moving all 11 DTOs into `Shared/Dtos` "for reuse", which recreates the layered structure.
:::

:::exercise id=m02-vertical-slice-ex4 difficulty=intermediate kind=code title="Add validation once with a decorator"
Every command slice validates its input before running. Instead of calling the validator inside each handler, write a generic decorator that runs all validators for a request type and only calls the real handler when there are no errors.
::requirements
- `ValidationDecorator<TRequest, TResponse>` implements `IHandler<TRequest, TResponse>` and wraps an inner handler.
- It runs **every** `IValidator<TRequest>` and collects all messages.
- If any message exists, throw `RequestValidationException` with the full list, and do **not** call the inner handler.
- With no validators registered, it simply calls the inner handler.
::acceptance
- Valid request: inner handler called once, its result returned.
- Invalid request: inner handler never called, exception lists messages from all validators in order.
- Zero validators: passes straight through.
::hint
The decorator has the same interface as the thing it wraps. Its constructor takes the inner handler and an `IEnumerable<IValidator<TRequest>>`.
::hint
Use `SelectMany` over the validators to flatten their error lists.
::hint
After collecting errors: `if (errors.Count > 0) throw new RequestValidationException(errors);` then `return await inner.HandleAsync(request, ct);`.
::hint
In ASP.NET Core you would register it by registering the concrete handler, then registering `IHandler<,>` as a factory that wraps it. Libraries such as Scrutor add a `Decorate` helper.
::starter
```csharp file=ValidationDecorator.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

public interface IHandler<TRequest, TResponse>
{
    Task<TResponse> HandleAsync(TRequest request, CancellationToken ct);
}

public interface IValidator<TRequest>
{
    IReadOnlyList<string> Validate(TRequest request);
}

public sealed class RequestValidationException(IReadOnlyList<string> errors) : Exception("Request is invalid.")
{
    public IReadOnlyList<string> Errors { get; } = errors;
}

public sealed class ValidationDecorator<TRequest, TResponse>(
    IHandler<TRequest, TResponse> inner,
    IEnumerable<IValidator<TRequest>> validators) : IHandler<TRequest, TResponse>
{
    public Task<TResponse> HandleAsync(TRequest request, CancellationToken ct) => throw new NotImplementedException();
}
```
::tests
```csharp file=ValidationDecoratorTests.cs
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

public sealed record RejectReturn(string Reason);

public class ValidationDecoratorTests
{
    private sealed class CountingHandler : IHandler<RejectReturn, string>
    {
        public int Calls;
        public Task<string> HandleAsync(RejectReturn r, CancellationToken ct) { Calls++; return Task.FromResult("Rejected"); }
    }

    private sealed class Rule(string message, bool fails) : IValidator<RejectReturn>
    {
        public IReadOnlyList<string> Validate(RejectReturn r) => fails ? new[] { message } : new string[0];
    }

    [Fact]
    public async Task Valid_request_calls_inner()
    {
        var inner = new CountingHandler();
        var sut = new ValidationDecorator<RejectReturn, string>(inner, new IValidator<RejectReturn>[] { new Rule("x", false) });
        Assert.Equal("Rejected", await sut.HandleAsync(new RejectReturn("Photos show the item was used"), CancellationToken.None));
        Assert.Equal(1, inner.Calls);
    }

    [Fact]
    public async Task Invalid_request_never_reaches_inner()
    {
        var inner = new CountingHandler();
        var sut = new ValidationDecorator<RejectReturn, string>(inner,
            new IValidator<RejectReturn>[] { new Rule("Reason required", true), new Rule("ok", false), new Rule("Too short", true) });
        var ex = await Assert.ThrowsAsync<RequestValidationException>(() => sut.HandleAsync(new RejectReturn(""), CancellationToken.None));
        Assert.Equal(new[] { "Reason required", "Too short" }, ex.Errors);
        Assert.Equal(0, inner.Calls);
    }

    [Fact]
    public async Task No_validators_passes_through()
    {
        var inner = new CountingHandler();
        var sut = new ValidationDecorator<RejectReturn, string>(inner, new IValidator<RejectReturn>[0]);
        await sut.HandleAsync(new RejectReturn("x"), CancellationToken.None);
        Assert.Equal(1, inner.Calls);
    }
}
```
::solution
```csharp file=ValidationDecorator.cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

public interface IHandler<TRequest, TResponse>
{
    Task<TResponse> HandleAsync(TRequest request, CancellationToken ct);
}

public interface IValidator<TRequest>
{
    IReadOnlyList<string> Validate(TRequest request);
}

public sealed class RequestValidationException(IReadOnlyList<string> errors) : Exception("Request is invalid.")
{
    public IReadOnlyList<string> Errors { get; } = errors;
}

public sealed class ValidationDecorator<TRequest, TResponse>(
    IHandler<TRequest, TResponse> inner,
    IEnumerable<IValidator<TRequest>> validators) : IHandler<TRequest, TResponse>
{
    private readonly IReadOnlyList<IValidator<TRequest>> _validators = validators.ToList();

    public async Task<TResponse> HandleAsync(TRequest request, CancellationToken ct)
    {
        var errors = _validators.SelectMany(v => v.Validate(request)).ToList();
        if (errors.Count > 0) throw new RequestValidationException(errors);
        return await inner.HandleAsync(request, ct);
    }
}
```

Registration in ASP.NET Core without extra libraries:

```csharp
builder.Services.AddScoped<RejectReturnHandler>();
builder.Services.AddScoped<IValidator<RejectReturn>, RejectReturnValidator>();
builder.Services.AddScoped<IHandler<RejectReturn, string>>(sp =>
    new ValidationDecorator<RejectReturn, string>(sp.GetRequiredService<RejectReturnHandler>(),
                                               sp.GetServices<IValidator<RejectReturn>>()));
```

Then map `RequestValidationException` to a `400` in one exception handler. Each slice now only writes a validator class. The "run validation first" rule exists once.
::alternatives
An `IEndpointFilter` on the route group does the same job at the HTTP edge, and is simpler if every slice is an HTTP endpoint. The decorator also works for slices triggered by a message queue or a background job.
::mistakes
- Calling the inner handler and validating afterwards.
- Stopping at the first failing validator, so the user fixes errors one round-trip at a time.
- Re-enumerating the `IEnumerable` on every request when it's a lazy query. Materialise it once.
:::

:::exercise id=m02-vertical-slice-ex5 difficulty=advanced kind=code title="An architecture rule: slices must not reference each other"
Folder structure is a convention, and conventions decay. Write a checker that takes a dependency map (type name → types it references) and reports every place where one slice depends on another.
::requirements
- Slice types live in namespaces shaped `<Root>.Features.<Area>.<Slice>` and anything below. The slice key is `<Area>.<Slice>`, e.g. `ShopEase.Features.Returns.Approve.ApproveReturnHandler` belongs to `Returns.Approve`.
- A slice **may** reference its own slice, `<Root>.Shared.*`, and anything outside `<Root>` (e.g. `System.*`).
- A slice **may** reference another slice's `Contracts` sub-namespace (`<Root>.Features.<Area>.<Slice>.Contracts.*`), which is the published surface.
- Anything else from slice to slice is a violation. Types outside `Features` are not checked.
- Return violations sorted by `FromType`, then `ToType` (ordinal), with no duplicates.
::acceptance
- `Approve` referencing `GetOpen.GetOpenReturnsHandler` is reported, with both slice keys.
- `Approve` referencing `GetOpen.Contracts.OpenReturnItem` is allowed.
- References to `ShopEase.Shared.ReturnRequest` or `System.Guid` are allowed.
- A namespace with too few segments under `Features` (e.g. `ShopEase.Features.Helpers`) is itself treated as not a slice, so it is never checked and never a target.
::hint
Write one small function, `SliceOf(typeName)`, that returns the slice key or `null`. Most of the logic follows from it.
::hint
Split the full name on `.`, find the index of `"Features"` right after the root, and take the next two segments. The type name itself is the last segment, so you need at least `Root.Features.Area.Slice.Type`.
::hint
For a reference from slice A to slice B where A ≠ B, it's allowed only if the segment straight after B's slice segment is `Contracts`.
::hint
```csharp
foreach (var (from, refs) in map)
{
    var a = SliceOf(from); if (a is null) continue;
    foreach (var to in refs) { var b = SliceOf(to); if (b is null || b == a || IsContract(to)) continue; add(...); }
}
```
::starter
```csharp file=SliceBoundaryChecker.cs
using System;
using System.Collections.Generic;
using System.Linq;

public sealed record SliceViolation(string FromType, string ToType, string FromSlice, string ToSlice);

public sealed class SliceBoundaryChecker(string rootNamespace)
{
    /// <summary>Returns "Area.Slice" for a type inside a slice, otherwise null.</summary>
    public string? SliceOf(string fullTypeName) => throw new NotImplementedException();

    public IReadOnlyList<SliceViolation> Check(IReadOnlyDictionary<string, IReadOnlyCollection<string>> references) =>
        throw new NotImplementedException();
}
```
::tests
```csharp file=SliceBoundaryCheckerTests.cs
using System.Collections.Generic;
using Xunit;

public class SliceBoundaryCheckerTests
{
    private const string Approve = "ShopEase.Features.Returns.Approve.ApproveReturnHandler";
    private static readonly SliceBoundaryChecker Sut = new("ShopEase");

    private static IReadOnlyDictionary<string, IReadOnlyCollection<string>> Map(string from, params string[] to) =>
        new Dictionary<string, IReadOnlyCollection<string>> { [from] = to };

    [Fact] public void Slice_key() => Assert.Equal("Returns.Approve", Sut.SliceOf(Approve));
    [Fact] public void Not_a_slice() => Assert.Null(Sut.SliceOf("ShopEase.Features.Helpers"));
    [Fact] public void Shared_is_not_a_slice() => Assert.Null(Sut.SliceOf("ShopEase.Shared.ReturnRequest"));

    [Fact]
    public void Cross_slice_reference_is_reported()
    {
        var v = Assert.Single(Sut.Check(Map(Approve, "ShopEase.Features.Returns.GetOpen.GetOpenReturnsHandler")));
        Assert.Equal("Returns.Approve", v.FromSlice);
        Assert.Equal("Returns.GetOpen", v.ToSlice);
    }

    [Fact]
    public void Contracts_shared_and_system_are_allowed() =>
        Assert.Empty(Sut.Check(Map(Approve,
            "ShopEase.Features.Returns.GetOpen.Contracts.OpenReturnItem",
            "ShopEase.Shared.ReturnRequest",
            "System.Guid",
            "ShopEase.Features.Returns.Approve.ApproveReturnCommand")));

    [Fact]
    public void Sorted_and_deduplicated()
    {
        var map = new Dictionary<string, IReadOnlyCollection<string>>
        {
            ["ShopEase.Features.Payouts.Reject.H"] = new[] { "ShopEase.Features.Payouts.Submit.Z", "ShopEase.Features.Payouts.Submit.A", "ShopEase.Features.Payouts.Submit.A" },
            ["ShopEase.Features.Payouts.Approve.H"] = new[] { "ShopEase.Features.Payouts.Submit.A" },
        };
        var v = Sut.Check(map);
        Assert.Equal(3, v.Count);
        Assert.Equal("ShopEase.Features.Payouts.Approve.H", v[0].FromType);
        Assert.Equal("ShopEase.Features.Payouts.Submit.A", v[1].ToType);
        Assert.Equal("ShopEase.Features.Payouts.Submit.Z", v[2].ToType);
    }
}
```
::solution
```csharp file=SliceBoundaryChecker.cs
using System;
using System.Collections.Generic;
using System.Linq;

public sealed record SliceViolation(string FromType, string ToType, string FromSlice, string ToSlice);

public sealed class SliceBoundaryChecker(string rootNamespace)
{
    private readonly string[] _root = rootNamespace.Split('.');

    public string? SliceOf(string fullTypeName)
    {
        var parts = fullTypeName.Split('.');
        // Root.Features.Area.Slice.Type at minimum
        if (parts.Length < _root.Length + 4) return null;
        for (var i = 0; i < _root.Length; i++) if (parts[i] != _root[i]) return null;
        if (parts[_root.Length] != "Features") return null;
        return $"{parts[_root.Length + 1]}.{parts[_root.Length + 2]}";
    }

    private bool IsContract(string fullTypeName)
    {
        var parts = fullTypeName.Split('.');
        var idx = _root.Length + 3;           // segment after the slice segment
        return parts.Length > idx + 1 && parts[idx] == "Contracts";
    }

    public IReadOnlyList<SliceViolation> Check(IReadOnlyDictionary<string, IReadOnlyCollection<string>> references)
    {
        var found = new HashSet<SliceViolation>();
        foreach (var (from, refs) in references)
        {
            var a = SliceOf(from);
            if (a is null) continue;
            foreach (var to in refs)
            {
                var b = SliceOf(to);
                if (b is null || b == a || IsContract(to)) continue;
                found.Add(new SliceViolation(from, to, a, b));
            }
        }
        return found.OrderBy(v => v.FromType, StringComparer.Ordinal)
                    .ThenBy(v => v.ToType, StringComparer.Ordinal)
                    .ToList();
    }
}
```

In a real test project you would build the map from the compiled assembly. Reflection gives you constructor parameter types, field types and method signatures cheaply. For full coverage (types used only inside method bodies) teams use an IL-reading library such as NetArchTest or ArchUnitNET, and run the rule in CI so a violation fails the build.
::mistakes
- Treating `ShopEase.Features.Helpers` as a slice called `Helpers.<TypeName>`.
- Using `StartsWith("ShopEase.Features.Returns.Approve")`, which also matches `...ApproveAll`.
- Reporting the same pair twice when a type references another through several members.
::extensions
Allow an explicit allow-list of pairs (`"Payouts.Approve -> Payouts.Submit.Contracts"`) with a reason string, so exceptions are documented in code review.
:::

## Automated testing

Slices make the test structure obvious: **one test class per slice**, named after the use case.

**1. Handler tests with real in-memory infrastructure.** Because each handler has one or two dependencies, you rarely need mocks.

```csharp
public class SubmitReturnTests
{
    private sealed class FixedClock(DateTimeOffset now) : TimeProvider { public override DateTimeOffset GetUtcNow() => now; }

    [Fact]
    public async Task Saves_and_returns_id()
    {
        var store = new InMemoryReturnStore();
        var handler = new SubmitReturnHandler(store, new FixedClock(new DateTimeOffset(2026, 10, 20, 9, 0, 0, TimeSpan.Zero)));
        var result = await handler.HandleAsync(new("blr", "ORD-10000400", "Wrong size: received UK 7", "cust-81234", new DateOnly(2026, 10, 23)), default);

        Assert.True(result.IsSuccess);
        var saved = await store.FindAsync(result.Value!.Id, default);
        Assert.Equal("BLR", saved!.CityCode);   // normalised by the handler
    }

    [Fact]
    public async Task Past_pickup_date_is_rejected()
    {
        var handler = new SubmitReturnHandler(new InMemoryReturnStore(), new FixedClock(new DateTimeOffset(2026, 10, 20, 9, 0, 0, TimeSpan.Zero)));
        var result = await handler.HandleAsync(new("BLR", "ORD-10000400", "Damaged box", "cust-81234", new DateOnly(2026, 10, 1)), default);
        Assert.True(result.Errors!.ContainsKey("PickupBy"));
    }
}
```

**2. Entity tests for shared rules.** `ReturnRequest.Approve` twice must throw. Test it once on the entity, not in every slice.

**3. Endpoint tests.** With `WebApplicationFactory<Program>` (from `Microsoft.AspNetCore.Mvc.Testing`) you can send a real HTTP request to `POST /returns` and assert the `201` and `Location` header. Keep a few of these per slice to catch routing and binding mistakes.

**4. Architecture tests.** Exercise 5's rule, run against the real assembly in CI, keeps slices independent as the team grows.

Edge cases worth a test: approving an unknown id (`404`), approving twice (`409`), city codes in different cases, a request with no signed-in user (`401`), and a request with every field invalid (all errors returned together).

## Real-world application

- **Line-of-business apps** (HR, procurement, project management) are the natural home for slices: dozens of screens, each with its own form, rules and report.
- **E-commerce and food-delivery back offices** often have modules such as returns, seller payouts, catalogue and customer support. Inside each module, use cases like "request return", "approve payout" or "pause restaurant listing" map neatly to slices, while the module boundary itself follows the [modular monolith](#/lesson/m02-modular-monolith) approach.
- **Public sample apps**: the .NET community has several open-source VSA templates built on minimal APIs. Read one to see how others organise slices, but don't copy a template's folder layout without asking whether your app needs it.
- **Combining styles**: many teams use slices for the application layer and a shared domain project for entities and value objects. Vertical slices and [Clean Architecture](#/lesson/m02-clean-onion) are compatible. What they disagree about is whether every use case must pass through the same layers of abstraction.

## Interview questions

:::interview
::q beginner
What is Vertical Slice Architecture?
::a
It organises code by feature, or use case, instead of by technical layer. Each slice holds everything one request needs: the request type, validation, the handler with the business logic and data access, and the endpoint. Slices are loosely coupled to each other and tightly cohesive inside. The goal is that a change to one feature touches one place.
::q beginner
How is it different from a layered architecture?
::a
Layers group code by technical role (controllers, services, repositories), so one feature is spread across all of them and shares big service classes with other features. Slices group by feature, so a feature lives in one place and shares only a small kernel (entities, the database context, a result type). Layers optimise for consistency across features. Slices optimise for independence between them.
::q intermediate
Where do business rules that several slices need go?
::a
Into the domain model, usually as methods on the entity or as value objects. For example, `ReturnRequest.Approve()` enforces "only once, only from Submitted", and any slice that approves goes through it. Slices should hold use-case orchestration and input validation, not invariants. If rules only live in slices, two slices drift apart and you get inconsistent behaviour.
::q intermediate
How do you handle cross-cutting concerns like validation, logging and transactions?
::a
Put them in a pipeline once rather than in each handler. Options: ASP.NET Core endpoint filters on a route group, decorators around a generic handler interface, or mediator pipeline behaviours if you use a mediator library. Transactions are usually one unit of work per command, committed at the end of the handler or by a behaviour. Queries skip the transaction and use no-tracking reads.
::q advanced
Your team adopted slices a year ago. Now there are 120 slices, a lot of copied mapping code, and new developers say every slice looks different. What do you do?
::a
First, measure: which copies actually change together? Code that changes together for the same reason should be extracted, such as a shared query object or a value object. Code that only looks similar should stay. Second, agree on a small set of slice templates: command with domain model, simple query, report or export. Enforce them with code review and a `dotnet new` template rather than a framework. Third, group slices into modules with clear boundaries, because 120 flat slices is a sign the app needs module boundaries. Finally, add architecture tests so slices don't reference each other. The aim is consistency in structure, while keeping each slice free to use the simplest implementation.
::q advanced
When would you not use vertical slices?
::a
For a small CRUD app where layers are already thin, for a library or engine organised around one algorithm, and for a team that hasn't agreed on use-case boundaries. Also when strict regulatory or platform rules require every request to pass through the same audited layers, a layered or clean structure may be easier to prove compliant. Slices also don't replace module or service boundaries: they organise code inside a module. They don't decide how the system is split.
:::

## Summary and revision

**Key takeaways**

- A vertical slice is one use case, from endpoint to database, kept in one folder or file.
- Slices are coupled tightly inside and loosely to each other. They never call each other's handlers.
- Keep a small shared kernel: entities with their invariants, the data context, common types.
- Commands and queries can take different approaches. Queries can project directly into response records.
- Add validation and logging once, with endpoint filters or decorators.
- Small CRUD apps don't need slices. The benefit grows with the number of use cases and people.

**Terminology**: vertical slice, feature folder, use case, command, query, handler, shared kernel, endpoint filter, decorator, architecture test.

:::flashcards
Q: What is a vertical slice?
A: All the code for one use case (request, validation, handler, data access, endpoint) kept together, cutting through every technical layer.
Q: What principle is Vertical Slice Architecture built on?
A: Things that change together should live together: high cohesion inside a slice, low coupling between slices.
Q: Should one slice call another slice's handler?
A: No. Share through the domain model, a shared service, or an event. Direct calls create hidden coupling.
Q: Where does a rule like "approve only once" live?
A: On the entity (domain model), so every slice that changes the entity enforces it.
Q: Why can query slices skip the domain model?
A: They only read. Projecting straight from the database into a response record is simpler and faster.
Q: Two ways to add validation to every slice without copying it?
A: Endpoint filters on a route group, or a decorator around a generic handler interface (or mediator behaviours).
Q: When is VSA overkill?
A: Small CRUD apps with thin layers, algorithm-centred libraries, or teams without agreed use-case boundaries.
Q: What does a mediator library add to VSA, and what does it cost?
A: A uniform pipeline and request-to-handler dispatch. It costs indirection, a dependency, and possibly licensing terms.
:::

## Knowledge check

:::quiz pass=70
::q single
A product owner asks to "let support agents reject a return request with a reason". In a well-structured vertical-slice app, what is the expected change?
- [ ] Edit the shared `ReturnService`, its interface, the controller and the repository.
- [x] Add a new `RejectReturn` slice and, if needed, a `Reject` method on the `ReturnRequest` entity.
- [ ] Copy the `ApproveReturn` slice and change it to call the approve handler with a flag.
- [ ] Add a new microservice for rejections.
> A new use case is a new slice. The lifecycle rule (only Submitted can be rejected) goes on the entity, so it is shared correctly.
::q single
`ApproveReturnHandler` injects `GetOpenReturnsHandler` to check whether a return request is still open. What is the main problem?
- [ ] It is slower.
- [x] It couples two slices, so a change to the dashboard query can break approval.
- [ ] Handlers can't be injected.
- [ ] Nothing, reuse is always good.
> Slices should not depend on each other. Approval should load the return request and check its status, or call a method on the entity.
::q multi
Which belong in the shared kernel of a slice-based app? (Select all that apply.)
- [x] The `ReturnRequest` entity with its invariants, used by four slices.
- [x] The database context.
- [ ] A response DTO used by one dashboard query.
- [ ] A helper method used by one slice "in case others need it".
> Share what is genuinely common and must change in one place. One-slice code stays in that slice.
::q single
Two slices map `ReturnRequest` into response records that look 80 % the same. What should you do?
- [ ] Always merge them into one shared DTO.
- [x] Keep them separate unless they must change together for the same reason.
- [ ] Delete one of the endpoints.
- [ ] Move both into the entity.
> Similar-looking code that changes for different reasons is not real duplication. Merging it couples two screens.
::q single
Your internal tool has 7 endpoints over 3 tables, one developer, and no complex rules. Best structure?
- [ ] Vertical slices with a mediator and pipeline behaviours.
- [ ] Clean Architecture with four projects.
- [x] A simple layered or single-file minimal API.
- [ ] One microservice per table.
> The benefits of slices come from many use cases and many contributors. Here the extra structure is pure cost.
::q single
How should a query slice for "open returns in city BLR" read data?
- [ ] Load all return requests through a shared repository and filter in memory.
- [x] Filter and project at the source (for example a no-tracking LINQ query that runs as SQL) into the response shape.
- [ ] Call the submit handler to get the list.
- [ ] Use the domain entity's methods to compute the list.
> Queries can bypass the domain model. Filtering at the database keeps the payload small.
::q single
Where is the best place to make sure every command is validated before its handler runs?
- [ ] Copy a `Validate()` call into the first line of every handler.
- [x] A single pipeline step, such as a route-group endpoint filter or a validation decorator.
- [ ] In the database, with triggers.
- [ ] In the front end only.
> Cross-cutting behaviour belongs in one place. Each slice still supplies its own validator.
:::

## Completion criteria

You have finished this lesson when you can:

- [ ] Score at least 70 % on the knowledge check.
- [ ] Complete exercises 1 and 2, with `dotnet test` passing on your downloaded project.
- [ ] Complete at least one of exercises 3–5 and compare your answer with the solution.
- [ ] Explain in two minutes, with an example, why a shared service class tends to grow and how slices avoid it.
- [ ] Name one situation where you would choose plain layers instead of slices.
