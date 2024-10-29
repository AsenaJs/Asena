import type { Logger } from 'winston';
import winston from 'winston';
import type { ServerLogger } from '../types';

export const defaultFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.align(),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...extra } = info;

    return `${timestamp} [${level}]: ${message} ${Object.keys(extra).length ? JSON.stringify(extra, null, 2) : ''}`;
  }),
);

export const green = (message: string) => `\x1b[32m${message}\x1b[0m`;

export const red = (message: string) => `\x1b[31m${message}\x1b[0m`;

export const yellow = (message: string) => `\x1b[33m${message}\x1b[0m`;

export class DefaultLogger implements ServerLogger {

  public logger: Logger;

  public constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [new winston.transports.Console({ format: defaultFormat } as any)],
    });
  }

  public info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  public warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  public error(message: string, meta?: any): void {
    this.logger.error(message, meta);
  }

}
