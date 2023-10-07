// todo remove in 6.0
import fs from 'fs';
import path from 'path';
import { parseChunked } from '@discoveryjs/json-ext';
import { prepareWithJora } from '@statoscope/webpack-model';
import { jora as joraHelpers } from '@statoscope/helpers';
import { NormalizedFile, RawStatsFileDescriptor } from '@statoscope/webpack-model/types';

export type TestEntryType = 'error' | 'warn' | 'info';
export type TestEntry = {
  type?: TestEntryType; // 'error' by default
  assert?: boolean; // false by default
  message: string;
  filename?: string;
};

export type Data = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  files: Object[];
  // eslint-disable-next-line @typescript-eslint/ban-types
  compilations: Object[];
  query: (query: string, data?: NormalizedFile[]) => unknown; // query-parameter is jora-syntax query
};

export type API = {
  error(message: string, filename?: string): void;
  warn(message: string, filename?: string): void;
  info(message: string, filename?: string): void;
};

export type ValidatorFn = (data: Data, api: API) => Promise<string | void>;

function makeQueryValidator(query: string): ValidatorFn {
  function validate(type?: string, message?: string): void {
    if (!(!type || type === 'error' || type === 'warn' || type === 'info')) {
      throw new Error(`Unknown message type [${type}]`);
    }

    if (!message) {
      throw new Error(`Message must be specified`);
    }
  }

  function callAPI(api: API, { type, filename, message }: TestEntry): void {
    validate(type, message);

    if (typeof type === 'undefined' || type === 'error') {
      api.error(message, filename);
    } else if (type === 'warn') {
      api.warn(message, filename);
    } else if (type === 'info') {
      api.info(message, filename);
    } else {
      console.log('Unknown message type:', type);
      api.error(message, filename);
    }
  }

  return async (data, api): Promise<void> => {
    const result = data.query(query) as TestEntry[];

    for (const item of result) {
      let type: TestEntryType | undefined = item.type;

      if (!item.assert) {
        if (type === undefined && !Object.prototype.hasOwnProperty.call(item, 'assert')) {
          type = 'info';
        }

        callAPI(api, { type, message: item.message, filename: item.filename });
      }
    }
  };
}

function handleValidator(validator: string): ValidatorFn {
  const validatorPath = path.resolve(validator);
  const ext = path.extname(validatorPath);
  let validatorFn: string | ValidatorFn;

  if (ext === '.js') {
    validatorFn = require(validatorPath);
  } else {
    validatorFn = fs.readFileSync(validatorPath, 'utf8');
  }

  if (typeof validatorFn === 'string') {
    validatorFn = makeQueryValidator(validatorFn);
  }

  return validatorFn;
}

export default async function (argv: {
  input: string[];
  validator: string;
  warnAsError?: boolean;
}): Promise<void> {
  const files: RawStatsFileDescriptor[] = [];
  for (const file of argv.input) {
    const data = await parseChunked(fs.createReadStream(file));
    files.push({
      name: path.basename(file),
      data,
    });
  }
  const prepared = prepareWithJora(files, { helpers: joraHelpers() });
  const validator = handleValidator(argv.validator);
  const storage: { [key: string]: TestEntry[] } = {};
  let hasErrors = false;
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  const api: API = {
    warn(message, filename = 'unknown') {
      if (argv.warnAsError) {
        hasErrors = true;
      }

      storage[filename] = storage[filename] || [];
      storage[filename].push({ type: 'warn', filename, message });
      warnings++;
    },
    error(message, filename = 'unknown') {
      hasErrors = true;
      storage[filename] = storage[filename] || [];
      storage[filename].push({ type: 'error', filename, message });
      errors++;
    },
    info(message, filename = 'unknown') {
      storage[filename] = storage[filename] || [];
      storage[filename].push({ type: 'info', filename, message });
      infos++;
    },
  };

  await validator(
    {
      files: prepared.files,
      compilations: prepared.compilations,
      query: prepared.query,
    },
    api,
  );

  for (const [filename, items] of Object.entries(storage)) {
    console.log(filename);

    for (const item of items) {
      console.log(`  ${item.type}: ${item.message}`);
    }
  }

  console.log('');

  if (errors) {
    console.log(`Errors: ${errors}`);
  }

  if (warnings) {
    console.log(`Warnings: ${warnings}`);
  }
  if (infos) {
    console.log(`Info: ${infos}`);
  }

  console.log('Done');

  if (hasErrors) {
    // eslint-disable-next-line no-process-exit
    process.exitCode = 1;
  }
}
