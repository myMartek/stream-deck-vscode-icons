import * as fs from 'fs/promises';
import { JSDOM } from 'jsdom';
import SVGPathCommander from 'svg-path-commander';
import jq from 'jquery';
import simpleGit, { CleanOptions } from 'simple-git';
import dirExists from 'directory-exists';
import path from 'path';
import { zip } from 'zip-a-folder';

const { window } = new JSDOM();
const $ = jq(window);
const targetDir = './output/package/com.visualstudio.code.sdIconPack';

const copyDir = async (src, dest) => {
  const entries = await fs.readdir(src, { withFileTypes: true });
  await fs.mkdir(dest, { recursive: true } );

  for(let entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
          await copyDir(srcPath, destPath);
      } else {
          await fs.copyFile(srcPath, destPath);
      }
  }
};

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
      path: `${name}.svg`
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

    let html = $('<div />').append(icon);

    let originalSize = parseInt(html.find('svg').attr('width'), 10);

    html.find('svg')
      .attr('width', '144')
      .attr('height', '144')
      .removeAttr('viewBox');

    html.find('path').toArray().forEach(el => {
      let jqel = $(el);
      let path = jqel.attr('d');
      let padding = 32;
      let newPath = new SVGPathCommander(path).transform({
        translate: [padding, padding],
        scale: (144 - (padding * 2)) / originalSize,
        origin: [0, 0]
      }).toString();
      
      jqel.attr('d', newPath);
    });
    
    icon = html.html();

    fs.writeFile(`${targetDir}/icons/${name}.svg`, icon);
  });

  await Promise.all(promises);

  await fs.writeFile(`${targetDir}/icons.json`, JSON.stringify(icons, null, 2));

  await fs.cp('./assets/cover.png', `${targetDir}/cover.png`);
  await fs.cp('./assets/icon.png', `${targetDir}/icon.png`);
  await fs.cp('./assets/license.txt', `${targetDir}/license.txt`);
  await copyDir('./assets/previews', `${targetDir}/previews`);

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
