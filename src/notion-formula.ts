// Parse the declarative subset used by imported Notion finance schemas. A new
// operator or function must fail visibly, including inside an unchosen branch.
export type RuleValue = string | number | boolean | null | RuleValue[];
type Expr = {kind: 'literal'; value: RuleValue} | {kind: 'variable'; name: string} |
  {kind: 'call'; name: string; args: Expr[]};
type GetProperty = (name: string) => RuleValue;

const precedence: Record<string, number> = {or: 1, and: 2, '==': 3, '!=': 3, '>': 4, '<': 4, '>=': 4, '<=': 4, '+': 5, '-': 5, '*': 6, '/': 6};
const functions = new Set(['prop', 'abs', 'and', 'contains', 'empty', 'format', 'formatDate', 'if', 'ifs', 'includes', 'length', 'lets', 'max', 'not', 'or', 'round', 'style', 'substring', 'toNumber', 'unstyle']);
export function parseFormula(source: string): Expr {
  const tokens = source.match(/"(?:\\.|[^"\\])*"|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[A-Za-z_][\w]*|==|!=|<=|>=|\S/gu) ?? [];
  if (tokens.length > 8192) throw Error('公式过长');
  let index = 0;
  function consume(token: string) {
    if (tokens[index] !== token) throw Error('公式缺少 ' + token);
    index++;
  }
  function argumentsUntil(end: string): Expr[] {
    const result: Expr[] = [];
    if (tokens[index] !== end) {
      result.push(expression(0));
      while (tokens[index] === ',') { index++; result.push(expression(0)); }
    }
    consume(end);
    return result;
  }
  function call(name: string, receiver?: Expr): Expr {
    if (!functions.has(name)) throw Error('未支持的公式函数 ' + name);
    consume('(');
    const args = argumentsUntil(')');
    return {kind: 'call', name, args: receiver ? [receiver, ...args] : args};
  }
  function expression(min: number): Expr {
    const token = tokens[index++];
    let left: Expr;
    if (!token) throw Error('公式缺少值');
    if (token.startsWith('"')) left = {kind: 'literal', value: JSON.parse(token) as string};
    else if (/^\d/.test(token)) left = {kind: 'literal', value: Number(token)};
    else if (token === 'true' || token === 'false') left = {kind: 'literal', value: token === 'true'};
    else if (token === '(') {left = expression(0); consume(')');}
    else if (token === '[') left = {kind: 'call', name: 'list', args: argumentsUntil(']')};
    else if (token === '-' || (token === 'not' && tokens[index] !== '('))
      left = {kind: 'call', name: token === '-' ? 'negate' : 'not', args: [expression(7)]};
    else if (/^[A-Za-z_]/.test(token)) left = tokens[index] === '(' ? call(token) : {kind: 'variable', name: token};
    else throw Error('未支持的公式符号 ' + token);
    while (tokens[index] === '.') {index++; left = call(tokens[index++], left);}
    while (Object.hasOwn(precedence, tokens[index]) && precedence[tokens[index]] >= min) {
      const name = tokens[index++], right = expression(precedence[name] + 1);
      left = {kind: 'call', name, args: [left, right]};
    }
    return left;
  }
  const result = expression(0);
  if (index !== tokens.length) throw Error('公式尾部有未解析内容');
  return result;
}

export function displayRuleValue(value: RuleValue): string {
  if (Array.isArray(value)) return value.map(displayRuleValue).join(', ');
  return value === null ? '' : String(value);
}
function numeric(value: RuleValue): number {
  const number = Number(displayRuleValue(value));
  if (!Number.isFinite(number)) throw Error('非有效数值');
  return number;
}
const empty = (v: RuleValue) => v === null || v === false || v === '' || v === 0 || (Array.isArray(v) && !v.length);
export function evaluateFormula(node: Expr, get: GetProperty, variables = new Map<string, RuleValue>()): RuleValue {
  if (node.kind === 'literal') return node.value;
  if (node.kind === 'variable') {
    if (!variables.has(node.name)) throw Error('未定义的公式变量 ' + node.name);
    return variables.get(node.name)!;
  }
  const args = node.args;
  const run = (arg: Expr) => evaluateFormula(arg, get, variables);
  const at = (i: number) => {if (!args[i]) throw Error('公式参数不足'); return run(args[i]);};
  const n = (i: number) => numeric(at(i)), s = (i: number) => displayRuleValue(at(i));
  // Notion numeric ordering with an unset property is false; arithmetic
  // and toNumber have their own coercion rules.
  const compare = (predicate: (a: number, b: number) => boolean) => {
    const a = at(0), b = at(1);
    return a !== null && b !== null && predicate(numeric(a), numeric(b));
  };
  switch (node.name) {
    case 'prop': return get(s(0));
    case 'list': return args.map(run);
    case 'if': return !empty(at(0)) ? at(1) : at(2);
    case 'ifs': {
      for (let i = 0; i + 1 < args.length; i += 2) if (!empty(at(i))) return at(i + 1);
      return args.length % 2 ? at(args.length - 1) : null;
    }
    case 'lets': {
      const scope = new Map(variables);
      if (args.length % 2 !== 1) throw Error('变量绑定不完整');
      for (let i = 0; i + 1 < args.length; i += 2) {
        const binding = args[i]; if (binding.kind !== 'variable') throw Error('无效的变量绑定');
        scope.set(binding.name, evaluateFormula(args[i+1], get, scope));
      }
      return evaluateFormula(args[args.length-1], get, scope);
    }
    case 'empty': return empty(at(0));
    case 'and': return args.every(arg => !empty(run(arg)));
    case 'or': return args.some(arg => !empty(run(arg)));
    case 'not': return empty(at(0));
    case '==': return at(0) === at(1);
    case '!=': return at(0) !== at(1);
    case '>': return compare((a,b) => a > b);
    case '<': return compare((a,b) => a < b);
    case '>=': return compare((a,b) => a >= b);
    case '<=': return compare((a,b) => a <= b);
    case '+': {
      const a = at(0), b = at(1);
      return typeof a === 'string' || typeof b === 'string'
        ? displayRuleValue(a) + displayRuleValue(b) : numeric(a) + numeric(b);
    }
    case '-': return n(0) - n(1);
    case '*': return n(0) * n(1);
    case '/': {const result=n(0) / n(1); if (!Number.isFinite(result)) throw Error('除数为零'); return result;}
    case 'negate': return -n(0);
    case 'abs': return Math.abs(n(0));
    case 'round': return Math.round(n(0));
    case 'max': return Math.max(...args.map(arg => numeric(run(arg))));
    case 'format': case 'style': case 'unstyle': return s(0);
    case 'toNumber': return n(0);
    case 'length': {const value = at(0); return Array.isArray(value) ? value.length : Array.from(displayRuleValue(value)).length;}
    case 'includes': {const value = at(0); if (!Array.isArray(value)) throw Error('includes 需要列表'); return value.includes(at(1));}
    case 'contains': return s(0).includes(s(1));
    case 'substring': return Array.from(s(0)).slice(n(1), args.length > 2 ? n(2) : undefined).join('');
    case 'formatDate': {
      const value = s(0);
      if (s(1) !== 'YYYY-MM' || !/^\d{4}-\d{2}-\d{2}(?:$|T\d{2}:\d{2})/.test(value)) throw Error('仅支持按原始日期取月份');
      return value.slice(0,7);
    }
    default: throw Error('未支持的公式操作 ' + node.name);
  }
}
