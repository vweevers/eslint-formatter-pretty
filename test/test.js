import test from 'ava'
import stripAnsi from 'strip-ansi'
import ansiEscapes from 'ansi-escapes'
import chalk from 'chalk'
import reporter from '../index.js'
import fs from 'node:fs'

const read = (fp) => JSON.parse(fs.readFileSync(new URL(fp, import.meta.url), 'utf8'))
const defaultFixture = read('./fixtures/default.json')
const noRuleDocs = read('./fixtures/no-rule-docs.json')
const noRuleId = read('./fixtures/no-rule-id.json')
const urls = read('./fixtures/urls.json')
const noLineNumbers = read('./fixtures/no-line-numbers.json')
const lineNumbers = read('./fixtures/line-numbers.json')
const sortOrder = read('./fixtures/sort-by-severity-then-line-then-column.json')
const messages = read('./fixtures/messages.json')
const data = read('./fixtures/data.json')

const fakeMessages = (desiredSeverity, desiredCount) => {
  const ofDesiredSeverity = messages.filter(({ severity }) => severity === desiredSeverity)

  if (ofDesiredSeverity.length < desiredCount) {
    throw new Error(
      `requested ${desiredCount} messages with severity ${desiredSeverity}. Only found ${desiredSeverity.length}.`
    )
  }

  return ofDesiredSeverity.slice(0, desiredCount)
}

const fakeReport = (errorCount, warningCount) => ({
  path: `${errorCount}-error.${warningCount}-warning.js`,
  errorCount,
  warningCount,
  messages: fakeMessages(1, warningCount).concat(fakeMessages(2, errorCount))
})

const enableHyperlinks = () => {
  process.env.FORCE_HYPERLINK = '1'
}

const disableHyperlinks = () => {
  process.env.FORCE_HYPERLINK = '0'
}

test('output', t => {
  disableHyperlinks()
  const output = reporter(defaultFixture)
  console.log(output)
  t.regex(stripAnsi(output), /index\.js:18:2\n/)
  t.regex(stripAnsi(output), /❌ {3}1:1 {2}AVA should be imported as test. +ava:use-test/)
})

test('file heading links to the first error line', t => {
  disableHyperlinks()
  const output = reporter(defaultFixture)
  console.log(output)
  t.regex(stripAnsi(output), /index\.js:18:2\n/)
})

test('file heading links to the first warning line if no errors in the file', t => {
  disableHyperlinks()
  const output = reporter(defaultFixture)
  console.log(output)
  t.regex(stripAnsi(output), /test\.js:1:1\n/)
})

test('no line numbers', t => {
  disableHyperlinks()
  const output = reporter(noLineNumbers)
  console.log(output)
  t.regex(stripAnsi(output), /index\.js\n/)
  t.regex(stripAnsi(output), /❌ {2}AVA should be imported as test. +ava:use-test/)
})

test('show line numbers', t => {
  disableHyperlinks()
  const output = reporter(lineNumbers)
  console.log(output)
  t.regex(stripAnsi(output), /⚠️ {3} {5}Unexpected todo comment. +eslint:no-warning-comments/)
  t.regex(stripAnsi(output), /❌ {3}1:1 {2}AVA should be imported as test. +ava:use-test/)
})

test('link rules to documentation when terminal supports links', t => {
  enableHyperlinks()
  const output = reporter(defaultFixture)
  console.log(output)
  t.true(output.includes(ansiEscapes.link(chalk.dim('eslint:no-warning-comments'), 'https://eslint.org/docs/rules/no-warning-comments')))
})

test('link literal urls', t => {
  enableHyperlinks()
  const output = reporter(urls)
  console.log(output)
  t.true(output.includes(ansiEscapes.link('a.com', 'https://a.com/')))
  t.true(output.includes(ansiEscapes.link('b.dev/foo?bar=1#z', 'https://b.dev/foo?bar=1#z')))
  t.true(output.includes(ansiEscapes.link('vweevers/vfile-reporter-shiny#1', 'https://github.com/vweevers/vfile-reporter-shiny/pull/1')))
  t.true(output.includes(ansiEscapes.link('example', 'https://example.com')))
})

