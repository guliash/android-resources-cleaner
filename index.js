const fs = require('fs');

const ALLOWED_EXTENSIONS = ['java', 'kt', 'xml'];

const rootDir = process.argv[2];
const resourcesDir = process.argv[3];

const findUnusedResources = async (rootDir, resourcesDir) => {
  const modules = await findAllModules(rootDir);
  
  const modulesSources = await Promise.all(modules.map(it => findAllSourceFiles(it + '/src')));

  const sources = modulesSources.reduce((prev, cur) => prev.concat(cur), []);

  const resources = await readdir(resourcesDir);

  const resourcesNames = resources.map(it => it.split('.')[0]);
  
  const usedResourcesPerFile = await Promise.all(sources.map(it => findResourcesUsedInFile(it, resourcesNames)));

  const usedResources = usedResourcesPerFile.reduce((prev, cur) => prev.concat(cur), []);

  const unusedResources = resourcesNames.filter(name => usedResources.find(it => it === name) == null);

  await Promise.all(unusedResources.map(it => unlink(resourcesDir + '/' + it + '.xml')));
  return unusedResources;
}

const findResourcesUsedInFile = async (file, resources) => {
  const data = await readFile(file);

  return resources.filter(it => data.includes(`R.drawable.${ it }`) || data.includes(`drawable/${ it }`));
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
    fs.readFile(file, (error, result) => {
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

findUnusedResources(rootDir, resourcesDir)
  .then(it => {
    console.log('Success');
    console.log(`Deleted ${ it.length } resources`);
    process.exit(0);
  })
  .catch(error => {
    console.log(`Error: ${ error.message }`);
    console.log(error.stack);
    process.exit(1);
  });

