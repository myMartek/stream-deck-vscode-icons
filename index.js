import * as fs from 'fs/promises';
import converter from 'svg-to-img';
import sharp from 'sharp';
import simpleGit, { CleanOptions } from 'simple-git';
import dirExists from 'directory-exists';
import path from 'path';
import { zip } from 'zip-a-folder';

const targetDir = './output/package/com.visualstudio.code.sdIconPack';

const buildCodiconSVG = async () => {
  // Checkout current vscode-codicons repository
  let gitOtions = {
    baseDir: path.join(process.cwd(), './vscode-codicons'),
  };

  if (await dirExists('./vscode-codicons')) {
    simpleGit(gitOtions)
      .clean(CleanOptions.FORCE)
      .pull();
  } else {
    simpleGit().clone('https://github.com/microsoft/vscode-codicons.git', gitOtions.baseDir);
  }

  let version = JSON.parse(await fs.readFile('./vscode-codicons/package.json', 'utf-8')).version;

  console.log(`https://github.com/microsoft/vscode-codicons.git version: ${version}`);

  return version;
};

const generateIcons = async (version) => {
  await fs.mkdir('./output/tmp', { recursive: true });
  await fs.mkdir(`${targetDir}/icons`, { recursive: true });

  let files = (await fs.readdir('./vscode-codicons/src/icons')).map(e => e.replace('.svg', ''));

  let mappings = JSON.parse(await fs.readFile('./vscode-codicons/src/template/mapping.json'));

  let icons = {};

  files.forEach(name => {
    let id = mappings[name];

    icons[id] = {
      name,
      tags: [],
      path: `${name}.png`
    };
  });

  icons = Object.values(Object.keys(mappings).reduce((last, name) => {
    let id = mappings[name];

    if (last[id].name !== name) {
      last[id].tags.push(name);
    }

    return last;
  }, icons));

  let promises = icons.map(async file => {
    let name = file.name;

    let icon = await fs.readFile(`./vscode-codicons/src/icons/${name}.svg`, 'utf-8');
    icon = icon.replace('currentColor', 'white');

    await converter.from(icon).toPng({
      path: `./output/tmp/${name}.png`,
      width: 64,
      height: 64
    });

    await sharp({
      create: {
        width: 128,
        height: 128,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      }
    }).composite([
      {
        input: `./output/tmp/${name}.png`,
        top: 32,
        left: 32,
      },
    ]).png()
      .toFile(`${targetDir}/icons/${name}.png`);
  });

  await Promise.all(promises);

  await fs.writeFile(`${targetDir}/icons.json`, JSON.stringify(icons, null, 2));

  await fs.cp('./assets/cover.png', `${targetDir}/cover.png`);
  await fs.cp('./assets/icon.png', `${targetDir}/icon.png`);
  await fs.cp('./assets/license.txt', `${targetDir}/license.txt`);

  let manifest = JSON.parse(await fs.readFile('./assets/manifest.json'));

  manifest.Version = version;

  await fs.writeFile(`${targetDir}/manifest.json`, JSON.stringify(manifest, null, 2));
};

const run = async () => {
  let version = await buildCodiconSVG();
  await generateIcons(version);

  await zip('./output/package', './output/com.visualstudio.code.sdIconPack.streamDeckIconPack');

  console.log('com.visualstudio.code.sdIconPack.streamDeckIconPack written.');
};

run();
