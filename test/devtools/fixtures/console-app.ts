import { Config, EventService, ExceptionHandler, MessageController, Schedule } from '../../../lib/server/decorators';
import { On } from '../../../lib/server/event';
import { InMemoryTransport, MessagePattern } from '../../../lib/server/microservice';
import { Catch } from '../../../lib/server/exception';
import type { AsenaSchedule } from '../../../lib/server/schedule';

export class OutOfStock extends Error {}

@EventService('pantry')
export class PantryEvents {
  public static received: unknown[] = [];

  @On('restocked')
  public restocked(_event: string, data: unknown) {
    PantryEvents.received.push(data);
  }
}

@MessageController('pantry')
export class PantryHandler {
  @MessagePattern('count')
  public count(data: { item: string }) {
    return { item: data.item, count: 3 };
  }

  @MessagePattern('reserve')
  public reserve() {
    throw new OutOfStock('nothing left');
  }

  @MessagePattern('broken')
  public broken() {
    throw new Error('broken handler');
  }
}

@Schedule({ cron: '0 6 * * *' })
export class NightlyRestock implements AsenaSchedule {
  public static runs = 0;

  public async execute() {
    NightlyRestock.runs += 1;
  }
}

@Schedule({ cron: '0 7 * * *' })
export class FailingAudit implements AsenaSchedule {
  public async execute() {
    throw new Error('audit failed');
  }
}

@ExceptionHandler()
export class PantryErrors {
  @Catch(OutOfStock)
  public outOfStock() {
    return { reserved: false };
  }
}

@Config()
export class PantryConfig {
  public transport() {
    return { microservice: new InMemoryTransport() };
  }
}

export const consoleAppComponents = [
  PantryEvents,
  PantryHandler,
  NightlyRestock,
  FailingAudit,
  PantryErrors,
  PantryConfig,
];
