#!/usr/bin/env node

//@ts-check

const execSync = require('child_process').execSync;
const path = require('path');
const readline = require('readline');
const decompress = require('decompress');

/**
 * @type {commander.CommanderStatic & {init?:string} & {typescript?:boolean} & {starter?:string} & {npm?:boolean}}
 */
const commander = require('commander');

const fs = require('fs-extra');
const download = require('download');
const ora = require('ora');
const yaml = require('js-yaml');
const chalk = require('chalk').default;
const semver = require('semver');
const async = require('async');
const {logger} = require('@react-native-community/cli-tools');

let spinner;

(async () => {
  commander
    .option('i, init <dir>', 'Initializes a directory with an example project.')
    .option('-t, --typescript', 'Use typescript template.')
    .option('-s, --starter <version>', 'Specify the version of starter.')
    .option('-n, --npm ', 'Force usage of npm.')
    .parse(process.argv);

  if(!commander.init){
    execSync('create-react-native-unimodules-app -h', {stdio: 'inherit'});
    return;
  }

  const absoluteProjectDir = path.resolve(commander.init);
  const iosProjectDir = path.resolve(commander.init, 'ios');
  const iosPodsFile = path.resolve(iosProjectDir, `${commander.init}.xcworkspace`);
  const isUsingPods = fs.existsSync(iosPodsFile);
  const relativeXcodeProjectPath = isUsingPods?iosPodsFile:path.resolve(iosProjectDir, `${commander.init}.xcodeproj`);

  if( await fs.pathExists(commander.init) ){
    ora(chalk.gray(`The path "${absoluteProjectDir}" already exists. Please choose a different parent directory or project name.`)).fail();
    return;
  }

  spinner = ora('Parse corr.yml').start();
  const corr = yaml.safeLoad(String(await download('https://github.com/Youmenomi/react-native-unimodules-ts-starter/raw/master/corr.yml')));
  spinner.succeed();

  const STARTER_VER = commander.starter?commander.starter:corr['default'];
  if(!corr[STARTER_VER]){
    ora('The starter version you specified does not exist.').fail();
    return;
  }
  const RN_VER = corr[STARTER_VER]['react-native'];
  logger.info(`Run with starter v${STARTER_VER}`);

  initReactNative(commander.init, RN_VER, commander.typescript, commander.npm);

  await integrate(commander.init, STARTER_VER, RN_VER, commander.typescript);

  execSync(`cd ${commander.init} && ${!getYarnVersionIfAvailable()||commander.npm?'npm':'yarn'} install`, {stdio: 'inherit'});

  execSync(`cd ${path.join(commander.init, 'ios')} && pod install`, {stdio: 'inherit'});

  logger.log(`
    ${chalk.cyan(`Run instructions for ${chalk.bold('iOS')}`)}:
      • cd ${absoluteProjectDir} && react-native run-ios
      - or -
      • Open ${relativeXcodeProjectPath} in Xcode
      • Hit the Run button
    ${chalk.green(`Run instructions for ${chalk.bold('Android')}`)}:
      • Have an Android emulator running (quickest way to get started), or a device connected.
      • cd ${absoluteProjectDir} && react-native run-android
  `);

  logger.log(`    ✨ ✨ ${chalkRainbow('Successful Fusion Dance. Happy Coding!')} ✨ ✨
  `);

})();

/**
 * @param {string} dir
 * @param {string} rnv
 * @param {boolean} isTypescript
 * @param {boolean} forceNpm
 */
function initReactNative(dir, rnv, isTypescript, forceNpm) {
  let command = `react-native init ${dir} --version ${rnv}`;
  if(isTypescript) command += ' --template typescript';
  if(forceNpm) command += ' --npm';
  try {
    execSync(command, {stdio: 'inherit'});
  } catch (error) {
    ora('Command "react-native init ..." execution failed.').fail();
  }

  readline.moveCursor(process.stdout, 0, -12);
  readline.clearScreenDown(process.stdout);
}

