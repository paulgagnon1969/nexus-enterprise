const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Make Metro aware of the monorepo root so it can resolve dependencies from the
// root node_modules and follow workspace symlinks.
config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Avoid Metro traversing up the filesystem looking for node_modules in odd
// places (common in monorepos).
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
