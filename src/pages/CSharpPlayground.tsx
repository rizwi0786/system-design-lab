import { useState } from 'react';
import { CSharpEditor, Lazy } from '../components/playgrounds';
import { PageHeader, Select } from '../components/ui';

const SAMPLES: Record<string, { title: string; files: { name: string; language: string; code: string }[]; tests: { name: string; language: string; code: string }[] }> = {
  hello: {
    title: 'Hello, objects',
    files: [{ name: 'Program.cs', language: 'csharp', code: `namespace Playground;

public sealed class BankAccount
{
    public string Owner { get; }
    public decimal Balance { get; private set; }

    public BankAccount(string owner, decimal opening = 0m)
    {
        if (string.IsNullOrWhiteSpace(owner)) throw new ArgumentException("Owner is required", nameof(owner));
        if (opening < 0) throw new ArgumentOutOfRangeException(nameof(opening));
        Owner = owner;
        Balance = opening;
    }

    public void Deposit(decimal amount)
    {
        if (amount <= 0) throw new ArgumentOutOfRangeException(nameof(amount), "Deposit must be positive");
        Balance += amount;
    }

    public void Withdraw(decimal amount)
    {
        if (amount <= 0) throw new ArgumentOutOfRangeException(nameof(amount));
        if (amount > Balance) throw new InvalidOperationException("Insufficient funds");
        Balance -= amount;
    }
}

public static class Program
{
    public static void Main()
    {
        var acc = new BankAccount("Asha", 1_000m);
        acc.Deposit(250m);
        acc.Withdraw(400m);
        Console.WriteLine($"{acc.Owner}: {acc.Balance:C}");
    }
}
` }],
    tests: [{ name: 'BankAccountTests.cs', language: 'csharp', code: `using Playground;
using Xunit;

public class BankAccountTests
{
    [Fact]
    public void Deposit_increases_balance()
    {
        var a = new BankAccount("Asha", 100m);
        a.Deposit(50m);
        Assert.Equal(150m, a.Balance);
    }

    [Fact]
    public void Cannot_overdraw() =>
        Assert.Throws<InvalidOperationException>(() => new BankAccount("Asha", 10m).Withdraw(20m));
}
` }],
  },
  strategy: {
    title: 'Strategy pattern',
    files: [{ name: 'Program.cs', language: 'csharp', code: `namespace Playground;

public interface IShippingCost { string Carrier { get; } decimal Quote(decimal kg); }
public sealed class Standard : IShippingCost { public string Carrier => "standard"; public decimal Quote(decimal kg) => 40 + kg * 15; }
public sealed class Express : IShippingCost { public string Carrier => "express"; public decimal Quote(decimal kg) => 90 + kg * 30; }

public sealed class Checkout(IEnumerable<IShippingCost> options)
{
    private readonly Dictionary<string, IShippingCost> _byCarrier = options.ToDictionary(o => o.Carrier);
    public decimal Shipping(string carrier, decimal kg) =>
        _byCarrier.TryGetValue(carrier, out var s) ? s.Quote(kg) : throw new ArgumentException($"Unknown carrier {carrier}");
}

public static class Program
{
    public static void Main()
    {
        var checkout = new Checkout(new IShippingCost[] { new Standard(), new Express() });
        Console.WriteLine(checkout.Shipping("express", 2.5m));
    }
}
` }],
    tests: [{ name: 'CheckoutTests.cs', language: 'csharp', code: `using Playground;
using Xunit;

public class CheckoutTests
{
    private static Checkout Sut() => new(new IShippingCost[] { new Standard(), new Express() });

    [Theory]
    [InlineData("standard", 2, 70)]
    [InlineData("express", 2, 150)]
    public void Quotes(string carrier, int kg, int expected) => Assert.Equal((decimal)expected, Sut().Shipping(carrier, kg));

    [Fact]
    public void Unknown_carrier_throws() => Assert.Throws<ArgumentException>(() => Sut().Shipping("drone", 1));
}
` }],
  },
};

export default function CSharpPlayground() {
  const [sample, setSample] = useState<keyof typeof SAMPLES>('hello');
  const s = SAMPLES[sample];
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader title="C# coding playground" actions={<Select label="Sample" value={sample} onChange={v => setSample(v as keyof typeof SAMPLES)} options={Object.entries(SAMPLES).map(([value, x]) => ({ value, label: x.title }))} />}>
        Edit C# with full syntax highlighting. This static site cannot compile or run C#, so it never pretends to: click <em>Download .NET project</em> to get a solution with xUnit tests, then run <code className="font-mono">dotnet test</code> with the .NET 10 SDK.
      </PageHeader>
      <Lazy label="code editor"><CSharpEditor key={sample} storageKey={`playground:${sample}`} files={s.files} tests={s.tests} title={s.title} exerciseId={`playground-${sample}`} lessonId="playground" height={520} /></Lazy>
      <div className="mt-6 rounded-lg border border-line bg-surface p-4 text-sm text-ink-2">
        <h2 className="mb-1 font-semibold text-ink">Why not run C# in the browser?</h2>
        Compiling C# needs the Roslyn compiler and the .NET runtime. Shipping them as WebAssembly would add tens of megabytes to every page and still couldn’t run ASP.NET Core or real databases. A safe server-side sandbox would need hosting this static site doesn’t have. Running locally gives you the real compiler, real tests and a debugger.
      </div>
    </div>
  );
}
