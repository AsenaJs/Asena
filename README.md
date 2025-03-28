# Asena

Asena is a NestJS-like IoC web framework built on top of Hono and Bun. It combines the power of dependency injection
with the performance of Bun runtime and the flexibility of Adapter design system.

## Documentation

For detailed documentation, please visit [not ready yet](https://asena.sh). Documentation is still in progress, but updates are being made regularly.

## Key Features

- **Dependency Injection**: Built-in IoC container for managing dependencies
- **Decorator-based Development**: Similar to NestJS, using TypeScript decorators for routing and DI
- **High Performance**: Leverages Bun runtime for optimal performance
- **WebSocket Support**: Built-in WebSocket handling capabilities
- **Middleware System**: Flexible middleware architecture
- **HTTP Adapters**: Extensible adapter system with Hono as default
- **Zero Dependencies**: Only uses reflect-metadata for dependency injection
- **TypeScript Support**: Full TypeScript support with strict mode
- **Modular Architecture**: Easy to extend and customize

## Installation

```bash
bun add @asenajs/asena
```

## Quick Start

The easiest way to create a new Asena project is using the CLI:

```bash
# Create a new project
bun add -D @asenajs/asena-cli
asena create
```

This will create a new project with the following structure:
```
├── src/
│ ├── controllers/
│ │ └── AsenaController.ts
│ └── index.ts
├── package.json
├── tsconfig.json
├── .eslintrc.js
├── .eslintignore
└── .prettierrc.js
```

Alternatively, you can create a project manually:

First, create a new project using Bun:

```bash
bun init
```

For decorators working properly, you need to add some settings to your tsconfig. Here is a recommended file:

```json
{
  "compilerOptions": {
    // Enable latest features
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,

    // Bundler mode
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,

    // Best practices
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,

    // Some stricter flags
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noPropertyAccessFromIndexSignature": true
  }
}
```

Then, install the required packages:

```bash
bun add @asenajs/asena @asenajs/hono-adapter 
```

Add @asenajs/asena-cli to your package. This package provides a CLI for creating and managing Asena projects.

```bash
bun add -D @asenajs/asena-cli
```

Then, create a new asena-config.ts file using the CLI:

```bash
asena init
```

`Note`: Built options directly copy of bun options, you can check bun documentation for more
options. [Bun Documentation](https://bun.sh/docs/bundler#reference)

Create index.ts file under your src folder:

```typescript
// src/index.ts
import { AsenaServer } from '@asenajs/asena';
import { DefaultLogger } from "@asenajs/asena/logger";
import { createHonoAdapter } from '@asenajs/hono-adapter';

const [adapter, logger] = createHonoAdapter(new DefaultLogger());
await new AsenaServer(adapter)
  .logger(logger)
  .port(3000)
  .start(true);
```

To run asena you need at least one controller. Create a new controller:

```typescript
// src/controllers/TestController.ts
import type { Context } from '@asenajs/hono-adapter';
import { Controller } from '@asenajs/asena/server';
import { Get } from '@asenajs/asena/web';

@Controller('/hello')
export class TestController {
    @Get('/world')
    public async getHello(context: Context) {
        return context.send('Hello World');
    }
}
```

Finally, run the project:

```bash
## only for fast developing purposes
asena dev start
```

```bash
## or you can simply build then run your bundled project
asena build
## then go to dist folder and run the project this way it will consume less memory and it will be faster.
bun index.asena.js
```

## CLI Commands

For more information about CLI commands and usage, please visit:
[Asena CLI Documentation](https://github.com/AsenaJs/Asena-cli/blob/master/README.md)


## Project Structure

```
lib/
├── adapter/     # HTTP adapter implementations
├── server/      # Core server functionality
├── ioc/         # Dependency injection container
├── utils/       # Utility functions
├── test/        # Test utilities
└── logger/      # Logging system
```

## Core Concepts

- **Controllers**: Handle incoming requests using decorators
- **Services**: Business logic containers that can be injected
- **Middleware**: Request/Response interceptors
- **WebSocket**: Built-in WebSocket support
- **HTTP Status**: Standard HTTP status codes and utilities

## Performance

Built on Bun runtime, Asena provides:

- Fast startup time
- Low memory footprint
- Quick request processing
- Efficient WebSocket handling

Here is the benchmark result of Asena with Hono adapter (Basic hello world example) in every test we used bun to run
the project:

### Performance Comparison (Fastest to Slowest)

| Framework                            | Requests/sec | Latency (avg) | Transfer/sec |
| ------------------------------------ | ------------ | ------------- | ------------ |
| Hono                                 | 147,031.08   | 2.69ms        | 18.09MB      |
| Asena + Hono-adapter                 | 137,148.80   | 2.89ms        | 16.74MB      |
| NestJS (Bun + Fastify)               | 81,652.05    | 6.01ms        | 13.78MB      |
| NestJS (Bun)                         | 64,435.83    | 6.14ms        | 11.80MB      |
| NestJS (Bun + kiyasov/platform-hono) | 45,082.27    | 8.79ms        | 5.55MB       |
| NestJS (Node)                        | 17,649.89    | 24.43ms       | 4.02MB       |

> Benchmark conditions:
>
> - 12 threads
> - 400 connections
> - 120 seconds duration
> - Simple "Hello World" endpoint
> - Running on same hardware

_Note: Lower latency and higher requests/sec indicate better performance_

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions, please open an issue on the [GitHub repository](https://github.com/AsenaJs/Asena/issues).
