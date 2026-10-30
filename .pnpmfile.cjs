// typescript-eslint (and the Next.js lint config built on it) still needs the
// TypeScript 6 API. Give those packages their own TypeScript 6 copy, so tsc and
// next build keep using TypeScript 7.
const NEEDS_TS6 =
  /^(typescript-eslint|@typescript-eslint\/.+|ts-api-utils|eslint-config-next|tsconfig-paths)$/

module.exports = {
  hooks: {
    readPackage(pkg) {
      if (NEEDS_TS6.test(pkg.name) && pkg.peerDependencies?.typescript) {
        delete pkg.peerDependencies.typescript
        if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta.typescript
        pkg.dependencies = { ...pkg.dependencies, typescript: '6.0.3' }
      }
      return pkg
    },
  },
}
