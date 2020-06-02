const fs = require('fs');

const MODE = {
  DRAWABLE: 'drawable',
  COLOR: 'color',
  DIMEN: 'dimen',
  LAYOUT: 'layout'
};

const ALLOWED_EXTENSIONS = ['java', 'kt', 'xml'];

const mode = process.argv[2];
const rootDir = process.argv[3];
const resourcesPath = process.argv[4];

const findUnusedResources = async (rootDir, resourcesPath, mode) => {
  const modules = await findAllModules(rootDir);
  
  const modulesSources = await Promise.all(modules.map(it => findAllSourceFiles(it + '/src')));

  const sources = modulesSources.reduce((prev, cur) => prev.concat(cur), []);

  const resources = await retrieveResources(resourcesPath, mode);
  
  const usedResourcesPerFile = await Promise.all(sources.map(it => findResourcesUsedInFile(it, resources, mode)));

  const usedResources = usedResourcesPerFile.reduce((prev, cur) => prev.concat(cur), []);

  const unusedResources = resources.filter(name => usedResources.find(it => it === name) == null);

  if (mode === MODE.DRAWABLE || mode === MODE.LAYOUT) {
    await Promise.all(unusedResources.map(it => unlink(resourcesPath + '/' + it + '.xml')));
  }
  return unusedResources;
}

const retrieveResources = async (resourcesPath, mode) => {
  const retrieveFileResources = async () => {
    const resources = await readdir(resourcesPath);
    return resources.map(it => it.split('.')[0]);
  };

  const retrieveResourcesFromFile = async () => {
    const data = await readFile(resourcesPath);
    const tokens = data.split('\n');
    const tag = resourceXmlTag(mode);
    const regex = new RegExp(`${ tag } name="(.*)"`);
    return tokens
      .map(token => {
        const match = token.match(regex);
        if (match != null) {
          return match[1];
        }
        return null;
      })
      .filter(it => it != null);
  };

  if (resourcesPath.endsWith('.xml')) {
    const result = await retrieveResourcesFromFile();
    return result;
  } else {
    const result = await retrieveFileResources();
    return result;
  }
}

const findResourcesUsedInFile = async (file, resources, mode) => {
  const data = await readFile(file);

  const codePrefix = codePrefixFromMode(mode);
  const xmlPrefix = xmlPrefixFromMode(mode);
  return resources.filter(it => data.includes(`${ codePrefix }${ it }`) || data.includes(`${ xmlPrefix }${ it }`));
};

const resourceXmlTag = mode => {
  switch (mode) {
    case MODE.COLOR:
      return 'color';
    case MODE.DIMEN:
      return 'dimen';
    default:
      throw new Error(`Unknown mode ${ mode }`);
  }
};

const codePrefixFromMode = mode => {
  switch (mode) {
    case MODE.DRAWABLE:
      return 'R.drawable.';
    case MODE.COLOR:
      return 'R.color.';
    case MODE.DIMEN:
      return 'R.dimen.';
    case MODE.LAYOUT:
      return 'R.layout.';
    default:
      throw new Error(`Unknown mode ${ mode }`);
  }
};

const xmlPrefixFromMode = mode => {
  switch (mode) {
    case MODE.DRAWABLE:
      return 'drawable/';
    case MODE.COLOR:
      return 'color/';
    case MODE.DIMEN:
      return 'dimen/';
    case MODE.LAYOUT:
      return 'layout/';
    default:
      throw new Error(`Unknown mode ${ mode }`);
  }
};

const findAllModules = async rootDir => {
  const isModule = async dir => {
    const entries = await readdir(dir);
    return entries.find(it => it === 'build.gradle') != null;
  };

  const entries = await readdir(rootDir);
  const entriesWithFullPath = entries.map(it => rootDir + '/' + it);
  const stats = await Promise.all(entriesWithFullPath.map(it => stat(it)));
  const dirs = entriesWithFullPath.filter((_, index) => stats[index].isDirectory());
  const whetherModules = await Promise.all(dirs.map(it => isModule(it)));

  const modules = dirs.filter((_, index) => whetherModules[index]);

  const innerModules = await Promise.all(modules.map(it => findAllModules(it)));
  
  return modules.concat(innerModules.reduce((prev, cur) => prev.concat(cur), []));
};

const findAllSourceFiles = async dir => {
  const entries = await readdir(dir);
  const entriesWithFullPath = entries.map(it => dir + '/' + it);
  const stats = await Promise.all(entriesWithFullPath.map(it => stat(it)));
  const files = entriesWithFullPath
    .filter((_, index) => stats[index].isFile())
    .filter(it => ALLOWED_EXTENSIONS.find(ext => it.endsWith(ext)) != null);
  const dirs = entriesWithFullPath.filter((_, index) => stats[index].isDirectory());

  const subFiles = await Promise.all(dirs.map(it => findAllSourceFiles(it)));

  return files.concat(subFiles.reduce((prev, cur) => prev.concat(cur), []));
};

const readdir = async dir => {
  return new Promise((resolve, reject) => {
    fs.readdir(dir, (error, files) => {
      if (error == null) {
        return resolve(files);
      }
      return reject(error);
    });
  });
};

const stat = async file => {
  return new Promise((resolve, reject) => {
    fs.stat(file, (error, result) => {
      if (error == null) {
        return resolve(result);
      }
      return reject(error);
    });
  });
};

const readFile = async file => {
  return new Promise((resolve, reject) => {
    fs.readFile(file, 'utf8', (error, result) => {
      if (error == null) {
        return resolve(result);
      }
      return reject(error);
    });
  });
};

const unlink = async file => {
  return new Promise((resolve, reject) => {
    fs.unlink(file, (error, result) => {
      if (error == null) {
        return resolve(result);
      }
      return reject(error);
    });
  });
};

findUnusedResources(rootDir, resourcesPath, mode)
  .then(it => {
    console.log('Success');
    console.log(`Deleted ${ it.length } resources`);
    console.log(it);
    process.exit(0);
  })
  .catch(error => {
    console.log(`Error: ${ error.message }`);
    console.log(error.stack);
    process.exit(1);
  });

