# Asena

Asena is a NestJS-like IoC web framework built on top of Hono and Bun. It combines the power of dependency injection
with the performance of Bun runtime and the flexibility of Hono web framework.

## Documentation

For detailed documentation, please visit [not ready yet](https://asena.sh). Documentation is still in progress, but updates are being made regularly.

## Key Features

- **Dependency Injection**: Built-in IoC container for managing dependencies
- **Decorator-based Development**: Similar to NestJS, using TypeScript decorators for routing and DI
- **High Performance**: Leverages Bun runtime for optimal performance
- **WebSocket Support**: Built-in WebSocket handling capabilities
- **Middleware System**: Flexible middleware architecture
- **HTTP Adapters**: Extensible adapter system with Hono as default

## Quick Start

First, create a new project using Bun:

```bash
bun init
````

For decorators working properly, you need to add some settings to your tsconfig. Here is an recommended file:
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
    "strict": false,
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

bun add @asenajs/asena hono winston
```
Add @asenajs/asena-cli to your package. This package provides a CLI for creating and managing Asena projects.

```bash
bun add -D @asenajs/asena-cli
````


Then, create a new .asenarc.json file using the CLI:

```bash

## Creates a .asenarc.json file with default values (requires manual updates). Source folder is 'src'.
asena-cli init
```

`Note`: Built options directly copy of bun options, you can check bun documentation for more
options. [Bun Documentation](https://bun.sh/docs/bundler#reference)

Create index.ts file under your src folder:

```typescript
// src/index.ts
import {AsenaServer, DefaultLogger} from "@asenajs/asena";

await new AsenaServer().logger(new DefaultLogger()).port(3000).start();
```

To run asena you need at least one controller. Create a new controller:

```typescript
// src/controllers/TestController.ts
import {type Context, Controller, Get} from "@asenajs/asena";

@Controller("/hello")
export class TestController {

    @Get("/world")
    public async getHello(context: Context) {
        return context.send("Hello World");
    }
}
```

Finally, run the project:

```bash

## only for fast developing purposes
asena-cli dev start 
````
```bash
## or you can simply build then run your bundled project
asena-cli build
## then go to dist folder and run the project this way it will consume less memory 
bun index.asena.js
```

## Example

Here is a simple example of a controller with service and middleware:

### Middleware
This middleware sets a value to the context object.
```typescript
// src/middleware/TestMiddleware.ts
import {type Context, Middleware, MiddlewareService} from "@asenajs/asena";

@Middleware()
export class TestMiddleware extends MiddlewareService {

    public handle(context: Context, next: Function) {
        context.setValue("testValue", "test");

        next();
    }
}
```

### Service
Basic service with a getter and setter.

```typescript
import {Service} from "@asenajs/asena";

@Service()
export class HelloService {

    private _foo: string = "bar";

    public get foo(): string {
        return this._foo;
    }

    public set foo(value: string) {
        this._foo = value;
    }
}

```

### Controller
Controller with a GET route that uses the middleware and service.

```typescript
// src/controller/TestController.ts
import {type Context, Controller, Get, Inject} from "@asenajs/asena";
import {HelloService} from "../service/HelloService.ts";
import {TestMiddleware} from "../middleware/TestMiddleware.ts";

@Controller("/v1")
export class TestController {

    @Inject(HelloService)
    private helloService: HelloService

    @Get("foo")
    public async getFoo(context: Context) {
        return context.send(this.helloService.foo);
    }

    @Get({path: "world", middlewares: [TestMiddleware]})
    public async getHello(context: Context) {
        const testValue: string = context.getValue("testValue");

        return context.send(testValue);
    }
}
```

### Index
The main file that starts the server.

```typescript
// src/index.ts
import {AsenaServer, DefaultLogger} from "@asenajs/asena";

await new AsenaServer().logger(new DefaultLogger()).port(3000).start();
```

then run
```bash
asena-cli dev start
```

You should see the following output:
```text

Build completed successfully.  
2024-11-19 17:58:35 [info]:     
    ___    _____  ______ _   __ ___ 
   /   |  / ___/ / ____// | / //   |
  / /| |  \__ \ / __/  /  |/ // /| |
 / ___ | ___/ // /___ / /|  // ___ |
/_/  |_|/____//_____//_/ |_//_/  |_|  
                             
2024-11-19 17:58:35 [info]:     IoC initialized 
2024-11-19 17:58:35 [info]:     No server services found 
2024-11-19 17:58:35 [info]:     Controller: V1 found 
2024-11-19 17:58:35 [info]:     Successfully registered GET route for PATH: /v1/foo 
2024-11-19 17:58:35 [info]:     Successfully registered GET route for PATH: /v1/world 
2024-11-19 17:58:35 [info]:     No websockets found 
2024-11-19 17:58:35 [info]:     Server started on port 3000 
```

and you see the result on your browser [http://localhost:3000/v1/foo](http://localhost:3000/v1/foo) with "bar" message.

`Note`: For more example, you can check this project [Example](https://github.com/LibirSoft/AsenaExample).

## Core Concepts

- **Controllers**: Handle incoming requests using decorators
- **Services**: Business logic containers that can be injected
- **ServerSrvices**: Server-wide services that can be injected (e.g. Database)
- **Middleware**: Request/Response interceptors
- **Adapters**: Framework adapters (default: Hono)
- **WebSocket**: Real-time communication support
- **Validators**: Request validation system

## Architecture

Asena follows a modular architecture with:

- IoC Container for dependency management
- Adapter pattern for framework integration
- Decorator-based routing system
- Middleware pipeline
- WebSocket integration
- Context management

## Performance

Built on Bun runtime and Hono, Asena provides:

- Fast startup time
- Low memory footprint
- Quick request processing
- Efficient WebSocket handling

and here is the benchmark result of Asena with Hono adapter(Basic hello world example) in every test we used bun to run
the project:

### Performance Comparison (Fastest to Slowest)

| Framework                            | Requests/sec | Latency (avg) | Transfer/sec |
|--------------------------------------|--------------|---------------|--------------|
| Hono                                 | 147,031.08   | 2.69ms        | 18.09MB      |
| Asena                                | 137,148.80   | 2.89ms        | 16.74MB      |
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
