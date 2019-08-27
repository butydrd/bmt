#!/usr/bin/env node

const cli = require('yargs')()
const { Console } = require('./utils')
const moment = require('moment')
const chalk = require('chalk')
const { resolve, join } = require('path')
const fs = require('fs')
const prompts = require('prompts')
const config = require('./config')
const project = require('../package')
require('moment/locale/zh-cn')

function getBaiJXConfig() {
  if (!config.dir) {
    Console.warn('请设置BaiJX项目路径')
    process.exit()
  }
  try {
    return require(resolve(config.dir, 'config/index.js'))
  } catch (e) {
    Console.error('BaiJX项目路径有误，无法导入配置')
    process.exit()
  }
}

function readDir(dir, ignore = []) {
  ignore.push('assets', '.git')
  return fs
    .readdirSync(dir)
    .filter(d => fs.statSync(join(dir, d)).isDirectory())
    .filter(dirname => !ignore.includes(dirname))
}

function main() {
  cli
    .scriptName('bmt')
    .usage(
      chalk.blue(`============ 欢迎使用BMT博客管理工具 ${project.version}===============\n`)
    )
    .usage(`包名称：${project.name}`)
    .usage(`语法: $0 [command] [options]`)
    .usage(`BaiJX项目路径: ${config.dir || '__无__'}`)
    .usage(`仓库远程地址: ${config.repository || '__无__'}`)
    .alias('h', 'help')
    .alias('v', 'version')
    .command({
      command: 'set [action] [value]',
      describe: '更新配置 可用操作: path, repository',
      handler: ({ action, value }) => {
        switch (action) {
          case 'path':
            config.dir = resolve(process.cwd(), value)
            fs.writeFileSync(
              resolve(__dirname, 'config.json'),
              JSON.stringify(config, null, 2)
            )
            break
          case 'repository':
            config.repository = value
            fs.writeFileSync(
              resolve(__dirname, 'config.json'),
              JSON.stringify(config, null, 2)
            )
            break
          default:
            if (action) Console.log('未知操作\n可用操作: path, repository')
            else Console.log('更新配置\n可用操作: path, repository')
        }
      }
    })
    .command({
      command: 'build',
      describe: '生成静态页面',
      handler: async () => {
        if (!config.dir) {
          Console.warn('未设置GatsbyJS项目路径')
          return void 0
        }
        const buildEnd = Console.spinner('生成静态页面中')
        try {
          await Console.exec('yarn run build', {
            cwd: config.dir
          })
        } catch (e) {
          buildEnd()
          Console.error(`生成静态页面失败`)
          console.log(e)
          return void 0
        }
        Console.success(`生成静态完成 耗时：${buildEnd()}s`)
      }
    })
    .command({
      command: 'push [message]',
      describe: '推送文章到服务器',
      handler: async ({ message }) => {
        if (!config.dir) {
          Console.warn('未设置GatsbyJS项目路径')
          return void 0
        }
        if (!config.repository) {
          Console.warn('未设置仓库远程地址')
          return void 0
        }
        if (!message) {
          Console.warn('请输入更新信息')
          return void 0
        }
        const timer = Console.timer()
        const buildEnd = Console.spinner('生成静态页面中')
        try {
          await Console.exec('yarn run build', {
            cwd: config.dir
          })
        } catch (e) {
          buildEnd()
          Console.error(`生成静态页面失败`)
          console.error(e.message)
          return void 0
        }
        Console.success(`生成静态完成 耗时：${buildEnd()}s`)
        const source = join(config.dir, 'public')
        if (!fs.existsSync(join(source, '.git'))) {
          const initEnd = Console.spinner('初始化仓库中')
          try {
            await Console.exec(`git init`, {
              cwd: source
            })
            await Console.exec(`git remote add origin ${config.repository}`, {
              cwd: source
            })
            await Console.exec('git checkout --orphan master', {
              cwd: source
            })
            Console.success(`初始化仓库完成 耗时：${initEnd()}s`)
          } catch (e) {
            initEnd()
            Console.error('初始化仓库失败')
            console.error(e.message)
            return void 0
          }
        }
        const addEnd = Console.spinner('添加到仓库中')
        try {
          await Console.exec('git add *', {
            cwd: source
          })
          await Console.exec(`git commit -m "${message}"`, {
            cwd: source
          })
          Console.success(`添加到仓库完成 耗时：${addEnd()}s`)
        } catch (e) {
          addEnd()
          Console.error('添加到仓库失败')
          console.error(e.message)
          return void 0
        }
        const pushEnd = Console.spinner(`向服务端推送中`)
        try {
          await Console.exec(`git push -u origin master -f`, {
            cwd: source
          })
          Console.success(`向服务端推送完成 耗时：${pushEnd()}s`)
        } catch (e) {
          pushEnd()
          Console.error('向服务端推送失败')
          return void 0
        }
        Console.success(`共耗时：${timer.end()}s`)
      }
    })
    .command({
      command: 'new [title]',
      describe: '新建文章',
      handler: async ({ title }) => {
        if (!title) {
          Console.warn('请输入文章标题')
          return void 0
        }
        const { dir, ignore } = getBaiJXConfig()
        const categories = readDir(dir, ignore)
        const questions = [
          {
            type: 'select',
            name: 'category',
            message: '选择文章分类：',
            hint: '回车提交，上下键选择',
            choices: categories.map(value => ({ text: value, value }))
          },
          {
            type: 'text',
            name: 'tags',
            message: '请输入文章标签：',
            format: text => text.split(/[,，\u0020]+/g).filter(text => text.trim())
          },
          {
            type: 'toggle',
            name: 'status',
            message: '文章是否发布？',
            initial: true,
            inactive: '否',
            active: '是'
          },
          {
            type: 'toggle',
            name: 'confirm',
            message: '是否继续？',
            initial: true,
            inactive: '退出',
            active: '继续'
          }
        ]
        let result = {}
        try {
          result = await prompts(questions)
        } catch (e) {
          Console.error(e.message)
          return void 0
        }
        const { category, status, tags = [], confirm } = result
        if (!confirm) {
          Console.log('已退出')
          process.exit()
        }
        const filename = join(
          dir,
          category,
          `${title.replace(/[/\\<>?:*|"]/g, '')}.md`
        )
        if (fs.existsSync(filename)) {
          Console.warn('文章已存在')
          process.exit()
        }
        const metadata = [
          `title: "${title}"`,
          `date: "${moment().format('YYYY-MM-DD HH:mm:ss')}"`,
          tags.length > 0 ? `tags: ["${tags.join('", "')}"]` : false,
          `status: "${status ? 'publish' : 'draft'}"`
        ].filter(Boolean)
        try {
          fs.writeFileSync(
            filename,
            '---\n' + metadata.join('\n') + '\n---\n\n ## 标题一'
          )
          if (fs.existsSync(filename)) {
            console.log(filename)
            await Console.exec('start', [filename], { shell: true })
            Console.success('新建文章成功')
          }
        } catch (e) {
          Console.error(e.message)
        }
      }
    })
    .command({
      command: 'preview',
      describe: '预览站点',
      handler: async () => {
        if (!config.dir) {
          Console.warn('未设置GatsbyJS项目路径')
          return void 0
        }
        const previewEnd = Console.spinner('编译中')
        Console.exec('yarn run develop', {
          cwd: config.dir,
          timeout: 60
        })
          .then(() => {
            Console.info('已结束预览')
          })
          .catch(e => {
            Console.error(`编译失败`)
            console.error(e)
          })
        const poll = async () => {
          try {
            let res = await Console.tcpPortCheck(8000)
            if (res) {
              Console.info(`编译完毕 耗时：${previewEnd()}s，运行中\n`)
              Console.log('http://localhost:8000')
              return void 0
            }
          } catch (e) {}
          setTimeout(poll, 3000)
        }
        setTimeout(poll, 3000)
      }
    })
    .command({
      command: 'clean',
      describe: '清除public和.cache文件夹',
      handler: async () => {
        if (!config.dir) {
          Console.warn('未设置GatsbyJS项目路径')
          return void 0
        }
        try {
          await Console.exec('gatsby clean', {
            cwd: config.dir,
            stdio: ['pipe', 'pipe', 'pipe']
          })
          Console.success('清除完成')
        } catch (e) {
          Console.error('清除失败')
        }
      }
    })
    .command({
      command: 'open [action]',
      describe: '打开相关文件夹，可用命令 home, project',
      handler: async ({ action }) => {
        if (!config.dir) {
          Console.warn('请现设置BaiJX项目地址')
          return void 0
        }
        const { dir, ignore } = getBaiJXConfig()
        try {
          switch (action) {
            case "home":
              await Console.exec('explorer .', {
                cwd: dir
              })
              break
            case 'project':
              await Console.exec('explorer .', {
                cwd: config.dir
              })
              break
            default:
              Console.log('未知命令')
          }
        } catch (e) {
          Console.error('意外错误')
          console.error(e)
        }
      }
    })
    .demandCommand(1, `请使用 --help 查看所有命令帮助.`)
    .strict()
    .parse(process.argv.splice(2))
}
main()
