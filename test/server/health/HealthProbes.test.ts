import { afterEach, describe, expect, test } from 'bun:test';
import { AsenaServerFactory } from '../../../lib/server';
import { Service } from '../../../lib/server/decorators';
import { OnStop } from '../../../lib/ioc/component';
import { silentLogger } from '../../../lib/test/harness/silentLogger';

let server: any;

// 10000-31999: above the well-known range and below the kernel's ephemeral floor
// (net.ipv4.ip_local_port_range, 32768-60999). A server port drawn from that range collides
// with the outbound sockets the suite itself holds open - TIME_WAIT included - and Bun.serve
// then fails with EADDRINUSE, randomly, in whichever test happened to draw it.
const randomPort = () => 10000 + Math.floor(Math.random() * 22000);

const createHeadless = async (components: any[] = []) => {
  const port = randomPort();

  server = await AsenaServerFactory.create({
    headless: true,
    logger: silentLogger,
    components,
    health: { port },
    shutdown: { signals: false },
  });

  await server.start();

  return port;
};

describe('health probes', () => {
  afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  test('serves /live, /ready and the base path', async () => {
    const port = await createHeadless();

    const live = await fetch(`http://localhost:${port}/healthz/live`);
    const ready = await fetch(`http://localhost:${port}/healthz/ready`);
    const base = await fetch(`http://localhost:${port}/healthz`);

    expect(live.status).toBe(200);
    expect(ready.status).toBe(200);
    expect(base.status).toBe(200);

    expect(await live.json()).toMatchObject({ status: 'up' });
  });

  test('still 404s an unknown path', async () => {
    const port = await createHeadless();

    expect((await fetch(`http://localhost:${port}/healthz/nope`)).status).toBe(404);
    expect((await fetch(`http://localhost:${port}/other`)).status).toBe(404);
  });

  test('reports not ready while shutting down, and stays live', async () => {
    // A stop hook that takes its time is what gives the probe a window to be observed in -
    // and is exactly the situation the split exists for: the instance is draining, so it must
    // be pulled from rotation, but it has not died and must not be restarted.
    @Service()
    class SlowToStop {
      @OnStop()
      public async close() {
        await Bun.sleep(300);
      }
    }

    const port = await createHeadless([SlowToStop]);

    const stopping = server.stop();

    await Bun.sleep(50);

    const ready = await fetch(`http://localhost:${port}/healthz/ready`);
    const live = await fetch(`http://localhost:${port}/healthz/live`);

    // Pulled from rotation but not restarted: that distinction is the whole reason the two
    // probes are separate, and it only holds because the health server is the last thing
    // stop() takes down.
    expect(ready.status).toBe(503);
    expect(await ready.json()).toMatchObject({ status: 'not_ready', state: 'STOPPING' });
    expect(live.status).toBe(200);

    await stopping;
    server = undefined;
  });
});
