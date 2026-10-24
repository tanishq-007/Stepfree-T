// Lets TypeScript resolve side-effect stylesheet imports such as `import "./globals.css"`.
// Next.js only declares `*.module.css`, so plain `.css` imports need this when
// side-effect imports are checked (e.g. by newer editor TypeScript versions).
declare module "*.css";