test('no rule id', t => {
  disableHyperlinks()
  const output = reporter(noRuleId)
  console.log(output)
  t.regex(stripAnsi(output), /❌ {2}1:1 {2}One {4}\n/)
  t.regex(stripAnsi(output), /❌ {2}2:1 {2}Two {4}eslint:beep\n/)
  t.regex(stripAnsi(output), /❌ {2}3:1 {2}Three {2}beep:boop\n/)
})

test('sort by severity, then line number, then column number', t => {
  disableHyperlinks()
  const output = reporter(sortOrder)
  const sanitized = stripAnsi(output)
  const indexes = [
    sanitized.indexOf('⚠️   1:1'),
    sanitized.indexOf('⚠️  10:2'),
    sanitized.indexOf('❌   3:1'),
    sanitized.indexOf('❌  30:1'),
    sanitized.indexOf('❌  40:5'),
    sanitized.indexOf('❌  40:8')
  ]
  console.log(output)
  t.deepEqual(indexes, indexes.slice().sort((a, b) => a - b))
})

test('display warning total before error total', t => {
  disableHyperlinks()
  const output = reporter(sortOrder)
  const sanitized = stripAnsi(output)
  const indexes = [
    sanitized.indexOf('2 warnings'),
    sanitized.indexOf('4 errors')
  ]
  console.log(output)
  t.deepEqual(indexes, indexes.slice().sort((a, b) => a - b))
})

// I think I prefer keeping file order as-is
test.skip('files will be sorted with least errors at the bottom, but zero errors at the top', t => {
  disableHyperlinks()
  const reports = [
    fakeReport(1, 0),
    fakeReport(3, 0),
    fakeReport(0, 1),
    fakeReport(2, 2)
  ]
  const output = reporter(reports)
  const sanitized = stripAnsi(output)
  const indexes = [
    sanitized.indexOf('0-error.1-warning.js'),
    sanitized.indexOf('3-error.0-warning.js'),
    sanitized.indexOf('2-error.2-warning.js'),
    sanitized.indexOf('1-error.0-warning.js')
  ]
  console.log(output)
  t.is(indexes.length, reports.length)
  t.deepEqual(indexes, indexes.slice().sort((a, b) => a - b))
})

test.skip('files with similar errorCounts will sort according to warningCounts', t => {
  disableHyperlinks()
  const reports = [
    fakeReport(1, 0),
    fakeReport(1, 2),
    fakeReport(1, 1),
    fakeReport(0, 1),
    fakeReport(0, 2),
    fakeReport(0, 3),
    fakeReport(2, 2),
    fakeReport(2, 1)
  ]
  const output = reporter(reports)
  const sanitized = stripAnsi(output)
  const indexes = [
    sanitized.indexOf('0-error.3-warning.js'),
    sanitized.indexOf('0-error.2-warning.js'),
    sanitized.indexOf('0-error.1-warning.js'),
    sanitized.indexOf('2-error.2-warning.js'),
    sanitized.indexOf('2-error.1-warning.js'),
    sanitized.indexOf('1-error.2-warning.js'),
    sanitized.indexOf('1-error.1-warning.js'),
    sanitized.indexOf('1-error.0-warning.js')
  ]
  console.log(output)
  t.is(indexes.length, reports.length)
  t.deepEqual(indexes, indexes.slice().sort((a, b) => a - b))
})

test('use the `rulesMeta` property to get docs URL', t => {
  enableHyperlinks()
  const output = reporter(defaultFixture, data)
  console.log(output)
  t.true(output.includes(ansiEscapes.link(chalk.dim('eslint:no-warning-comments'), 'https://eslint.org/docs/rules/test/no-warning-comments')))
})

test('doesn\'t throw errors when rule docs aren\'t found', t => {
  enableHyperlinks()
  const output = reporter(noRuleDocs, data)
  console.log(output)
  t.true(output.includes('@typescript-eslint:no-unused-vars'))
})

test('link remark and attend rules to docs', t => {
  enableHyperlinks()
  const output = reporter(defaultFixture, data)
  console.log(output)
  t.true(output.includes(ansiEscapes.link(chalk.dim('remark-lint:code-block-style'), 'https://github.com/remarkjs/remark-lint/blob/main/doc/rules.md')))
  t.true(output.includes(ansiEscapes.link(chalk.dim('attend-dependabot:ecosystems'), 'https://npmjs.com/package/attend-dependabot')))
})
