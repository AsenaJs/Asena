import { join } from 'node:path';
import ts from 'typescript';

// Run as its own process by ErrorHandlerType.test.ts: a TypeScript program this size skews the
// heap figures other tests in the shared `bun test` process sample.
const file = join(import.meta.dir, '__strict-handler-types.ts');
const source = `
  import type { AsenaContext } from '../../../lib/adapter/AsenaContext';
  import type { ErrorHandler, NotFoundHandler } from '../../../lib/adapter/types/ErrorHandler';

  export const onError: ErrorHandler<AsenaContext<any, any>> = async () => undefined;
  export const onNotFound: NotFoundHandler<AsenaContext<any, any>> = async () => undefined;
  export const answers: ErrorHandler<AsenaContext<any, any>> = () => new Response('x');
`;

const options: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  experimentalDecorators: true,
  types: [],
};
const host = ts.createCompilerHost(options);
const readFile = host.readFile.bind(host);
const fileExists = host.fileExists.bind(host);

host.readFile = (name) => (name === file ? source : readFile(name));
host.fileExists = (name) => name === file || fileExists(name);

const program = ts.createProgram([file], options, host);
const diagnostics = ts
  .getPreEmitDiagnostics(program, program.getSourceFile(file))
  .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));

process.stdout.write(JSON.stringify(diagnostics));
