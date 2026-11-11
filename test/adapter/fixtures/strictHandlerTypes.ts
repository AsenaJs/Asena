import { join } from 'node:path';
import ts from 'typescript';

// Run as its own process by the type tests: a TypeScript program this size skews the heap
// figures other tests in the shared `bun test` process sample.
const sources: Record<string, string> = {
  handlers: `
  import type { AsenaContext } from '../../../lib/adapter/AsenaContext';
  import type { ErrorHandler, NotFoundHandler, NotFoundRequest } from '../../../lib/adapter/types/ErrorHandler';
  import type { AsenaConfig } from '../../../lib/server/config/AsenaConfig';

  export const onError: ErrorHandler<AsenaContext<any, any>> = async () => undefined;
  export const onNotFound: NotFoundHandler<AsenaContext<any, any>> = async () => undefined;
  export const answers: ErrorHandler<AsenaContext<any, any>> = () => new Response('x');

  export class DecliningConfig implements AsenaConfig {
    public onError(error: Error) {
      return error.message === 'mine' ? new Response('x') : undefined;
    }

    public async onNotFound(_context: AsenaContext<any, any>, request: NotFoundRequest) {
      return request.path === '/mine' ? new Response('x') : undefined;
    }
  }
`,
  'websocket-message': `
  import type { Socket } from '../../../lib/server/web/websocket/AsenaSocket';
  import { AsenaWebSocketService } from '../../../lib/server/web/websocket/AsenaWebSocketService';

  export class Existing extends AsenaWebSocketService<{ userId: string }> {
    protected onMessage(ws: Socket<{ userId: string }>, message: Buffer | string): void {
      void [ws.data.values.userId, message.length];
    }
  }

  export class ExistingAsync extends AsenaWebSocketService {
    protected override async onMessage(_ws: Socket, message: string | Buffer): Promise<void> {
      void message.length;
    }
  }

  export class AsArrayBuffer extends AsenaWebSocketService {
    protected onMessage(ws: Socket, message: string | ArrayBuffer): void {
      ws.binaryType = 'arraybuffer';
      void (typeof message === 'string' ? message.length : message.byteLength);
    }
  }

  export class AsUint8Array extends AsenaWebSocketService {
    protected onMessage(_ws: Socket, message: string | Uint8Array): void {
      void message.length;
    }
  }

  export class AsBlob extends AsenaWebSocketService {
    protected onMessage(_ws: Socket, message: string | Blob): void {
      void (typeof message === 'string' ? message.length : message.size);
    }
  }
`,
};

const name = process.argv[2] ?? 'handlers';
const file = join(import.meta.dir, `__strict-${name}.ts`);
const source = sources[name];

if (source === undefined) {
  throw new Error(`unknown strict fixture '${name}'`);
}

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

host.readFile = (path) => (path === file ? source : readFile(path));
host.fileExists = (path) => path === file || fileExists(path);

const program = ts.createProgram([file], options, host);
const diagnostics = ts
  .getPreEmitDiagnostics(program, program.getSourceFile(file))
  .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));

process.stdout.write(JSON.stringify(diagnostics));
