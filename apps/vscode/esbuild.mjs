import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')
const isProduction = !watch

const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !isProduction,
  minify: isProduction,
})

if (watch) {
  await ctx.watch()
  console.log('Watching extension host for changes...')
} else {
  await ctx.rebuild()
  await ctx.dispose()
}
