import path from 'path';
// @ts-ignore
import jora from 'jora';
import semverDiff from 'semver/functions/diff';
import semverGT from 'semver/functions/gt';
import semverGTE from 'semver/functions/gte';
import semverLT from 'semver/functions/lt';
import semverLTE from 'semver/functions/lte';
import semverEQ from 'semver/functions/eq';
import semverParse from 'semver/functions/parse';
import semverSatisfies from 'semver/functions/satisfies';
import { Range, SemVer } from 'semver';
import networkTypeList, { bytesInMBit, Item } from '../network-type-list';
import Graph, { Node as GraphNode, PathSolution } from '../graph';
import { colorFromH, colorMap, fileTypeMap, generateColor } from './colors';
import { pluralEng, pluralRus } from './plural';

export interface BaseDiffItem {
  id?: string;
  title?: string;
}

export interface TimeDiffItem extends BaseDiffItem {
  type: 'time';
  a: number;
  b: number;
}

export interface SizeDiffItem extends BaseDiffItem {
  type: 'size';
  a: number;
  b: number;
}

export interface NumberDiffItem extends BaseDiffItem {
  type: 'number';
  a: number;
  b: number;
  plural?: { words: string[] };
}

export interface VersionDiffItem extends BaseDiffItem {
  type: 'version';
  a: string;
  b: string;
}

export type Limit =
  | { type: 'absolute'; number: number }
  | { type: 'percent'; number: number };

export type ValueDiff = {
  absolute: number;
  percent: number;
};

export type SerializedStringOrRegexp =
  | {
      type: 'string';
      content: string;
    }
  | {
      type: 'regexp';
      content: string;
      flags: string;
    };

const identityFn = (arg: unknown): unknown => arg;

