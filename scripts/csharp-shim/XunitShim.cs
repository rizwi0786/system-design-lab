// Minimal xUnit-compatible shim used ONLY for offline verification in environments without NuGet access.
// The downloadable learner projects reference the real xunit packages.
#nullable enable
using System.Collections;
using System.Reflection;

namespace Xunit
{
    [AttributeUsage(AttributeTargets.Method)] public class FactAttribute : Attribute { public string? Skip { get; set; } public string? DisplayName { get; set; } }
    [AttributeUsage(AttributeTargets.Method)] public class TheoryAttribute : FactAttribute { }
    [AttributeUsage(AttributeTargets.Method, AllowMultiple = true)] public class InlineDataAttribute(params object?[]? data) : Attribute { public object?[] Data { get; } = data ?? new object?[] { null }; }
    [AttributeUsage(AttributeTargets.Method, AllowMultiple = true)] public class MemberDataAttribute(string name, params object?[] p) : Attribute { public string Name { get; } = name; }
    public interface IClassFixture<T> where T : class { }
    public interface IAsyncLifetime { Task InitializeAsync(); Task DisposeAsync(); }
    public class XunitException(string m) : Exception(m) { }
    namespace Abstractions { public interface ITestOutputHelper { void WriteLine(string s); void WriteLine(string f, params object[] a); } }