async function rename(dir) {
  const TEMPORARY_APP_NAME =  'YourAppName';
  const TEMPORARY_APP_NAME_L_C = 'yourappname';
  const APP_NAME = commander.init;
  const APP_NAME_L_C = APP_NAME.toLowerCase();

  let files = await fs.readdir(dir);
  await async.forEach(files, async (file)=>{
    const stats = await fs.lstat(path.join(dir, file));
    const isDirectory = stats.isDirectory();

    if(file.indexOf(TEMPORARY_APP_NAME)>=0)
    {
      const newfile = file.replace(TEMPORARY_APP_NAME, APP_NAME);
      await fs.rename(path.join(dir, file), path.join(dir, newfile));
      file = newfile;
    }
    else if(file.indexOf(TEMPORARY_APP_NAME_L_C)>=0)
    {
      const newfile = file.replace(TEMPORARY_APP_NAME_L_C, APP_NAME_L_C);
      await fs.rename(path.join(dir, file), path.join(dir, newfile));
      file = newfile;
    }

    if(isDirectory)
    {
      await rename(path.join(dir, file));
    }
    else
    {
      const buffer = await fs.readFile(path.join(dir, file));
      let fileString = buffer.toString();
      fileString = fileString.replace(new RegExp(TEMPORARY_APP_NAME, "g"), APP_NAME);
      fileString = fileString.replace(new RegExp(TEMPORARY_APP_NAME_L_C, "g"), APP_NAME_L_C);
      await fs.writeFile(path.join(dir, file), fileString);
    }
  });
}

async function move(oldPath, newPath) {
  let files = await fs.readdir(oldPath);
  await async.forEach(files, async (file)=>{
    const stats = await fs.lstat(path.join(oldPath, file));
    const isDirectory = stats.isDirectory();
    if(isDirectory)
    {
      await move(path.join(oldPath, file), path.join(newPath, file));
    }
    else
    {
      await fs.move(path.join(oldPath, file), path.join(newPath, file), {overwrite:true});
    }
  });
}

async function integrate(dir, starterver, rnver, isTypescript) {
  spinner = ora('Integrating').start();
  let temp = path.join(dir, 'temp');
  
  await decompress(await download(`https://github.com/Youmenomi/react-native-unimodules-ts-starter/releases/download/0.1.0/modify-${starterver}.zip`), temp);

  await fs.remove(path.join(temp, 'package-lock.json'));
  
  if(!isTypescript){
    const tempAppjsDir = path.join(temp, 'App.js');
    await fs.rename(path.join(temp, 'App.tsx'), tempAppjsDir);
    let file = await fs.readFile(tempAppjsDir);
    let fileString = file.toString();
    await fs.writeFile(tempAppjsDir, fileString.replace('App.tsx', 'App.js'));

    await fs.remove(path.join(temp, 'package.json'));
    const packagejsonDir = path.join(dir, 'package.json');
    file = await fs.readFile(packagejsonDir);
    fileString = file.toString();
    await fs.writeFile(packagejsonDir, fileString.replace(`"react-native": "${rnver}"`, `"react-native": "${rnver}",
    "react-native-unimodules": "^0.4.1"`));
  }

  await rename(temp);
  await move(temp, dir);
  await fs.remove(temp);

  spinner.succeed();
};

//Tools

/**
 * Use Yarn if available, it's much faster than the npm client.
 * Return the version of yarn installed on the system, null if yarn is not available.
 */
function getYarnVersionIfAvailable() {
  let yarnVersion;
  try {
    // execSync returns a Buffer -> convert to string
    yarnVersion = (
      execSync('yarn --version', {
        stdio: [0, 'pipe', 'ignore'],
      }).toString() || ''
    ).trim();
  } catch (error) {
    return null;
  }
  // yarn < 0.16 has a 'missing manifest' bug
  try {
    if (semver.gte(yarnVersion, '0.16.0')) {
      return yarnVersion;
    }
    return null;
  } catch (error) {
    logger.error(`Cannot parse yarn version: ${yarnVersion}`);
    return null;
  }
}

function chalkRainbow (str) {
  if (typeof str !== 'string') {
    throw new TypeError('chalk-rainbow expected a string')
  }

  const letters = str.split('')
  const colors = ['redBright', 'yellowBright', 'greenBright', 'cyanBright', 'blueBright', 'magentaBright']
  const colorsCount = colors.length

  return letters.map((l, i) => {
    const color = colors[i%colorsCount]
    return chalk[color](l)
  }).join('')
}