export type DiffItem = TimeDiffItem | SizeDiffItem | NumberDiffItem | VersionDiffItem;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
export default function helpers() {
  const helpers = {
    stringify: JSON.stringify,
    typeof(value: unknown): string {
      return typeof value;
    },
    isNullish(value: unknown): boolean {
      return value == null;
    },
    isArray(value: unknown): boolean {
      return Array.isArray(value);
    },
    useNotNullish<T>(values: readonly T[]): T | null {
      for (const value of values) {
        if (value != null) {
          return value;
        }
      }

      return null;
    },
    serializeStringOrRegexp(value?: string | RegExp): SerializedStringOrRegexp | null {
      if (value == null) {
        return null;
      }

      if (value instanceof RegExp) {
        return { type: 'regexp', content: value.source, flags: value.flags };
      }

      return { type: 'string', content: value };
    },
    deserializeStringOrRegexp(
      value?: SerializedStringOrRegexp | null
    ): string | RegExp | null {
      if (value == null) {
        return null;
      }

      if (value.type === 'regexp') {
        return new RegExp(value.content, value.flags);
      }

      return value.content;
    },
    toNumber(str: string): number {
      return parseInt(str, 10);
    },
    formatSize(value: number): string {
      const sign = Math.sign(value);
      value = Math.abs(value);

      if (isFinite(value)) {
        if (value < 1000 * 1000) {
          return (sign * (value / 1024)).toFixed(2) + ' kb';
        }

        return (sign * (value / 1024 / 1024)).toFixed(2) + ' mb';
      }
      return 'n/a';
    },
    formatDate(
      ts: number,
      locale?: string | string[],
      options?: Intl.DateTimeFormatOptions
    ): string {
      return new Date(ts).toLocaleString(locale, options);
    },
    formatDuration(ms: number): string {
      const sign = Math.sign(ms);
      ms = Math.abs(ms);

      if (isFinite(ms)) {
        if (ms < 1000) {
          return (sign * ms).toFixed(0) + ' ms';
        }

        return (sign * (ms / 1000)).toFixed(1) + ' sec';
      }
      return 'n/a';
    },
    percentFrom(a: number, b: number, toFixed?: number): number {
      if (a && !b) {
        return 100;
      }

      if (!a && !b) {
        return 0;
      }

      const p = (a / b - 1) * 100;

      if (typeof toFixed !== 'undefined') {
        return Number(p.toFixed(toFixed));
      }

      return p;
    },
    toFixed(value: number, digits = 2): string {
      return value.toFixed(digits);
    },
    color: (value: string): string =>
      colorMap[value] ? colorMap[value].color : generateColor(value),
    fileExt: (value?: string): string => {
      if (value == null) {
        return '';
      }

      return path.extname(value);
    },
    fileType: (value?: string): string => {
      if (value == null) {
        return '';
      }

      const extname = path.extname(value);
      return fileTypeMap[extname] || extname;
    },
    toMatchRegexp: (value: string, rx: RegExp): boolean => rx.test(value),
    toRegexp: (value: string): RegExp => new RegExp(`(${value})`),
    colorFromH: colorFromH,
    plural(value: number, words: string[]): string {
      return pluralEng.plural(value, words);
    },
    pluralWithValue(value: number, words: string[]): string {
      return pluralEng.pluralWithValue(value, words);
    },
    pluralRus(value: number, words: string[]): string {
      return pluralRus.plural(value, words);
    },
    pluralWithValueRus(value: number, words: string[]): string {
      return pluralRus.pluralWithValue(value, words);
    },
    getNetworkTypeInfo(networkType: string): Item | null {
      return networkTypeList.find((item) => item.name === networkType) ?? null;
    },
    getNetworkTypeName(networkType: Item): string | null {
      return `${networkType.type}: ${networkType.name} (${parseFloat(
        (networkType.typicalSpeed / bytesInMBit).toFixed(1)
      )} MBit/s)`;
    },
    getDownloadTime(size: number, networkType: string): number {
      const item = networkTypeList.find((item) => item.name === networkType);

      if (item) {
        return (size / item.typicalSpeed) * 1000;
      }

      throw new Error(`Unknown network type ${networkType}`);
    },

    semverGT(a: string, b: string): boolean {
      return semverGT(a, b);
    },
    semverGTE(a: string, b: string): boolean {
      return semverGTE(a, b);
    },
    semverLT(a: string, b: string): boolean {
      return semverLT(a, b);
    },
    semverLTE(a: string, b: string): boolean {
      return semverLTE(a, b);
    },
    semverEQ(a: string, b: string): boolean {
      return semverEQ(a, b);
    },
    semverDiff(a: string, b: string): string | null {
      return semverDiff(a, b);
    },
    semverParse(version?: string): SemVer | null {
      return semverParse(version);
    },
    semverSatisfies(version: string | SemVer, range: string | Range): boolean {
      return semverSatisfies(version, range);
    },

    formatDiff(value: DiffItem): string {
      if (value.type === 'size') {
        return helpers.formatSize(value.b - value.a);
      }

      if (value.type === 'time') {
        return helpers.formatDuration(value.b - value.a);
      }

      if (value.type === 'version') {
        const diff = semverDiff(value.a, value.b);
        const type = semverGT(value.a, value.b) ? 'downgrade' : 'upgrade';

        return diff ? `${diff} ${type} from ${value.a}` : '';
      }

      if (value.plural?.words) {
        return helpers.pluralWithValue(value.b - value.a, value.plural.words);
      }

      return (value.b - value.a).toString();
    },

    isMatch(a?: string, b?: string | RegExp): boolean {
      if (!a || !b) {
        return a === b;
      }

      return b instanceof RegExp ? b.test(a) : a === b;
    },

    exclude<TItem>(
      items: readonly TItem[],
      params?: {
        exclude?: Array<string | RegExp>;
        get?: (arg: TItem) => string | undefined;
      }
    ): TItem[] {
      return items.filter((item) => {
        for (const excludeItem of params?.exclude ?? []) {
          const getter = params?.get ?? identityFn;
          const value = getter(item);

          if (this.isMatch(value as string, excludeItem)) {
            return false;
          }
        }

        return true;
      });
    },

    graph_getNode<TData>(id?: string, graph?: Graph<TData>): GraphNode<TData> | null {
      return graph?.getNode(id!) ?? null;
    },

    graph_getPaths<TData>(
      from?: GraphNode<TData>,
      graph?: Graph<TData>,
      to?: GraphNode<TData>,
      max = Infinity
    ): PathSolution<TData> | null {
      if (!from || !to || !graph) {
        return null;
      }

      return graph.findPaths(from, to, max);
    },

    diff_normalizeLimit(limit?: number | Limit | null): Limit | null {
      return typeof limit === 'number'
        ? { type: 'absolute', number: limit }
        : limit ?? null;
    },

    diff_isLTETheLimit(valueDiff: ValueDiff, limit?: number | Limit | null): boolean {
      const normalizedLimit = this.diff_normalizeLimit(limit);

      return (
        !normalizedLimit ||
        (normalizedLimit.type === 'absolute'
          ? valueDiff.absolute <= normalizedLimit.number
          : valueDiff.percent <= normalizedLimit.number)
      );
    },
  };

  return helpers;
}

export type Prepared = {
  query: (query: string, data?: unknown, context?: unknown) => unknown;
};

export type Options = {
  helpers?: Record<string, unknown>;
};

export function prepareWithJora(input: unknown, options: Options = {}): Prepared {
  const j = jora.setup({
    methods: {
      ...helpers(),
      ...options.helpers,
    },
  });

  const rootContext = {};

  return {
    query: (
      query: string,
      data: unknown = input,
      context: unknown = rootContext
    ): unknown => j(query)(data || input, context),
  };
}
