// Code generators: ClassModel → Mermaid classDiagram, C# files, Mermaid stateDiagram-v2.
import { baseName, genericsOf, parseMember } from './model';
import type { ClassModel, ClassNode, ParsedMember, Relation } from './model';

const toTilde = (s: string) => s.replace(/</g, '~').replace(/>/g, '~');
const clean = (s: string) => s.replace(/[{}"`;]/g, '').replace(/\s+/g, ' ').trim();

/** Unique, Mermaid-safe identifiers per class id. */
function mermaidIds(model: ClassModel): Map<string, string> {
  const used = new Set<string>();
  const ids = new Map<string, string>();
  for (const c of model.classes) {
    let id = baseName(c.name);
    if (/^\d/.test(id)) id = '_' + id;
    let n = 2;
    const root = id;
    while (used.has(id)) id = `${root}${n++}`;
    used.add(id);
    ids.set(c.id, id);
  }
  return ids;
}

function mermaidMember(raw: string, isEnum: boolean): string {
  if (isEnum) return clean(raw.replace(/^[+\-#~]\s*/, '').replace(/[=,].*$/, '')) || '';
  const m = parseMember(raw);
  const vis = raw.trim()[0] && '+-#~'.includes(raw.trim()[0]) ? raw.trim()[0] : '';
  const suffix = m.modifiers.includes('abstract') ? '*' : m.modifiers.includes('static') ? '$' : '';
  if (m.isMethod) {
    const ret = m.type ? ' ' + toTilde(clean(m.type)) : '';
    return `${vis}${m.name}(${toTilde(clean(m.params))})${suffix}${ret}`;
  }
  const type = m.type ? toTilde(clean(m.type)) + ' ' : '';
  return `${vis}${type}${m.name}${suffix}`;
}

const ANNOTATION: Record<string, string | undefined> = { interface: 'interface', abstract: 'abstract', enum: 'enumeration', record: 'record', class: undefined };

/** Mermaid arrow for a relation drawn from → to. */
export function mermaidArrow(kind: Relation['kind']): { arrow: string; reversed: boolean } {
  switch (kind) {
    case 'inherits': return { arrow: '--|>', reversed: false };
    case 'implements': return { arrow: '..|>', reversed: false };
    case 'composition': return { arrow: '*--', reversed: false };
    case 'aggregation': return { arrow: 'o--', reversed: false };
    case 'association': return { arrow: '-->', reversed: false };
    case 'dependency': return { arrow: '..>', reversed: false };
  }
}

/** Valid Mermaid classDiagram source. */
export function toMermaid(model: ClassModel): string {
  const ids = mermaidIds(model);
  const lines = ['classDiagram'];
  for (const c of model.classes) {
    const id = ids.get(c.id)!;
    const g = genericsOf(c);
    const decl = `class ${id}${g.length ? '~' + g.map(clean).join(', ') + '~' : ''}`;
    const ann = ANNOTATION[c.kind];
    const members = [...c.fields, ...c.methods].map((m) => mermaidMember(m, c.kind === 'enum' && c.fields.includes(m))).filter(Boolean);
    if (!ann && !members.length) { lines.push('  ' + decl); continue; }
    lines.push(`  ${decl} {`);
    if (ann) lines.push(`    <<${ann}>>`);
    for (const m of members) lines.push('    ' + m);
    lines.push('  }');
  }
  for (const r of model.relations) {
    const a = ids.get(r.from);
    const b = ids.get(r.to);
    if (!a || !b) continue;
    const { arrow } = mermaidArrow(r.kind);
    const mult = r.multiplicity ? ` "${r.multiplicity.replace(/"/g, '')}"` : '';
    const label = r.label ? ` : ${clean(r.label).replace(/:/g, ' ')}` : '';
    lines.push(`  ${a} ${arrow}${mult} ${b}${label}`);
  }
  return lines.join('\n');
}

// ---------- C# ----------

const CS_VIS: Record<string, string> = { public: 'public', private: 'private', protected: 'protected', internal: 'internal', '': '' };
const ident = (s: string) => s.replace(/[^\w]/g, '_') || '_';
const csType = (s: string) => s.replace(/~([^~]+)~/g, '<$1>').trim();

function csDisplayName(c: ClassNode): string {
  const g = genericsOf(c);
  return ident(baseName(c.name)) + (g.length ? `<${g.join(', ')}>` : '');
}

function memberLine(m: ParsedMember, ctx: { kind: ClassNode['kind']; className: string }): string {
  const isIface = ctx.kind === 'interface';
  const vis = isIface ? '' : (CS_VIS[m.visibility] || (m.isMethod ? 'public' : 'private'));
  const mods = m.modifiers.filter((x) => !(isIface && x === 'abstract'));
  const prefix = [vis, ...mods].filter(Boolean).join(' ');
  const pre = prefix ? prefix + ' ' : '';
  if (m.isMethod) {
    const params = csType(m.params);
    if (m.name === ctx.className && !m.type) return `${pre}${m.name}(${params})\n    {\n    }`;
    const ret = csType(m.type) || 'void';
    if (isIface || mods.includes('abstract')) return `${pre}${ret} ${m.name}(${params});`;
    return `${pre}${ret} ${m.name}(${params}) => throw new NotImplementedException();`;
  }
  const type = csType(m.type) || 'object';
  if (isIface) {
    const acc = /\{[^}]*\}/.exec(m.body)?.[0] ?? '{ get; }';
    return `${type} ${m.name} ${acc}`;
  }
  if (m.isProperty) {
    const acc = /\{[^}]*\}/.exec(m.body)![0];
    return `${pre}${type} ${m.name} ${acc}`;
  }
  const init = /=\s*(.+)$/.exec(m.body)?.[1];
  return `${pre}${type} ${m.name}${init ? ' = ' + init.trim() : ''};`;
}

function ancestors(model: ClassModel, id: string, seen = new Set<string>()): ClassNode[] {
  const out: ClassNode[] = [];
  for (const r of model.relations) {
    if (r.from !== id || (r.kind !== 'inherits' && r.kind !== 'implements') || seen.has(r.to)) continue;
    seen.add(r.to);
    const t = model.classes.find((c) => c.id === r.to);
    if (t) out.push(t, ...ancestors(model, t.id, seen));
  }
  return out;
}

/** One C# file per class. Method bodies are stubs that throw NotImplementedException. */
export function toCSharp(model: ClassModel, namespace = 'Design'): { name: string; code: string }[] {
  const byId = new Map(model.classes.map((c) => [c.id, c] as const));
  const usedNames = new Set<string>();
  return model.classes.map((c) => {
    const className = ident(baseName(c.name));
    let fileName = className;
    let n = 2;
    while (usedNames.has(fileName)) fileName = `${className}${n++}`;
    usedNames.add(fileName);

    const bases: ClassNode[] = [];
    for (const r of model.relations) {
      if (r.from !== c.id || (r.kind !== 'inherits' && r.kind !== 'implements')) continue;
      const t = byId.get(r.to);
      if (t && !bases.includes(t)) bases.push(t);
    }
    // Base class first (C# requires it), then interfaces.
    bases.sort((a, b) => Number(a.kind === 'interface') - Number(b.kind === 'interface'));
    const baseList = bases.filter((b) => b.kind !== 'enum').map(csDisplayName);

    const out: string[] = ['using System;', 'using System.Collections.Generic;', '', `namespace ${namespace};`, ''];
    if (c.responsibility?.trim()) {
      out.push('/// <summary>');
      for (const l of c.responsibility.trim().split('\n')) out.push(`/// ${l.replace(/</g, '&lt;').replace(/>/g, '&gt;')}`);
      out.push('/// </summary>');
    }
    const header = (keyword: string) => `public ${keyword} ${csDisplayName(c)}${baseList.length ? ' : ' + baseList.join(', ') : ''}`;
    const body: string[] = [];
    const ctx = { kind: c.kind, className };

    if (c.kind === 'enum') {
      out.push(`public enum ${className}`, '{');
      const values = c.fields.map((f) => f.replace(/^[+\-#~]\s*/, '').replace(/[;,]\s*$/, '').trim()).filter(Boolean)
        .map((v) => { const [nm, val] = v.split('='); return ident(nm.trim().split(/\s+/).pop()!) + (val ? ` = ${val.trim()}` : ''); });
      out.push(values.map((v) => '    ' + v).join(',\n'));
      out.push('}');
      if (c.methods.length) out.push('', `// Enums cannot declare methods in C#; consider an extension class for: ${c.methods.map((m) => parseMember(m).name).join(', ')}`);
      return { name: `${fileName}.cs`, code: out.join('\n') + '\n' };
    }

    if (c.kind === 'record') {
      const params = c.fields.map(parseMember).map((m) => `${csType(m.type) || 'object'} ${m.name}`);
      out.push(`public record ${csDisplayName(c)}(${params.join(', ')})${baseList.length ? ' : ' + baseList.join(', ') : ''}`);
    } else if (c.kind === 'interface') {
      out.push(header('interface'));
    } else if (c.kind === 'abstract') {
      out.push(header('abstract class'));
    } else {
      out.push(header('class'));
    }

    if (c.kind !== 'record') for (const f of c.fields) body.push(memberLine(parseMember(f), ctx));
    if (c.kind !== 'record' && c.fields.length && c.methods.length) body.push('');
    for (const m of c.methods) body.push(memberLine(parseMember(m), ctx));

    // Stubs for interface methods the class does not declare yet, so the file compiles.
    if (c.kind !== 'interface') {
      const anc = ancestors(model, c.id);
      const have = new Set([...c.methods, ...anc.filter((a) => a.kind !== 'interface').flatMap((a) => a.methods)].map((m) => parseMember(m).name));
      for (const iface of anc.filter((a) => a.kind === 'interface')) {
        for (const im of iface.methods) {
          const pm = parseMember(im);
          if (have.has(pm.name)) continue;
          have.add(pm.name);
          const ret = csType(pm.type) || 'void';
          body.push(`// from ${baseName(iface.name)}`);
          body.push(c.kind === 'abstract'
            ? `public abstract ${ret} ${pm.name}(${csType(pm.params)});`
            : `public ${ret} ${pm.name}(${csType(pm.params)}) => throw new NotImplementedException();`);
        }
      }
    }

    if (c.kind === 'record' && !body.length) {
      out[out.length - 1] += ';';
    } else {
      out.push('{');
      for (const l of body) out.push(l ? '    ' + l : '');
      out.push('}');
    }
    return { name: `${fileName}.cs`, code: out.join('\n') + '\n' };
  });
}

// ---------- state machine ----------

const stateId = (s: string) => s.trim().replace(/[^\w]/g, '_') || 'S';

/** Mermaid stateDiagram-v2 for a class's states (the first state is the initial one). */
export function toStateDiagram(states: string[], transitions: { from: string; to: string; event?: string }[]): string {
  const lines = ['stateDiagram-v2'];
  const list = states.map((s) => s.trim()).filter(Boolean);
  for (const s of list) if (stateId(s) !== s) lines.push(`  state "${s.replace(/"/g, '')}" as ${stateId(s)}`);
  if (list.length) lines.push(`  [*] --> ${stateId(list[0])}`);
  for (const t of transitions) {
    if (!t.from.trim() || !t.to.trim()) continue;
    const from = t.from === '[*]' ? '[*]' : stateId(t.from);
    const to = t.to === '[*]' ? '[*]' : stateId(t.to);
    lines.push(`  ${from} --> ${to}${t.event?.trim() ? ' : ' + clean(t.event).replace(/:/g, ' ') : ''}`);
  }
  return lines.join('\n');
}
