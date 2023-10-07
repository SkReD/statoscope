import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { Readable, Writable } from 'stream';
import open from 'open';
import { stringifyStream } from '@discoveryjs/json-ext';
import { Compilation, Compiler } from 'webpack';
import statsPackage from '@statoscope/stats/package.json';
import WebpackCompressedExtension from '@statoscope/webpack-stats-extension-compressed';
import WebpackPackageInfoExtension from '@statoscope/webpack-stats-extension-package-info';
import { CompressFunction } from '@statoscope/stats-extension-compressed/dist/generator';
import normalizeCompilation from '@statoscope/webpack-model/dist/normalizeCompilation';
import { StatoscopeMeta } from '@statoscope/webpack-model/webpack';
import { makeReplacer, transform } from '@statoscope/report-writer/dist/utils';
import { default as CustomReportsExtensionGenerator } from '@statoscope/stats-extension-custom-reports/dist/generator';
import { Report } from '@statoscope/types/types/custom-report';
import { StatsExtensionWebpackAdapter } from '@statoscope/webpack-model';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name, version } = require('../package.json');

export const STATOSCOPE_STAGE_COMPILER_DONE = 5000;

const pluginName = `${name}@${version}`;

export type Options = {
  name?: string;
  saveReportTo?: string;
  // todo statoscope 6: remove
  saveTo?: string;
  saveStatsTo?: string;
  normalizeStats?: boolean;
  saveOnlyStats: boolean;
  disableReportCompression?: boolean;
  additionalStats: string[];
  statsOptions?: Record<string, unknown>;
  watchMode: boolean;
  open: false | 'dir' | 'file';
  compressor: false | 'gzip' | CompressFunction;
  reports?: Report<unknown, unknown>[];
  extensions: StatsExtensionWebpackAdapter<unknown>[];
};

export default class StatoscopeWebpackPlugin {
  options: Options;
  extensions: StatsExtensionWebpackAdapter<unknown>[] = [];

  constructor(options: Partial<Options> = {}) {
    this.options = {
      open: 'file',
      compressor: 'gzip',
      additionalStats: [],
      saveOnlyStats: false,
      watchMode: false,
      reports: [],
      extensions: [],
      ...options,
    };

    if (this.options.saveOnlyStats) {
      this.options.open = false;
    }

    this.options.saveReportTo ??= this.options.saveTo;
    this.extensions.push(...(this.options.extensions ?? []));

    this.extensions.push(new WebpackPackageInfoExtension());
    if (this.options.compressor !== false) {
      this.extensions.push(new WebpackCompressedExtension(this.options.compressor));
    }
  }

  interpolate(string: string, compilation: Compilation, customName?: string): string {
    return string
      .replace(/\[name]/gi, customName || compilation.name || 'unnamed')
      .replace(/\[hash]/gi, compilation.hash || 'unknown');
  }

