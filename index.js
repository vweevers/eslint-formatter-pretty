import chalk from 'chalk'
import plur from 'plur'
import stringWidth from 'string-width'
import ansiEscapes from 'ansi-escapes'
import { supportsHyperlink as sh } from 'supports-hyperlinks'
import getRuleDocs from 'eslint-rule-docs'
import { stringifyPosition } from 'unist-util-stringify-position'
import toAnsi from 'markdown-to-ansi'
import fs from 'node:fs'
import path from 'node:path'

const logSymbols = getLogSymbols()

export default function (files, options) {
  if (!options) options = {}

  const lines = []
  const link = supportsHyperlinks(process.stdout)
  const transform = toAnsi({ stream: process.stdout })
  const cwd = path.resolve(options.cwd || '.')

  let infoCount = 0
  let warningCount = 0
  let errorCount = 0
  let maxPosWidth = 0
  let maxReasonWidth = 0
  let showLineNumbers = false

  for (const file of files) {
    const { messages } = file

    if (messages.length === 0) {
      continue
    }

    if (lines.length !== 0) {
      lines.push({ type: 'separator' })
    }

    // TODO: remove .severity in favor of .fatal
    for (const m of messages) {
      if (m.fatal !== undefined && m.severity == null) {
        m.severity = m.fatal ? 2 : m.fatal === false ? 1 : 0
      }
    }

    const firstError = messages.find(isError) || messages[0]
    const absolutePath = path.resolve(file.cwd || cwd, file.path)
    const relativePath = path.relative(cwd, absolutePath)

    lines.push({
      type: 'header',
      path: file.path,
      relativePath: relativePath || '.',
      isDir: isDir(relativePath, absolutePath),
      firstLinePos: stringifyPosition(firstError)
    })

    for (const m of messages.sort(cmpMessage)) {
      let { reason, severity } = m

      if (severity === 0) infoCount++
      else if (severity === 1) warningCount++
      else errorCount++

      // Link and shorten urls, stylize inline code blocks
      reason = transform(reason)

      const pos = stringifyPosition(m)
      const posWidth = stringWidth(pos)
      const reasonWidth = stringWidth(reason)

      maxPosWidth = Math.max(posWidth, maxPosWidth)
      maxReasonWidth = Math.max(reasonWidth, maxReasonWidth)
      showLineNumbers = showLineNumbers || pos !== ''

      lines.push({
        type: 'message',
        severity,
        pos,
        posWidth,
        reason,
        reasonWidth,
        ruleId: [m.source, m.ruleId].filter(Boolean).join(':') || ''
      })
    }
  }

  let output = '\n'

  if (process.stdout.isTTY && !process.env.CI) {
    // Make relative paths Command-clickable in iTerm
    output += ansiEscapes.iTerm.setCwd()
  }

  output += lines.map(function (x) {
    if (x.type === 'header') {
      // Add the line number so it's Command-click'able in some terminals
      // Use dim & gray for terminals like iTerm that doesn't support `hidden`
      const position = showLineNumbers && x.firstLinePos && !x.isDir ? chalk.hidden.dim.gray(`:${x.firstLinePos}`) : ''
      const header = chalk.underline((x.isDir ? '<dir> ' : '') + x.relativePath)

      return '  ' + header + position
    }

    if (x.type === 'message') {
      const { ruleId, ruleUrl } = ruleInfo(x.ruleId, options)
      const line = [
        '',
        x.severity === 0 ? logSymbols.info : x.severity === 1 ? logSymbols.warning : logSymbols.error,
        ' '.repeat(maxPosWidth - x.posWidth) + chalk.gray(x.pos),
        x.reason,
        ' '.repeat(maxReasonWidth - x.reasonWidth) +
        (ruleUrl && link ? ansiEscapes.link(chalk.dim(ruleId), ruleUrl) : chalk.dim(ruleId))
      ]

      if (!showLineNumbers) {
        line.splice(2, 1)
      }

      return line.join('  ')
    }

    return ''
  }).join('\n') + '\n\n'

  if (warningCount > 0) {
    output += '  ' + chalk.yellow(`${warningCount} ${plur('warning', warningCount)}`) + '\n'
  }

  if (errorCount > 0) {
    output += '  ' + chalk.red(`${errorCount} ${plur('error', errorCount)}`) + '\n'
  }

  return errorCount + warningCount + infoCount > 0 ? output : ''
}

function ruleInfo (ruleId, options) {
  if (!ruleId) {
    return { ruleId: '', ruleUrl: '' }
  }

  let ruleUrl

  const remarkRule = ruleId.replace(/[/]/g, ':')
  const commonRule = remarkRule.includes(':') ? remarkRule : 'eslint:' + remarkRule

  if (/^remark-lint:/.test(commonRule)) {
    ruleUrl = 'https://github.com/remarkjs/remark-lint/blob/main/doc/rules.md'
  } else if (/^(remark|hallmark|attend)[a-z0-9-]*:/.test(commonRule)) {
    ruleUrl = 'https://npmjs.com/package/' + commonRule.split(':')[0]
  } else {
    const eslintRule = ruleId.replace(/:/g, '/').replace(/^eslint[/]/, '')

    try {
      ruleUrl = options.rulesMeta[eslintRule].docs.url
    } catch {
      try {
        ruleUrl = getRuleDocs(eslintRule).url
      } catch {}
    }
  }

  return { ruleId: commonRule, ruleUrl }
}

function isError (m) {
  return m.severity === 2
}

function cmpMessage (a, b) {
  if (a.severity === b.severity) {
    if (a.line === b.line) {
      return a.column < b.column ? -1 : 1
    }

    return a.line < b.line ? -1 : 1
  }

  return a.severity < b.severity ? -1 : 1
}

function isDir (relativePath, absolutePath) {
  if (relativePath === '') {
    return true
  }

  // Save a few fs lookups
  if (/\.(js|jsx|json|md|png|gif|yml|xml|css|html|gitignore|npmrc)$/i.test(absolutePath)) {
    return false
  }

  try {
    return fs.statSync(absolutePath).isDirectory()
  } catch {
    return false
  }
}

function getLogSymbols () {
  if (process.platform !== 'win32' || process.env.CI || process.env.TERM === 'xterm-256color' || process.env.WT_SESSION) {
    return {
      info: '🔷',
      warning: '⚠️',
      error: '❌'
    }
  }

  return {
    info: chalk.blue('i'),
    warning: chalk.yellow('‼'),
    error: chalk.red('×')
  }
}

function supportsHyperlinks (stream) {
  if (process.env.FORCE_HYPERLINK === '0') {
    return false
  }

  if (process.env.FORCE_HYPERLINK === '1') {
    return true
  }

  if (!stream.isTTY) {
    return false
  }

  return sh(stream) || isWindowsTerminal()
}

function isWindowsTerminal () {
  return !!process.env.WT_SESSION
}
