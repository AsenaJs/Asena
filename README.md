# Asena

Asena is a NestJS-like IoC web framework built on top of Hono and Bun. It combines the power of dependency injection with the performance of Bun runtime and the flexibility of Hono web framework.

## Key Features

- **Dependency Injection**: Built-in IoC container for managing dependencies
- **Decorator-based Development**: Similar to NestJS, using TypeScript decorators for routing and DI
- **High Performance**: Leverages Bun runtime for optimal performance
- **WebSocket Support**: Built-in WebSocket handling capabilities
- **Middleware System**: Flexible middleware architecture
- **HTTP Adapters**: Extensible adapter system with Hono as default

## Quick Start

First, install the required packages:
```bash

bun add @asenajs/asena @asenajs/asena-cli hono winston
```

Then, create a new project using the CLI:
```bash

## Creates a .asenarc.json file with default values (requires manual updates). Source folder is 'src'.
asena-cli init 
```

Create index.ts file under your src folder:
```typescript
import { AsenaServer } from '@asenajs/asena';
import { DefaultLogger } from '@asenajs/asena/lib/services';

const server = new AsenaServer().logger(new DefaultLogger()).port(3000);

await server.start();
```

Finally, run the project:
```bash

asena-cli dev start

## or you can simply build then run your bundled project

asena-cli build

## theb go to dist folder and run the project

bun index.asena.js
```

``Note``: Built options directly copy of bun options, you can check bun documentation for more options. [Bun Documentation](https://bun.sh/docs/bundler#reference)

## Example

Here is a simple example of a controller:
```typescript
// src/controllers/TestController.ts
import { type Context, Controller, Get } from '@asenajs/asena';

@Controller()
export class TestController {

    @Get('/')
    public async testerTest(context: Context) {
        return context.send("Hello world!");
    }
}

```

```typescript
// src/index.ts
import { AsenaServer, DefaultLogger } from '@asenajs/asena';

new AsenaServer().logger(new DefaultLogger()).port(3000).start();
```
then run 
```bash

asena-cli dev start

## logs
2024-11-16 15:29:44 [info]: 
    ___    _____  ______ _   __ ___ 
   /   |  / ___/ / ____// | / //   |
  / /| |  \__ \ / __/  /  |/ // /| |
 / ___ | ___/ // /___ / /|  // ___ |
/_/  |_|/____//_____//_/ |_//_/  |_|  
                             
2024-11-16 15:29:44 [info]:     IoC initialized 
2024-11-16 15:29:44 [info]:     No server services found 
2024-11-16 15:29:44 [info]:     Controller: TestController found 
2024-11-16 15:29:44 [info]:     METHOD: GET, PATH: /, READY 
2024-11-16 15:29:44 [info]:     No websockets found 
2024-11-16 15:29:44 [info]:     Server started on port 3000 
```

and you see the result on your browser [http://localhost:3000](http://localhost:3000) with "Hello world!" message.

``Note``: For more example, you can check this project [Example](https://github.com/LibirSoft/AsenaExample).


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

and here is the benchmark result of Asena with Hono adapter(Basic hello world example):

```text
For Asena:

wrk -t12 -c400 -d120s http://localhost:3000/
Running 2m test @ http://localhost:3000/
  12 threads and 400 connections
  Thread Stats   Avg      Stdev     Max   +/- Stdev
    Latency     2.89ms  364.25us  41.60ms   88.69%
    Req/Sec    11.49k   849.46    22.03k    65.69%
  16464809 requests in 2.00m, 1.96GB read
Requests/sec: 137148.80
Transfer/sec:     16.74MB

For Hono:

wrk -t12 -c400 -d120s http://localhost:3001/
Running 2m test @ http://localhost:3001/
  12 threads and 400 connections
  Thread Stats   Avg      Stdev     Max   +/- Stdev
    Latency     2.69ms  262.57us  39.26ms   83.20%
    Req/Sec    12.32k   802.22    24.74k    70.46%
  17652859 requests in 2.00m, 2.12GB read
Requests/sec: 147031.08
Transfer/sec:     18.09MB
```

## Documentation

For detailed documentation, please visit [not ready yet](https://asena.sh).