    public static class Assert
    {
        static XunitException F(string m) => new(m);
        static bool Eq(object? a, object? b)
        {
            if (a is null || b is null) return a is null && b is null;
            if (a is string || b is string) return Equals(a, b);
            if (a is IEnumerable ea && b is IEnumerable eb)
            { var la = ea.Cast<object?>().ToList(); var lb = eb.Cast<object?>().ToList(); return la.Count == lb.Count && la.Zip(lb).All(p => Eq(p.First, p.Second)); }
            if (IsNum(a) && IsNum(b)) return Convert.ToDecimal(a) == Convert.ToDecimal(b);
            return a.Equals(b);
        }
        static bool IsNum(object o) => o is int or long or decimal or short or byte or uint or ulong;
        public static void Equal<T>(IEnumerable<T> expected, IEnumerable<T> actual) { if (!Eq(expected, actual)) throw F($"Assert.Equal (sequence) failed. Expected: [{string.Join(", ", expected)}] Actual: [{string.Join(", ", actual)}]"); }
        public static void Equal<T>(T expected, T actual) { if (!Eq(expected, actual)) throw F($"Assert.Equal failed. Expected: {expected} Actual: {actual}"); }
        public static void Equal(double expected, double actual, int precision) { if (Math.Round(expected - actual, precision) != 0) throw F($"Assert.Equal failed. Expected: {expected} Actual: {actual}"); }
        public static void Equal(decimal expected, decimal actual, int precision) { if (Math.Round(expected - actual, precision) != 0) throw F($"Assert.Equal failed. Expected: {expected} Actual: {actual}"); }
        public static void Equal(string? expected, string? actual, bool ignoreCase = false) { if (!string.Equals(expected, actual, ignoreCase ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal)) throw F($"Assert.Equal failed. Expected: \"{expected}\" Actual: \"{actual}\""); }
        public static void NotEqual<T>(T expected, T actual) { if (Eq(expected, actual)) throw F($"Assert.NotEqual failed: {actual}"); }
        public static void True(bool c, string? m = null) { if (!c) throw F(m ?? "Assert.True failed"); }
        public static void True(bool? c, string? m = null) { if (c != true) throw F(m ?? "Assert.True failed"); }
        public static void False(bool c, string? m = null) { if (c) throw F(m ?? "Assert.False failed"); }
        public static void False(bool? c, string? m = null) { if (c != false) throw F(m ?? "Assert.False failed"); }
        public static void Null(object? o) { if (o is not null) throw F($"Assert.Null failed: {o}"); }
        public static void NotNull(object? o) { if (o is null) throw F("Assert.NotNull failed"); }
        public static void Same(object? a, object? b) { if (!ReferenceEquals(a, b)) throw F("Assert.Same failed"); }
        public static void NotSame(object? a, object? b) { if (ReferenceEquals(a, b)) throw F("Assert.NotSame failed"); }
        public static T Throws<T>(Action a) where T : Exception { try { a(); } catch (T e) when (e.GetType() == typeof(T)) { return e; } catch (Exception e) { throw F($"Assert.Throws<{typeof(T).Name}> got {e.GetType().Name}: {e.Message}"); } throw F($"Assert.Throws<{typeof(T).Name}>: nothing thrown"); }
        public static T Throws<T>(Func<object?> f) where T : Exception => Throws<T>(() => { f(); });
        public static T ThrowsAny<T>(Action a) where T : Exception { try { a(); } catch (T e) { return e; } catch (Exception e) { throw F($"Assert.ThrowsAny<{typeof(T).Name}> got {e.GetType().Name}"); } throw F("Assert.ThrowsAny: nothing thrown"); }
        public static async Task<T> ThrowsAsync<T>(Func<Task> f) where T : Exception { try { await f(); } catch (T e) when (e.GetType() == typeof(T)) { return e; } catch (Exception e) { throw F($"Assert.ThrowsAsync<{typeof(T).Name}> got {e.GetType().Name}: {e.Message}"); } throw F("Assert.ThrowsAsync: nothing thrown"); }
        public static async Task<T> ThrowsAnyAsync<T>(Func<Task> f) where T : Exception { try { await f(); } catch (T e) { return e; } throw F("Assert.ThrowsAnyAsync: nothing thrown"); }
        public static void Contains(string sub, string? s) { if (s is null || !s.Contains(sub)) throw F($"Assert.Contains failed: \"{sub}\" not in \"{s}\""); }
        public static void DoesNotContain(string sub, string? s) { if (s is not null && s.Contains(sub)) throw F($"Assert.DoesNotContain failed: \"{sub}\""); }
        public static void Contains<T>(T item, IEnumerable<T> c) { if (!c.Any(x => Eq(x, item))) throw F($"Assert.Contains failed: {item}"); }
        public static T Contains<T>(IEnumerable<T> c, Predicate<T> p) { foreach (var x in c) if (p(x)) return x; throw F("Assert.Contains(predicate) failed"); }
        public static void DoesNotContain<T>(T item, IEnumerable<T> c) { if (c.Any(x => Eq(x, item))) throw F($"Assert.DoesNotContain failed: {item}"); }
        public static void DoesNotContain<T>(IEnumerable<T> c, Predicate<T> p) { if (c.Any(x => p(x))) throw F("Assert.DoesNotContain(predicate) failed"); }
        public static void ContainsKey<TK, TV>(TK key, IDictionary<TK, TV> d) { if (!d.ContainsKey(key)) throw F($"Assert.Contains key failed: {key}"); }
        public static void Empty(IEnumerable c) { if (c.Cast<object>().Any()) throw F("Assert.Empty failed"); }
        public static void NotEmpty(IEnumerable c) { if (!c.Cast<object>().Any()) throw F("Assert.NotEmpty failed"); }
        public static T Single<T>(IEnumerable<T> c) { var l = c.ToList(); if (l.Count != 1) throw F($"Assert.Single failed: {l.Count} items"); return l[0]; }
        public static T Single<T>(IEnumerable<T> c, Predicate<T> p) => Single(c.Where(x => p(x)));
        public static T IsType<T>(object? o) { if (o is null || o.GetType() != typeof(T)) throw F($"Assert.IsType<{typeof(T).Name}> got {o?.GetType().Name ?? "null"}"); return (T)o; }
        public static T IsAssignableFrom<T>(object? o) { if (o is not T t) throw F($"Assert.IsAssignableFrom<{typeof(T).Name}> failed"); return t; }
        public static void IsNotType<T>(object? o) { if (o?.GetType() == typeof(T)) throw F("Assert.IsNotType failed"); }
        public static void InRange<T>(T v, T low, T high) where T : IComparable<T> { if (v.CompareTo(low) < 0 || v.CompareTo(high) > 0) throw F($"Assert.InRange failed: {v} not in [{low},{high}]"); }
        public static void All<T>(IEnumerable<T> c, Action<T> a) { foreach (var x in c) a(x); }
        public static void Collection<T>(IEnumerable<T> c, params Action<T>[] inspectors) { var l = c.ToList(); if (l.Count != inspectors.Length) throw F("Assert.Collection count mismatch"); for (var i = 0; i < l.Count; i++) inspectors[i](l[i]); }
        public static void Fail(string m) => throw F(m);
        public static void StartsWith(string p, string? s) { if (s is null || !s.StartsWith(p)) throw F($"Assert.StartsWith failed: {s}"); }
        public static void EndsWith(string p, string? s) { if (s is null || !s.EndsWith(p)) throw F($"Assert.EndsWith failed: {s}"); }
        public static void Matches(string pattern, string? s) { if (s is null || !System.Text.RegularExpressions.Regex.IsMatch(s, pattern)) throw F("Assert.Matches failed"); }
        public static void Subset<T>(ISet<T> expected, ISet<T> actual) { if (!actual.IsSubsetOf(expected)) throw F("Assert.Subset failed"); }
        public static void Superset<T>(ISet<T> expected, ISet<T> actual) { if (!actual.IsSupersetOf(expected)) throw F("Assert.Superset failed"); }
        public static void Equivalent(object? expected, object? actual) { if (!Eq(expected, actual)) throw F("Assert.Equivalent failed"); }
    }
}

