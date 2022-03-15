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

/**
 * Copies a directory with all its children from a to b
 * @param {string} src 
 * @param {string} dest 
 */
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

/**
 * Checkout the recent version of microsofts codicons repository
 * @returns version number of microsofts repository
 */
const checkoutVSCodeCodIconsRepo = async () => {
  let gitOtions = {
    baseDir: path.join(process.cwd(), './vscode-codicons'),
  };

  if (await dirExists(gitOtions.baseDir)) {
    // clean and pull
    simpleGit(gitOtions)
      .clean(CleanOptions.FORCE)
      .pull();
  } else {
    // Checkout current vscode-codicons repository
    await simpleGit().clone('https://github.com/microsoft/vscode-codicons.git', gitOtions.baseDir);
  }

  // Get version number from microsoft
  let version = JSON.parse(await fs.readFile(path.join(gitOtions.baseDir, 'package.json'), 'utf-8')).version;

  console.log(`https://github.com/microsoft/vscode-codicons.git version: ${version}`);

  return version;
};

/**
 * Generates plugin files
 * @param {string} version 
 */
const generateIcons = async (version) => {
  // Create temp directories
  await fs.mkdir('./output/tmp', { recursive: true });
  await fs.mkdir(`${targetDir}/icons`, { recursive: true });

  // Get SVG source files
  let files = (await fs.readdir('./vscode-codicons/src/icons')).map(e => e.replace('.svg', ''));

  // Read mappings in order to generate tags on icons
  let mappings = JSON.parse(await fs.readFile('./vscode-codicons/src/template/mapping.json'));

  let icons = {};

  // initialize icons object with name, path and empty tags
  files.forEach(name => {
    let id = mappings[name];

    icons[id] = {
      name,
      tags: [],
      path: `${name}.svg`
    };
  });

  // For each mapping check if there is already an entry. If not add the name to the tag list
  icons = Object.values(Object.keys(mappings).reduce((last, name) => {
    let id = mappings[name];

    if (last[id].name !== name) {
      last[id].tags.push(name);
    }

    return last;
  }, icons));

  // Update each icon to match Stream Deck layout and size
  const promises = icons.map(async file => {
    let name = file.name;

    // read the icons source
    let icon = await fs.readFile(`./vscode-codicons/src/icons/${name}.svg`, 'utf-8');

    // Append the icon to a jQuery div for easier manipulation
    let html = $('<div />').append(icon);

    // Find out the original icon size
    let originalSize = parseInt(html.find('svg').attr('width'), 10);

    // Set target color and size
    html.find('svg')
      .attr('width', '144')
      .attr('height', '144')
      .attr('fill', 'white')
      .removeAttr('viewBox');

    // Transform each path object of the svg to fit into new size
    html.find('path').toArray().forEach(el => {
      let jqel = $(el);
      let path = jqel.attr('d');

      // icon padding for all directions
      let padding = 32;

      let newPath = new SVGPathCommander(path).transform({
        translate: [padding, padding], // move to the padding size
        scale: (144 - (padding * 2)) / originalSize, // calculate the scale depending on padding and original size
        origin: [0, 0]
      }).toString();
      
      jqel.attr('d', newPath);
    });
    
    icon = html.html();

    // Write the new svg file to the target directory
    fs.writeFile(`${targetDir}/icons/${name}.svg`, icon);
  });

  // Wait for all icons to complete
  await Promise.all(promises);

  // Save all icon information
  await fs.writeFile(`${targetDir}/icons.json`, JSON.stringify(icons, null, 2));

  // Copy assets
  await fs.cp('./assets/cover.png', `${targetDir}/cover.png`);
  await fs.cp('./assets/icon.png', `${targetDir}/icon.png`);
  await fs.cp('./assets/license.txt', `${targetDir}/license.txt`);
  await copyDir('./assets/previews', `${targetDir}/previews`);

  // Set manifest version and save it to the target directory
  let manifest = JSON.parse(await fs.readFile('./assets/manifest.json'));

  manifest.Version = version;

  await fs.writeFile(`${targetDir}/manifest.json`, JSON.stringify(manifest, null, 2));
};

/**
 * Helper function needed for running the async methods
 */
(async () => {
  // Checkout microsofts original repository
  let version = await checkoutVSCodeCodIconsRepo();

  // Generate icon plugin directory
  await generateIcons(version);

  // create streamDeckIconPack zip file
  await zip('./output/package', './output/com.visualstudio.code.sdIconPack.streamDeckIconPack');
  console.log('com.visualstudio.code.sdIconPack.streamDeckIconPack written.');
})();
