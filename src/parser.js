// @flow strict-local

import debug from 'debug';
import stripAnsi from 'strip-ansi';
import ignore, { type Ignore } from 'ignore';

type Options = {
  ignoreFiles: $ReadOnlyArray<string>,
  includeFiles: $ReadOnlyArray<string>,
};

const log = debug('check-flow:parser');

const ERROR_MATCHING_REGEX = /^(Error|Warning) [-┈]+ (.+):(\d+):(\d+)/;
const FOUND_ERRORS_REGEX = /Found \d+ errors?/;

/**
 * The Parser for the flow output.
 *
 * @author Henri Beck
 */
export default class Parser {
  /**
   * The ignored files.
   */
  ignoreFiles: Ignore = ignore();

  /**
   * The included files.
   */
  includeFiles: Ignore = ignore();

  /**
   * The actual errors which should be included.
   */
  errors: $ReadOnlyArray<string> = [];

  /**
   * The actual warnings which should be included.
   */
  warnings: $ReadOnlyArray<string> = [];

  /**
   * The lines which are currently being processed.
   */
  lines: $ReadOnlyArray<string> = [];

  /**
   * Initialize some constants.
   *
   * @param {Object} options - The options for the parser.
   * @param {String[]} options.ignoreFiles - The files to ignore.
   * Defaults to node_modules/.
   * @param {String[]} options.includeFiles - The files to only include in the output.
   * Defaults to *.
   */
  constructor(options: Options) {
    this.ignoreFiles.add(options.ignoreFiles);
    this.includeFiles.add(options.includeFiles);
  }

  parse(stdout: string) {
    this.lines = stdout.split('\n');

    // eslint-disable-next-line fp/no-loops
    while (this.lines.length > 0) {
      const line = this.getCurrentLine();

      if (FOUND_ERRORS_REGEX.test(stripAnsi(line))) {
        this.lines = [];

        // Stop the loop
        break;
      }

      const match = stripAnsi(line).match(ERROR_MATCHING_REGEX);

      if (match) {
        const [, type, file] = match;

        this.handleErrorLine(
          type,
          file.trim(),
          this.getErrorLines([line]),
        );
      }
    }
  }

  handleErrorLine(type: string, file: string, lines: $ReadOnlyArray<string>) {
    if (this.includeError(file)) {
      if (type === 'Error') {
        this.errors = [
          ...this.errors,
          lines.join('\n'),
        ];
      } else if (type === 'Warning') {
        this.warnings = [
          ...this.warnings,
          lines.join('\n'),
        ];
      } else {
        log('Unknown type', type);
      }
    }
  }

  getErrorLines(lines: $ReadOnlyArray<string>) {
    const isNextError = ERROR_MATCHING_REGEX.test(stripAnsi(this.lines[0]));
    const isFoundErrorsLine = FOUND_ERRORS_REGEX.test(stripAnsi(this.lines[0]));

    if (isNextError || isFoundErrorsLine) {
      return lines;
    }

    return this.getErrorLines([
      ...lines,
      this.getCurrentLine(),
    ]);
  }

  includeError(filepath: string) {
    log('Found error in file:', filepath);

    // Ignore the error when the file path is in the ignored files
    if (this.ignoreFiles.ignores(filepath)) {
      log('Ignoring error in file:', filepath, 'because it\'s an ignored file');

      return false;
    }

    if (!this.includeFiles.ignores(filepath)) {
      log('Ignoring error in file:', filepath, 'because it\'s not an included file');

      return false;
    }

    return true;
  }

  getCurrentLine() {
    const [line, ...rest] = this.lines;

    this.lines = rest;

    return line;
  }

  getReport() {
    return {
      errors: this.errors,
      warnings: this.warnings,
    };
  }
}