  apply(compiler: Compiler): void {
    const { options } = this;
    const context =
      options.statsOptions?.context ??
      // @ts-ignore
      compiler.options.stats?.context ??
      compiler.context;

    for (const extension of this.extensions) {
      extension.handleCompiler(compiler, context);
    }

    compiler.hooks.done.tapAsync(
      { stage: STATOSCOPE_STAGE_COMPILER_DONE, name: pluginName },
      async (stats, cb) => {
        if (compiler.watchMode && !options.watchMode) {
          return cb();
        }

        // @ts-ignore
        const statsObj = stats.toJson(options.statsOptions || compiler.options.stats);
        statsObj.name = options.name || statsObj.name || stats.compilation.name;

        const statoscopeMeta: StatoscopeMeta = {
          descriptor: { name: statsPackage.name, version: statsPackage.version },
          extensions: [],
          context,
        };
        statsObj.__statoscope = statoscopeMeta;

        for (const extension of this.extensions) {
          statoscopeMeta.extensions!.push(extension.getExtension());
        }

        const reports = this.options.reports ?? [];

        if (reports.length) {
          const generator = new CustomReportsExtensionGenerator();

          for (const report of reports) {
            if (typeof report.data === 'function') {
              report.data = await report.data();
            }

            generator.handleReport(report);
          }

          statoscopeMeta.extensions!.push(generator.get());
        }

        if (options.normalizeStats) {
          normalizeCompilation(statsObj);
        }

        const webpackStatsStream = stringifyStream(
          statsObj,
          makeReplacer(context, '.', ['context', 'source'])
        );
        let statsFileOutputStream: Writable | undefined;
        let resolvedSaveStatsTo: string | undefined;

        if (options.saveStatsTo) {
          resolvedSaveStatsTo = path.resolve(
            this.interpolate(options.saveStatsTo, stats.compilation, statsObj.name)
          );
          fs.mkdirSync(path.dirname(resolvedSaveStatsTo), { recursive: true });
          statsFileOutputStream = fs.createWriteStream(resolvedSaveStatsTo);
          webpackStatsStream.pipe(statsFileOutputStream);
          await waitStreamEnd(statsFileOutputStream);
        }

        if (!options.normalizeStats) {
          normalizeCompilation(statsObj);
        }

        const statsForReport = this.getStatsForHTMLReport({
          filename: resolvedSaveStatsTo,
          stream: stringifyStream(
            statsObj,
            makeReplacer(context, '.', ['context', 'source'])
          ),
        });
        const htmlReportPath = this.getHTMLReportPath();
        const resolvedHTMLReportPath = path.resolve(
          this.interpolate(htmlReportPath, stats.compilation, statsObj.name)
        );

        try {
          await this.makeReport(resolvedHTMLReportPath, statsForReport);

          if (options.open) {
            if (options.open === 'file') {
              open(resolvedHTMLReportPath);
            } else {
              open(path.dirname(resolvedHTMLReportPath));
            }
          }

          cb();
        } catch (e) {
          cb(e as Error);
        }
      }
    );
  }

  getStatsForHTMLReport(mainStats: {
    filename?: string;
    stream: Readable;
  }): Array<{ filename: string; stream: Readable }> {
    const mainStatsFilename = mainStats.filename
      ? path.basename(mainStats.filename)
      : 'stats.json';

    return [
      {
        filename: mainStatsFilename,
        stream: mainStats.stream,
      },
      ...this.options.additionalStats
        .map((statsPath) => {
          const filename = path.resolve(statsPath);
          return { filename, stream: fs.createReadStream(filename) };
        })
        .filter(({ filename }) => filename !== mainStatsFilename),
    ];
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types,@typescript-eslint/explicit-function-return-type
  makeReport(outputPath: string, stats: Array<{ filename: string; stream: Readable }>) {
    if (this.options.saveOnlyStats) {
      return { writer: null, stream: null };
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    return transform(
      {
        writer: {
          scripts: [{ type: 'path', path: require.resolve('@statoscope/webpack-ui') }],
          init: `function (data) {
            Statoscope.default(data.map((item) => ({ name: item.id, data: item.data })));
          }`,
          dataCompression: this.options.disableReportCompression !== true,
        },
      },
      stats.map((value) => {
        return {
          type: 'stream',
          filename: value.filename,
          stream: value.stream,
        };
      }),
      outputPath
    );
  }

  getHTMLReportPath(): string {
    const defaultReportName = `statoscope-[name]-[hash].html`;

    if (this.options.saveReportTo) {
      if (this.options.saveReportTo.endsWith('.html')) {
        return this.options.saveReportTo;
      }

      return path.join(this.options.saveReportTo, defaultReportName);
    }

    return path.join(tmpdir(), defaultReportName);
  }
}

async function waitStreamEnd(stream?: Writable | null): Promise<void> {
  if (!stream) {
    return;
  }

  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}
