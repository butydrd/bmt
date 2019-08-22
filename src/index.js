#!/usr/bin/env node
const chalk = require('chalk');
const prompts = require('prompts');
const report = require('yurnalist');
const cli = require('yargs')();
const moment = require('moment');
require('moment/locale/zh-cn');
const { resolve, join } = require('path');
const fs = require('fs');
const config = require('./config');
const project = require('../package');
const child_process = require('child_process');

const {log} = console;


function exec(command, options = {}) {
    return new Promise((resolve, reject) => {
        child_process.exec(command, options, (error, stdout) => {
            if (error) {
                reject(error);
                return void 0
            }
            resolve(stdout)
        })
    })
}

function checkTcpPort(port) {
    return new Promise((resolve, reject) => {
        child_process.exec(`netstat -ano | findstr "${port}"`, (error, stdout) => {
            if (error) {
                reject(error);
                return void 0
            }
            resolve(stdout.toString().includes('LISTENING'))
        });
    })
}

const echo = {
    success(str) {
        log(chalk.green('\n成功 '), str)
    },
    error(str) {
        log(chalk.red('\n错误 '), str)
    },
    warn(str) {
        log(chalk.yellow('\n警告 '), str)
    }
};

function getBlogConfig() {
    if (!config.dir) {
        echo.warn('请设置GatsbyJS项目路径');
        process.exit()
    }
    try {
        return require(resolve(config.dir, 'config/index.js'))
    } catch (e) {
        echo.error('GatsbyJS项目路径有误，无法导入配置');
        process.exit()
    }
}

function getCategories(dir, ignore = []) {
    ignore.push('assets');
    return fs.readdirSync(dir)
        .filter(d => fs.statSync(join(dir, d)).isDirectory())
        .filter(dirname => !ignore.includes(dirname))
}