public static class __ShimRunner
{
    public static int Main()
    {
        int pass = 0, fail = 0;
        foreach (var t in Assembly.GetExecutingAssembly().GetTypes().Where(t => t.IsClass && !t.IsAbstract))
            foreach (var m in t.GetMethods(BindingFlags.Public | BindingFlags.Instance))
            {
                var fact = m.GetCustomAttribute<Xunit.FactAttribute>();
                if (fact is null || fact.Skip is not null) continue;
                var rows = m.GetCustomAttributes<Xunit.InlineDataAttribute>().Select(a => a.Data).ToList();
                if (fact is Xunit.TheoryAttribute && rows.Count == 0) { Console.WriteLine($"SKIP {t.Name}.{m.Name} (MemberData not supported by shim)"); continue; }
                if (rows.Count == 0) rows.Add(Array.Empty<object?>());
                foreach (var row in rows)
                {
                    var name = $"{t.Name}.{m.Name}({string.Join(", ", row)})";
                    try
                    {
                        var inst = CreateInstance(t);
                        var ps = m.GetParameters();
                        var args = row.Select((v, i) => v is null ? null : ConvertArg(v, ps[i].ParameterType)).ToArray();
                        var r = m.Invoke(inst, args);
                        if (r is Task task) task.GetAwaiter().GetResult();
                        (inst as IDisposable)?.Dispose();
                        pass++; Console.WriteLine($"PASS {name}");
                    }
                    catch (Exception e)
                    {
                        var inner = e is TargetInvocationException tie && tie.InnerException is not null ? tie.InnerException : e;
                        fail++; Console.WriteLine($"FAIL {name}: {inner.GetType().Name}: {inner.Message}");
                    }
                }
            }
        Console.WriteLine($"RESULT passed={pass} failed={fail}");
        return fail == 0 ? 0 : 1;
    }
    static object? CreateInstance(Type t)
    {
        var ctor = t.GetConstructors().OrderBy(c => c.GetParameters().Length).First();
        var args = ctor.GetParameters().Select(p => p.ParameterType.IsInterface && p.ParameterType.Name == "ITestOutputHelper" ? new ConsoleOut() : Activator.CreateInstance(p.ParameterType)).ToArray();
        return ctor.Invoke(args);
    }
    static object? ConvertArg(object v, Type target)
    {
        var tt = Nullable.GetUnderlyingType(target) ?? target;
        if (tt.IsInstanceOfType(v)) return v;
        if (tt.IsEnum) return Enum.ToObject(tt, v);
        if (tt == typeof(DateOnly) && v is string ds) return DateOnly.Parse(ds);
        if (tt == typeof(TimeSpan) && v is string ts) return TimeSpan.Parse(ts);
        return Convert.ChangeType(v, tt, System.Globalization.CultureInfo.InvariantCulture);
    }
    sealed class ConsoleOut : Xunit.Abstractions.ITestOutputHelper { public void WriteLine(string s) => Console.WriteLine("  | " + s); public void WriteLine(string f, params object[] a) => Console.WriteLine("  | " + string.Format(f, a)); }
}
