// CI 脚本共用的严格命令行解析：未知参数、缺值、空值、非数字一律报错。
// 这里的存在意义就是挡住 `--module ""` 这类调用：空字符串不是“没传”。

export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}

export type FlagKind = 'string' | 'number' | 'boolean';

export interface FlagSpec {
  readonly kind: FlagKind;
  readonly required?: boolean;
  readonly valueName?: string;
  readonly description?: string;
}

export type FlagValues = Record<string, string | number | boolean>;

export interface ParsedArgs {
  readonly flags: FlagValues;
  readonly positionals: readonly string[];
}

const isFlag = (arg: string): boolean => arg.startsWith('--') && arg.length > 2;

/** `--name value`、`--name=value` 两种写法都支持；布尔只允许 `--name`。 */
export const parseArgs = (argv: readonly string[], spec: Record<string, FlagSpec>): ParsedArgs => {
  const flags: FlagValues = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) break;
    if (!isFlag(arg)) {
      positionals.push(arg);
      continue;
    }

    const equals = arg.indexOf('=');
    const name = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
    const definition = spec[name];
    if (!definition) throw new CliError(`未知参数 --${name}`);
    if (name in flags) throw new CliError(`参数 --${name} 重复`);

    if (definition.kind === 'boolean') {
      if (equals !== -1) throw new CliError(`布尔参数 --${name} 不接受值`);
      flags[name] = true;
      continue;
    }

    const inline = equals === -1 ? undefined : arg.slice(equals + 1);
    const value = inline ?? argv[i + 1];
    if (value === undefined || (inline === undefined && isFlag(value))) {
      throw new CliError(`参数 --${name} 需要一个${definition.kind === 'number' ? '数字' : '值'}`);
    }
    if (value === '') throw new CliError(`参数 --${name} 不能为空字符串`);
    if (definition.kind === 'number') {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new CliError(`参数 --${name} 需要数字，收到 ${value}`);
      flags[name] = parsed;
    } else {
      flags[name] = value;
    }
    if (inline === undefined) i += 1;
  }

  for (const [name, definition] of Object.entries(spec)) {
    if (definition.required && !(name in flags)) throw new CliError(`缺少必需参数 --${name}`);
  }
  return { flags, positionals };
};

export const requireString = (parsed: ParsedArgs, name: string): string => {
  const value = parsed.flags[name];
  if (typeof value !== 'string') throw new CliError(`参数 --${name} 未提供`);
  return value;
};

export const requireNumber = (parsed: ParsedArgs, name: string): number => {
  const value = parsed.flags[name];
  if (typeof value !== 'number') throw new CliError(`参数 --${name} 未提供`);
  return value;
};

export const optionalString = (parsed: ParsedArgs, name: string): string | undefined => {
  const value = parsed.flags[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new CliError(`参数 --${name} 必须是字符串`);
  return value;
};

export const expectPositionals = (
  parsed: ParsedArgs,
  count: number,
  synopsis: string,
): string[] => {
  if (parsed.positionals.length !== count) {
    throw new CliError(
      `需要 ${count} 个位置参数，实际 ${parsed.positionals.length}\n用法: ${synopsis}`,
    );
  }
  return [...parsed.positionals];
};

export const renderUsage = (synopsis: string, spec: Record<string, FlagSpec>): string => {
  const lines = [`用法: ${synopsis}`];
  for (const [name, definition] of Object.entries(spec)) {
    const value = definition.kind === 'boolean' ? '' : ` <${definition.valueName ?? 'value'}>`;
    const required = definition.required ? ' (必需)' : '';
    const description = definition.description ? `  ${definition.description}` : '';
    lines.push(`  --${name}${value}${required}${description}`);
  }
  return lines.join('\n');
};

/** CLI 入口统一用它包一层：只把可读错误打到 stderr，不带堆栈。 */
export const runCli = (main: () => void | Promise<void>): void => {
  Promise.resolve()
    .then(main)
    .catch((error: unknown) => {
      if (error instanceof CliError) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 2;
        return;
      }
      throw error;
    });
};
