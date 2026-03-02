declare module 'pino-roll' {
  import type { Writable } from 'node:stream';

  interface PinoRollOptions {
    file: string;
    frequency?: 'daily' | 'hourly' | number;
    extension?: string;
    size?: string;
    limit?: { count: number };
    symlink?: boolean;
    dateFormat?: string;
    mkdir?: boolean;
  }

  function build(options: PinoRollOptions): Promise<Writable>;
  export default build;
}
