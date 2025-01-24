import chalk from 'chalk';

export class Logger {
  private timestamp(): string {
    return new Date().toISOString();
  }

  info(message: string, data?: any): void {
    const timestamp = this.timestamp();
    console.log(
      chalk.blue(`[${timestamp}] INFO:`),
      chalk.white(message),
      data ? chalk.gray(JSON.stringify(data, null, 2)) : ''
    );
  }

  warn(message: string, data?: any): void {
    const timestamp = this.timestamp();
    console.log(
      chalk.yellow(`[${timestamp}] WARN:`),
      chalk.white(message),
      data ? chalk.gray(JSON.stringify(data, null, 2)) : ''
    );
  }

  error(message: string, error?: any): void {
    const timestamp = this.timestamp();
    console.error(
      chalk.red(`[${timestamp}] ERROR:`),
      chalk.white(message),
      error ? chalk.gray(typeof error === 'object' ? JSON.stringify(error, null, 2) : error) : ''
    );
  }

  success(message: string, data?: any): void {
    const timestamp = this.timestamp();
    console.log(
      chalk.green(`[${timestamp}] SUCCESS:`),
      chalk.white(message),
      data ? chalk.gray(JSON.stringify(data, null, 2)) : ''
    );
  }

  debug(message: string, data?: any): void {
    if (process.env.DEBUG === 'true') {
      const timestamp = this.timestamp();
      console.log(
        chalk.magenta(`[${timestamp}] DEBUG:`),
        chalk.white(message),
        data ? chalk.gray(JSON.stringify(data, null, 2)) : ''
      );
    }
  }

  trade(type: 'BUY' | 'SELL', message: string, data?: any): void {
    const timestamp = this.timestamp();
    console.log(
      chalk.cyan(`[${timestamp}] TRADE ${type}:`),
      chalk.white(message),
      data ? chalk.gray(JSON.stringify(data, null, 2)) : ''
    );
  }
}