(async () => {
    cli
        .scriptName('bmt')
        .usage(chalk.blue(`============ 欢迎使用BMT博客管理工具 ${project.version}===============\n`))
        .usage(`语法: $0 <command> [options]`)
        .usage(`GatsbyJS项目路径: ${config.dir || '__无__'}`)
        .usage(`仓库远程地址: ${config.repository || '__无__'}`)
        .alias('h', 'help')
        .alias('v', 'version')
        .command({
            command: 'set [action] [value]',
            desc: '更新配置 可用操作: path, repository',
            handler: ({ action, value }) => {
                switch (action) {
                    case 'path':
                        config.dir = resolve(process.cwd(), value);
                        fs.writeFileSync(resolve(__dirname, 'config.json'), JSON.stringify(config, null, 2));
                        break;
                    case 'repository':
                        config.repository = value;
                        fs.writeFileSync(resolve(__dirname, 'config.json'), JSON.stringify(config, null, 2));
                        break;
                    default:
                        if(action) log('未知操作\n可用操作: path, repository');
                        else log('更新配置\n可用操作: path, repository');
                }
            }
        })
        .command({
            command: 'push [message]',
            desc: '推送文章到服务器',
            handler: async ({message}) => {
                if (!config.dir) {
                    echo.warn('未设置GatsbyJS项目路径');
                    process.exit()
                }
                if (!config.repository) {
                    echo.warn('未设置仓库远程地址');
                    process.exit()
                }
                const spinner = report.activity();
                spinner.tick(`生成静态页面`);
                await exec('yarn run build', {
                    cwd: config.dir,
                    stdio: ['ignore', 'ignore', 'pipe'],
                });
                const source = join(config.dir, 'public');
                if (!fs.existsSync(join(source, '.git'))) {
                    spinner.tick(`初始化仓库`);
                    await exec(`git init`, {
                        cwd: source,
                        stdio: ['ignore', 'ignore', 'pipe'],
                    });
                    await exec(`git remote add origin ${config.repository}`, {
                        cwd: source,
                        stdio: ['ignore', 'ignore', 'pipe'],
                    });
                    await exec('git checkout --orphan master', {
                        cwd: source,
                        stdio: ['ignore', 'ignore', 'pipe'],
                    });
                }
                spinner.tick(`添加到仓库`);
                await exec('git add *', {
                    cwd: source,
                    stdio: ['ignore', 'ignore', 'ignore'],
                });
                await exec(`git commit -m "${message}"`, {
                    cwd: source,
                    stdio: ['ignore', 'ignore', 'ignore'],
                });

                spinner.tick(`向服务端推送`);
                try {
                    await exec(`git push -u origin master -f`, {
                        cwd: source,
                        stdio: ['pipe', 'pipe', 'pipe'],
                    });
                    echo.success('已完成推送')
                } catch (e) {
                    echo.error(e.message)
                }
                spinner.end()
            }
        })
        .command({
            command: 'new [title]',
            desc: '新建文章',
            handler: async ({ title }) => {
                if (!title) {
                    echo.warn('请输入文章标题');
                    return void 0
                }
                const { dir, ignore } = getBlogConfig();
                const categories = getCategories(dir, ignore);
                const questions = [{
                    type: 'select',
                    name: 'category',
                    message: '选择文章分类：',
                    hint: '回车提交，上下键选择',
                    choices: categories.map(value => ({text: value, value}))
                }, {
                    type: 'text',
                    name: 'tags',
                    message: '请输入文章标签：',
                    format: text => text.split(/[,，\u0020]+/g)
                }, {
                    type: 'toggle',
                    name: 'status',
                    message: '文章是否发布？',
                    initial: true,
                    inactive: '否',
                    active: '是'
                }, {
                    type: 'toggle',
                    name: 'confirm',
                    message: '是否继续？',
                    initial: true,
                    inactive: '退出',
                    active: '继续'
                }];
                let result = {};
                try {
                    result = await prompts(questions);
                } catch (e) {
                    echo.error(e.message);
                    process.exit()
                }
                const { category, status, tags = [], confirm } = result;
                if (!confirm) {
                    log('已退出');
                    process.exit()
                }
                const filename = join(dir, category, `${title.replace(/[/\\<>?:*|"]/g, '')}.md`);
                if (fs.existsSync(filename)) {
                    echo.warn('文章已存在');
                    process.exit()
                }
                const metadata = [
                    `title: "${title}"`,
                    `date: "${moment().format('YYYY-MM-DD HH:mm:ss')}"`,
                    tags.length > 0 ? `tags: ["${tags.join('", "')}"]` : false,
                    `status: "${status ? 'publish' : 'draft'}"`
                ].filter(Boolean);
                try {
                    fs.writeFileSync(filename, '---\n'+metadata.join('\n')+'\n---\n\n ## 标题一');
                    if (fs.existsSync(filename)) {
                        child_process.exec(`start ${filename}`);
                        echo.success('新建文章成功')
                    }
                } catch (e) {
                    echo.error(e.message)
                }
            }
        })
        .command({
            command: 'preview',
            desc: '预览站点',
            handler: async () => {
                if (!config.dir) {
                    echo.warn('未设置GatsbyJS项目路径');
                    process.exit()
                }
                const spinner = report.activity();
                exec('yarn run develop', {
                    cwd: config.dir
                }).then(() => {
                    log('已结束预览')
                }).catch((e) => {
                    log.error(e.message);
                    process.exit()
                });
                let i = 0, timer = null;
                spinner.tick(`编译中，耗时: 0s`);
                timer = setInterval(() => {
                    i++;
                    spinner.tick(`编译中，耗时: ${i}s`);
                }, 1000);
                const poll = async () => {
                    try {
                        if (await checkTcpPort(8000)) {
                            spinner.end();
                            log(`编译完毕 耗时：${i}s，运行中\n`);
                            log('http://localhost:8000');
                            clearInterval(timer);
                            return void 0
                        }
                    } catch (e) {}
                    setTimeout(poll, 3000)
                };
                setTimeout(poll, 3000)
            }
        })
        .command({
            command: 'clean',
            desc: '清除public和.cache文件夹',
            handler: async () => {
                if (!config.dir) {
                    echo.warn('未设置GatsbyJS项目路径');
                    process.exit()
                }
                exec('gatsby clean', {
                    cwd: config.dir,
                    stdio: ['pipe', 'pipe', 'pipe'],
                }).then(() => {
                    log('清除完成')
                });
            }
        })
        .demandCommand(1, `请使用 --help 查看所有命令帮助.`)
        .strict()
        .parse(process.argv.splice(2));
})();
