import open from 'open';
import { Argv } from 'yargs';
import { requireConfig } from '@statoscope/config';
import {
  createDestStatReportPath,
  combineCustomReports,
  transform,
  TransformFrom,
} from '../utils';

export default function (yargs: Argv): Argv {
  return yargs.command(
    'generate [input]',
    `Generate HTML report from JSON-stats
Examples:
Single stats: generate path/to/stats.json --output path/to/report.html
Multiple stats: generate --input path/to/stats-1.json path/to/stats-2.json --output path/to/report.html`,
    (yargs) => {
      return yargs
        .positional('input', {
          describe: 'path to a current stats.json',
          alias: 'i',
          type: 'string',
        })
        .option('reference', {
          describe: 'path to stats.json to diff with (e.g. master-branch stats)',
          alias: 'r',
          type: 'string',
        })
        .option('config', {
          describe: 'path to statoscope config',
          alias: 'c',
          type: 'string',
        })
        .option('custom-report', {
          describe: 'path to json-file(s) with custom user report(s)',
          type: 'string',
        })
        .positional('output', {
          describe: 'path to a report.html',
          alias: 't',
          type: 'string',
        })
        .option('open', {
          describe: 'open report after done',
          alias: 'o',
        })
        .option('compression', {
          describe: 'use report compression',
          type: 'boolean',
          default: true,
        })
        .array(['input', 'custom-report'])
        .demandOption('input');
    },
    async (argv) => {
      argv.output = createDestStatReportPath(argv.input, argv.output);
      const files: Array<TransformFrom | string> = [];

      if (argv.reference) {
        if (argv.input.length > 1) {
          console.log(`When reference arg is specified then only first import is used`);
        }

        files.push({ name: argv.input[0], as: 'input.json' });
        files.push({ name: argv.reference, as: 'reference.json' });
      } else {
        files.push(...argv.input);
      }

      const { config } = requireConfig(argv.config);

      const customReports = combineCustomReports(config, argv['custom-report']);

      console.log(`Generating Statoscope report to ${argv.output} ...`);
      await transform(files, argv.output, customReports, argv.compression);
      console.log(`Statoscope report saved to ${argv.output}`);

      if (argv.open) {
        open(argv.output);
      }
    },
  );
}
