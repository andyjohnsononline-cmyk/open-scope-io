import { Command } from 'commander';
import { analyze } from './analyze.js';

const program = new Command();

program
  .name('openscope')
  .description('Open source video scope analysis engine')
  .version('0.1.0');

program
  .command('analyze')
  .description('Analyze an image or video file')
  .argument('<file>', 'Input file path (image or video)')
  .option(
    '-s, --scopes <scopes>',
    'Comma-separated scope IDs',
    'waveform,rgbParade,vectorscope,histogram,falseColor',
  )
  .option('-f, --format <format>', 'Output format', 'json')
  .option('--compact', 'Output metadata only (omit raw data arrays)')
  .option(
    '--sample-rate <n>',
    'For video: analyze every Nth frame',
    '1',
  )
  .action(async (file: string, opts) => {
    try {
      await analyze(file, {
        scopes: opts.scopes.split(','),
        format: opts.format,
        compact: opts.compact ?? false,
        sampleRate: parseInt(opts.sampleRate, 10),
      });
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(2);
    }
  });

program.parse();
