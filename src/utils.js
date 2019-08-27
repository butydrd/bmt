const spawn = require('cross-spawn')
const chalk = require('chalk')
const report = require('yurnalist')

class ExecError extends Error{
  name = 'ExecError'
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

class Console{
  static tcpPortCheck(port) {
    return new Promise(resolve => {
      const netstat = spawn('netstat', ['-ano'])
      // ns.stdout.on('data', (d) => console.log('ns stdout: ', d.toString()))
      const findstr = spawn('findstr', [port], {
        stdio: [netstat.stdout, 'pipe', process.stderr]
      })
      let stdout = ''
      findstr.stdout.on('data', data => (stdout += data))
      findstr.on('exit', () => {
        resolve(stdout.includes('LISTENING'))
      })
    })
  }
  static exec(file, args, options) {
    let command = []
    if (Array.isArray(args)) {
      command = file.split(/\s+(?=(?:"[^"]+"|[^"])+$)/g).concat(args)
    } else {
      options = args
      command = file.split(/\s+(?=(?:"[^"]+"|[^"])+$)/g)
    }
    return new Promise((resolve, reject) => {
      const cmd = spawn(command.shift(), command, options)
      let stdout = ''
      let stderr = ''
      cmd.stdout.on('data', data => (stdout += data))
      cmd.stderr.on('data', data => (stderr += data))
      cmd.on('error', error => {
        reject(error)
      })
      cmd.on('exit', (code) => {
        if (code !== 0) reject(new ExecError(stderr, code))
        else resolve(stdout)
      })
    })
  }
  static timer() {
    const now = Date.now()
    return {
      end: () => {
        return Math.floor((Date.now() - now) / 1000)
      }
    }
  }
  static spinner(message, tips = '耗时：') {
    let timer = null,
      i = 0
    const activity = report.activity()
    timer = setInterval(() => {
      i++
      activity.tick(`${message} ${tips}${i}s`)
    }, 1000)
    activity.tick(`${message} ${tips}${i}s`)
    return () => {
      timer && clearInterval(timer)
      activity.end()
      return i
    }
  }
  static log(...arg) {
    console.log(...arg)
  }
  static success(message) {
    this.log(chalk.green('成功 '), message)
  }
  static warn(message) {
    this.log(chalk.yellow('警告 '), message)
  }
  static info(message) {
    this.log(chalk.blue('信息 '), message)
  }
  static error(message) {
    this.log(chalk.red('错误 '), message)
  }
}
class Utils {
  static isArray(val) {
    return toString.call(val) === '[object Array]'
  }
  static isString(val) {
    return typeof val === 'string'
  }
  static isNumber(val) {
    return typeof val === 'number'
  }
  static isUndefined(val) {
    return typeof val === 'undefined'
  }
  static isObject(val) {
    return val !== null && typeof val === 'object'
  }
  static isDate(val) {
    return toString.call(val) === '[object Date]'
  }
  static isFunction(val) {
    return toString.call(val) === '[object Function]'
  }
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = {
  Console,
  Utils
}
